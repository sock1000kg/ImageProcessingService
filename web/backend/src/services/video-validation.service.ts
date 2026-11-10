import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config";
import { badRequest, unavailable } from "../errors";
import { getObjectStream, UPLOADS_BUCKET } from "../storage";

const execFileAsync = promisify(execFile);

type ProbeResult = {
  streams?: Array<{ codec_type?: string; codec_name?: string }>;
  format?: { duration?: string };
};

export async function validateUploadedVideo(objectKey: string): Promise<void> {
  const object = await getObjectStream(UPLOADS_BUCKET, objectKey);
  if (!object) throw badRequest("Uploaded video is missing", "INVALID_INPUT_FILE");
  if (!object.contentLength) throw badRequest("Video file is empty", "INVALID_INPUT_FILE");

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "imgproc-video-"));
  const tempFile = path.join(tempDir, "input.mp4");
  try {
    await pipeline(object.stream, createWriteStream(tempFile));
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        config.FFPROBE_BIN,
        ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name", "-of", "json", tempFile],
        { timeout: 15_000, windowsHide: true },
      ));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        throw unavailable(
          "ffprobe is required to validate MP4 duration and H.264 codec",
          "VIDEO_VALIDATION_UNAVAILABLE",
        );
      }
      throw badRequest("Video could not be read as a valid MP4 file", "INVALID_INPUT_FILE");
    }

    let probe: ProbeResult;
    try {
      probe = JSON.parse(stdout) as ProbeResult;
    } catch {
      throw badRequest("Video metadata is invalid", "INVALID_INPUT_FILE");
    }
    const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
    const durationSeconds = Number(probe.format?.duration);
    if (!videoStream || !Number.isFinite(durationSeconds)) {
      throw badRequest("Video metadata is incomplete", "INVALID_INPUT_FILE");
    }
    if (durationSeconds < 15 || durationSeconds > 60) {
      throw badRequest("Video duration must be between 15 and 60 seconds", "VIDEO_DURATION_OUT_OF_RANGE");
    }
    if (videoStream.codec_name?.toLowerCase() !== "h264") {
      throw badRequest("Video codec must be H.264", "VIDEO_CODEC_UNSUPPORTED");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
