/**
 * Turns a video's tracks into the detection shape the report uses, and filters out tracker flicker.
 */
import { ImageDetectionSummary } from "./batch.dto";

/**
 * A tracker flickers: most tracks in a street video last under half a second and dip below the review threshold for
 * a few frames. Those are not worth a person's time, so a video track is only reviewed when it lasts at least
 * VIDEO_MIN_TRACK_MS and has a low-confidence or gap stretch of at least VIDEO_MIN_RANGE_MS.
 */
export const VIDEO_MIN_TRACK_MS = 500;
export const VIDEO_MIN_RANGE_MS = 250;

type TrackLike = Record<string, unknown>;

export function rangesOf(source: object, key: string): Array<[number, number]> {
  const value = (source as TrackLike)[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (range): range is [number, number] =>
      Array.isArray(range) && range.length === 2 && range.every((part) => typeof part === "number"),
  );
}

export function formatRange([start, end]: [number, number]): string {
  // Tenths of a second: stretches are often under a second, so whole seconds would print "0:07–0:07".
  const clock = (ms: number) => {
    const tenths = Math.floor(ms / 100);
    return `${Math.floor(tenths / 600)}:${String(Math.floor((tenths % 600) / 10)).padStart(2, "0")}.${tenths % 10}`;
  };
  return `${clock(start)}–${clock(end)}`;
}

/**
 * Maps the Engine's video tracks onto the image detection shape so the report counts and review rules apply to
 * video too. A track with low-confidence stretches is "low confidence"; one with gaps (frames where it was lost
 * and may not be redacted, the biggest video risk) is flagged as needing review.
 */
export function videoTracksAsDetections(tracks: unknown): ImageDetectionSummary[] {
  if (!Array.isArray(tracks)) return [];
  return tracks.map((raw) => {
    const track = raw as TrackLike;
    const box =
      Array.isArray(track.box) && track.box.length === 4 ? (track.box as [number, number, number, number]) : undefined;
    const lasted =
      typeof track.endMs === "number" && typeof track.startMs === "number" ? track.endMs - track.startMs : 0;
    const longRanges = (key: string) =>
      lasted >= VIDEO_MIN_TRACK_MS ? rangesOf(track, key).filter(([from, to]) => to - from >= VIDEO_MIN_RANGE_MS) : [];
    const lowConfidenceRanges = longRanges("lowConfidenceRanges");
    const gapRanges = longRanges("gapRanges");
    return {
      label: typeof track.label === "string" ? track.label : undefined,
      confidence: typeof track.meanConfidence === "number" ? track.meanConfidence : undefined,
      box,
      redacted: typeof track.redacted === "boolean" ? track.redacted : undefined,
      whitelisted: typeof track.whitelisted === "boolean" ? track.whitelisted : undefined,
      lowConfidence: lowConfidenceRanges.length > 0,
      similarity: typeof track.similarity === "number" ? track.similarity : undefined,
      whitelistRef: typeof track.whitelistRef === "number" ? track.whitelistRef : undefined,
      trackId: track.trackId,
      startMs: track.startMs,
      endMs: track.endMs,
      bestFrameMs: track.bestFrameMs,
      lowConfidenceRanges,
      gapRanges,
    };
  });
}

/** Time fields a video track adds to its report detection (absent for images). */
export function videoTrackFields(detection: ImageDetectionSummary): {
  trackId?: number;
  startMs?: number;
  endMs?: number;
  bestFrameMs?: number;
} {
  const source = detection as TrackLike;
  const out: { trackId?: number; startMs?: number; endMs?: number; bestFrameMs?: number } = {};
  if (typeof source.bestFrameMs === "number") out.bestFrameMs = source.bestFrameMs;
  if (typeof source.trackId === "number") out.trackId = source.trackId;
  if (typeof source.startMs === "number") out.startMs = source.startMs;
  if (typeof source.endMs === "number") out.endMs = source.endMs;
  return out;
}
