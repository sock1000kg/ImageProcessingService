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

/**
 * Checks a finished video upload before a job is created for it, and throws if the Engine could not process it.
 *
 * Why here and not on the Engine: a bad video would otherwise wait in the queue and burn a worker for minutes before
 * failing. Why ffprobe on a temp copy: the video arrives in parts straight into MinIO, so the backend never holds the
 * whole file; ffprobe needs a real file to read the container.
 */
export async function validateUploadedVideo(objectKey: string): Promise<void> {
  // 1. The assembled object must exist and not be empty.
  const object = await getObjectStream(UPLOADS_BUCKET, objectKey);
  if (!object) throw badRequest("Uploaded video is missing", "INVALID_INPUT_FILE");
  if (!object.contentLength) throw badRequest("Video file is empty", "INVALID_INPUT_FILE");

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "imgproc-video-"));
  const tempFile = path.join(tempDir, "input.mp4");
  try {
    await pipeline(object.stream, createWriteStream(tempFile));
    // 2. ffprobe must be able to read it as a media file at all (fails for a renamed or truncated file).
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
    // 3. It must contain a video stream with a duration (rules out audio-only or unreadable metadata).
    const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
    const durationSeconds = Number(probe.format?.duration);
    if (!videoStream || !Number.isFinite(durationSeconds)) {
      throw badRequest("Video metadata is incomplete", "INVALID_INPUT_FILE");
    }
    // 4. Length limits come from env (VIDEO_MIN/MAX_DURATION_SECONDS): processing time grows with the number of
    // frames, so this is what keeps jobs predictable on CPU workers. File size is no stand-in for it, since bitrates vary.
    const { VIDEO_MIN_DURATION_SECONDS: minSeconds, VIDEO_MAX_DURATION_SECONDS: maxSeconds } = config;
    if (durationSeconds < minSeconds || durationSeconds > maxSeconds) {
      throw badRequest(
        `Video duration must be between ${minSeconds} and ${maxSeconds} seconds`,
        "VIDEO_DURATION_OUT_OF_RANGE",
      );
    }
    // 5. Codec must be H.264, the only one the Engine's decoder and the browser player are set up for.
    if (videoStream.codec_name?.toLowerCase() !== "h264") {
      throw badRequest("Video codec must be H.264", "VIDEO_CODEC_UNSUPPORTED");
    }
  } finally {
    // The temp copy is always removed, whether the video passed or not.
    await rm(tempDir, { recursive: true, force: true });
  }
}
