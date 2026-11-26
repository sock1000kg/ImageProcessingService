"""Video Redaction Processor for 'video-redact' job type.

Complies strictly with Contract §2B, §3 B2, and §4:
- Reads input MP4 H.264 video.
- Two-Pass Architecture:
  * Pass 1: Detection & Object Tracking (YOLOv8 + ByteTrack) across all frames.
  * Linear Bounding Box Interpolation (bridges dropouts <= 167 ms to eliminate flicker).
  * Records lowConfidenceRanges and gapRanges per Contract §3 B2.
  * Best Face Frame Selection: scores crops by confidence, area, and Laplacian sharpness.
  * Milestone 2 (Phase 2): Track-Level Face Whitelisting (ArcFace 512-d).
    - Compares up to 3 candidate pool crops with ArcFace.
    - Matches cosine similarity with params.whitelist.faces.
    - Propagates whitelist status across broken track pieces (spatial-temporal inheritance).
    - Synchronous global redacted/whitelisted flag across all frames of the track.
  * Pass 2: Masks redacted targets with boundary padding and pipes frames to FFmpeg.
- Preserves 100% original audio stream via FFmpeg remux (-c:a copy) without re-encoding.
- Preserves native video resolution and framerate (fps).
- Emits throttled progress events (maximum 1 event per 2 seconds).
- Maps output quality to H.264 CRF (standard: 28, high: 23, max: 18).
- Cleans up all temporary files in /tmp to honor read-only root filesystems.
"""
import os
import time
import math
import json
import logging
import tempfile
import subprocess
import shutil
from dataclasses import dataclass
from typing import Tuple, Dict, Any, Optional, List, Callable
import numpy as np
import cv2

from .base import (
    BaseProcessor,
    get_detection_mode_config,
    parse_confidence_thresholds,
    resolve_model_path,
    DEFAULT_FACE_SIMILARITY,
    DEFAULT_REVIEW_THRESHOLD,
    DEFAULT_REDACTION_STRENGTHS,
    apply_redaction_style,
)
from .image_redact import InvalidInputFileError
from .face_embedding import FaceEmbedder
from .whitelist import WhitelistManager
from .plate_ocr import PlateWhitelistManager
from src.config import settings

logger = logging.getLogger(__name__)


def resolve_ffmpeg_bin(custom_path: Optional[str] = None) -> str:
    """Resolve usable ffmpeg binary.

    Resolution order:
    1. Explicit custom_path if existing on disk or executable in PATH.
    2. 'ffmpeg' executable found in system PATH.
    3. Bundled binary via `imageio_ffmpeg.get_ffmpeg_exe()`.
    4. Fallback string 'ffmpeg'.
    """
    if custom_path and custom_path != "ffmpeg":
        if os.path.exists(custom_path) or shutil.which(custom_path):
            return custom_path

    found = shutil.which("ffmpeg")
    if found:
        return found

    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.exists(exe):
            return exe
    except Exception:
        pass

    return custom_path or "ffmpeg"


def resolve_ffprobe_bin(custom_path: Optional[str] = None) -> str:
    """Resolve usable ffprobe binary."""
    if custom_path and custom_path != "ffprobe":
        if os.path.exists(custom_path) or shutil.which(custom_path):
            return custom_path

    found = shutil.which("ffprobe")
    if found:
        return found

    return custom_path or "ffprobe"


# Contract §2 CRF mapping for H.264 video encoding
CRF_MAP: Dict[str, int] = {
    "standard": 28,
    "high": 23,  # default
    "max": 18,
}

# Frames x264 buffers ahead to place B-frames and share bitrate (preset "fast" uses 30).
# Why: each buffered frame costs several MB at 1440p; 10 frames cut the encoder's peak RAM from about 1.1 GB to
# 0.74 GB on a 2560x1440 clip, at the cost of slightly less efficient compression. It saves memory on any machine
# without capping threads, which stay sized by x264 to the host.
X264_RC_LOOKAHEAD = 10

# Maximum time dropout to bridge with linear interpolation (167 ms).
# A time limit means the same protection at any frame rate.
MAX_INTERPOLATION_GAP_MS = 167


def max_gap_frames_for_fps(fps: float) -> int:
    """Calculate maximum gap frames to bridge based on video frame rate."""
    return max(1, round(fps * MAX_INTERPOLATION_GAP_MS / 1000))


# Hold blur around detected frames (200 ms).
# A face can be visible just before and after it's detected.
TRACK_HOLD_MS = 200


def hold_frames_for_fps(fps: float) -> int:
    """Calculate hold frames around detected frames based on video frame rate."""
    return max(1, round(fps * TRACK_HOLD_MS / 1000))


# Plate crops read by OCR: the first 5 of the track's candidate pool (widest per time window, then the widest
# overall).
# Why: the first frames of a track are usually the plate coming into view, small or half hidden; read alone they gave
# garbage that made a long track on the owner's plate count as a stranger. No minimum width: OCR still matches 37 px
# plates, and the widest crops already skip small ones when the track has larger (video bench, 2026-11-20).
PLATE_OCR_CANDIDATES = 5

# Face crops compared by ArcFace for the whitelist: the first 3 of the track's candidate pool (best quality per
# time window, then best overall). Each crop is aligned with YuNet when possible, else resized
# (FaceEmbedder.extract_embedding).
# Why: a single crop missed owners caught at a bad angle in that one frame. Preferring crops YuNet can align
# changed no result on the video bench (2026-11-25), so the pool order alone decides.
FACE_ARCFACE_CANDIDATES = 3

# Pool size as a multiple of the crops compared per track (top_n).
# Why: the time-window part then holds exactly the crops compared, so a long track compares crops from different
# 500 ms windows, and the top part holds as many again to top up short tracks. Crops past that were never read
# (video bench, 2026-11-25).
CANDIDATE_POOL_FACTOR = 2

# Time window for the pool: at most one crop per 500 ms window is kept in its time part.
# Why: the crops compared tend to come from different moments instead of neighbouring, near-identical frames.
CANDIDATE_WINDOW_MS = 500

# Maximum temporal gap in milliseconds to bridge between track pieces during whitelist inheritance.
# Why: replaces the old 15-45 frame clamp (which shrank the gap to 0.9 s at 50 fps and stretched it past 1.5 s
# below 10 fps) with a consistent 1.5-second physical time window across all frame rates.
INHERIT_MAX_GAP_MS = 1500

# Near temporal gap in milliseconds allowed when bounding boxes do not overlap in IoU but center distance is within tolerance.
# Why: allows bridging pieces when an object moves quickly during a brief occlusion (up to 1.0 s) if spatial center distance remains bounded.
INHERIT_NEAR_GAP_MS = 1000

# Maximum duration in milliseconds of concurrent/overlapping frames considered for Case C duplicate track inheritance.
# Why: tracker splits or re-identifications can create brief parallel tracks for up to 0.5 s (replaces hardcoded 15 frames).
INHERIT_OVERLAP_MS = 500

# Minimum IoU required to connect sequential track pieces in Case A and B without distance restriction.
# Why: spatial overlap between consecutive pieces of the same trajectory indicates the object remained in the same position.
INHERIT_MIN_IOU = 0.10

# Minimum IoU on common frames required for concurrent track pieces in Case C.
# Why: concurrent tracks in the same time frame must significantly overlap spatially to ensure they represent the same physical entity.
INHERIT_OVERLAP_MIN_IOU = 0.25

# Center distance tolerance factor relative to the seed bounding box size.
# Why: larger objects move across more pixels per frame than smaller ones when in motion.
INHERIT_CENTER_DIST_FACTOR = 1.5

# Distance floor in pixels for license plate inheritance.
# Why: plate boxes are small, so 1.5x their size is too tight to bridge camera shake and bumps between pieces;
# plates always get at least this much centre-distance tolerance.
PLATE_INHERIT_MIN_DIST_PX = 90

# Minimum plate text length required to treat a non-matching OCR read as a distinct stranger plate.
# Why: 1-2 character fragments are usually partial/noisy reads on the owner's plate, whereas 3+ readable
# characters that do not match the whitelist indicate a different vehicle that must not inherit.
PLATE_INHERIT_BLOCK_MIN_CHARS = 3

# Distance floor in pixels for face inheritance.
# Why: people standing side by side are often less than 90 px apart, so faces have no artificial floor.
FACE_INHERIT_MIN_DIST_PX = 0

# Minimum similarity threshold below which a face track is explicitly blocked from inheriting whitelist status.
# Why: a track piece scoring below 0.30 against all whitelist references clearly depicts someone else.
FACE_INHERIT_BLOCK_SIMILARITY = 0.30


def frames_for_ms(fps: float, ms: int) -> int:
    """Convert a duration in milliseconds to a frame count at the given frame rate."""
    return max(1, round(fps * ms / 1000))


@dataclass
class VideoMetadata:
    """Metadata extracted from the input video."""
    width: int
    height: int
    fps: float
    duration_ms: int
    frames: int
    has_audio: bool
    codec: str = "h264"


@dataclass
class TrackDetection:
    """Detection state for an object in a specific video frame."""
    frame_idx: int
    frame_ms: int
    box: List[int]  # [x1, y1, x2, y2]
    confidence: float
    is_interpolated: bool = False


@dataclass
class CropCandidate:
    """A crop kept for whitelist matching, with the frame it came from.

    score: ranking value inside a CandidatePool (width for plates, quality score for faces).
    """
    frame_idx: int
    frame_ms: int
    crop: np.ndarray
    score: float = 0.0


class CandidatePool:
    """Keeps candidate crops for whitelist matching across time windows and top overall scores.

    The pool maintains two parts:
    1. Time windows: the best crop per window_ms, holding up to capacity - top_n windows (by default
       as many as are compared), spreading candidates across the track duration.
    2. Top crops: the best top_n crops of the whole track regardless of time (top_n crops).
    Why: bounds RAM on long tracks while guaranteeing short tracks are topped up to the comparison budget,
    and the best crop overall is never dropped.
    """

    def __init__(
        self,
        top_n: int,
        capacity: Optional[int] = None,
        window_ms: int = CANDIDATE_WINDOW_MS,
    ) -> None:
        """Initialize CandidatePool with top_n, capacity, and window_ms constraints."""
        if capacity is None:
            capacity = CANDIDATE_POOL_FACTOR * top_n
        if not (0 < top_n < capacity):
            raise ValueError(f"top_n must satisfy 0 < top_n < capacity (got top_n={top_n}, capacity={capacity})")
        self._top_n: int = top_n
        self._window_capacity: int = capacity - top_n
        self._window_ms: int = window_ms
        self._by_window: Dict[int, CropCandidate] = {}
        self._top: List[CropCandidate] = []

    def add(self, frame_idx: int, frame_ms: int, crop: Optional[np.ndarray], score: float) -> None:
        """Keep the crop if it is the best of its time window or among the track's top_n; ignore None/empty crops.

        Ties keep the earlier crop. When a part is full, its lowest-score crop makes room.
        """
        if crop is None or crop.size == 0:
            return

        window = frame_ms // self._window_ms

        if window in self._by_window:
            keep_window = score > self._by_window[window].score
        else:
            if len(self._by_window) < self._window_capacity:
                keep_window = True
            else:
                lowest_win_key = min(self._by_window.keys(), key=lambda w: self._by_window[w].score)
                keep_window = score > self._by_window[lowest_win_key].score

        if len(self._top) < self._top_n:
            keep_top = True
        else:
            lowest_top_idx = min(range(len(self._top)), key=lambda i: self._top[i].score)
            keep_top = score > self._top[lowest_top_idx].score

        if not keep_window and not keep_top:
            return

        # One object shared by both parts, copied only when kept, so a rejected crop costs no memory.
        candidate = CropCandidate(frame_idx=frame_idx, frame_ms=frame_ms, crop=crop.copy(), score=score)

        if keep_window:
            if window not in self._by_window and len(self._by_window) >= self._window_capacity:
                lowest_win_key = min(self._by_window.keys(), key=lambda w: self._by_window[w].score)
                del self._by_window[lowest_win_key]
            self._by_window[window] = candidate

        if keep_top:
            if len(self._top) >= self._top_n:
                lowest_top_idx = min(range(len(self._top)), key=lambda i: self._top[i].score)
                del self._top[lowest_top_idx]
            self._top.append(candidate)

    def ordered(self) -> List[CropCandidate]:
        """Return window crops (best first), then the remaining top crops (best first).

        Why window crops come first: callers take the first few, which should come from different moments. The top
        crops only top up short tracks that have fewer windows than the caller needs.
        """
        window_crops = sorted(self._by_window.values(), key=lambda c: c.score, reverse=True)
        seen_frame_indices = {c.frame_idx for c in window_crops}
        result = list(window_crops)
        for c in sorted(self._top, key=lambda c: c.score, reverse=True):
            if c.frame_idx not in seen_frame_indices:
                result.append(c)
                seen_frame_indices.add(c.frame_idx)
        return result

    def __len__(self) -> int:
        """Return the number of unique candidate crops in the pool."""
        return len(self.ordered())

    def clear(self) -> None:
        """Empty both window and top containers to release crop memory."""
        self._by_window.clear()
        self._top.clear()


class Track:
    """Represents a continuous trajectory of a tracked face or license plate."""

    def __init__(self, track_id: int, label: str):
        self.track_id = track_id
        self.label = label
        self.detections: Dict[int, TrackDetection] = {}  # frame_idx -> TrackDetection
        self.held_boxes: Dict[int, List[int]] = {}  # frame_idx -> box [x1, y1, x2, y2]

        self.best_frame_idx: int = -1
        self.best_frame_ms: int = -1
        self.best_box: List[int] = [0, 0, 0, 0]
        self.best_confidence: float = -1.0
        self.best_quality_score: float = -1.0
        self.face_pool = CandidatePool(top_n=FACE_ARCFACE_CANDIDATES)
        self.has_embedding: bool = False
        self.plate_pool = CandidatePool(top_n=PLATE_OCR_CANDIDATES)
        self.plate_text: Optional[str] = None

        # Whitelist status per Contract §3 B2
        self.whitelisted: bool = False
        self.redacted: bool = True
        self.inherited_from: Optional[int] = None
        self.similarity: Optional[float] = None
        self.whitelist_ref: Optional[int] = None

        # Ranges per Contract §3 B2
        self.low_confidence_ranges: List[List[int]] = []
        self.gap_ranges: List[List[int]] = []

    def add_detection(
        self,
        frame_idx: int,
        frame_ms: int,
        box: List[int],
        confidence: float,
        orig_w: int,
        orig_h: int,
        face_roi: Optional[np.ndarray] = None,
        plate_roi: Optional[np.ndarray] = None,
        sharpness: float = 0.0,
    ):
        """Add a raw detection from YOLO + ByteTrack and update best frame metrics."""
        det = TrackDetection(
            frame_idx=frame_idx,
            frame_ms=frame_ms,
            box=box,
            confidence=round(confidence, 4),
            is_interpolated=False,
        )
        self.detections[frame_idx] = det

        # Compute quality metric: favors high confidence, larger area, and Laplacian sharpness
        w_box = max(1, box[2] - box[0])
        h_box = max(1, box[3] - box[1])
        area = w_box * h_box
        norm_area = area / max(1, (orig_w * orig_h))
        norm_sharpness = min(1.0, max(0.0, sharpness / 150.0))

        quality_score = confidence * 0.5 + (norm_area ** 0.5) * 0.3 + norm_sharpness * 0.2

        if quality_score > self.best_quality_score or self.best_frame_idx < 0:
            self.best_quality_score = quality_score
            self.best_confidence = round(confidence, 4)
            self.best_frame_idx = frame_idx
            self.best_frame_ms = frame_ms
            self.best_box = box
        if face_roi is not None and face_roi.size > 0:
            self.face_pool.add(frame_idx, frame_ms, face_roi, quality_score)
        if plate_roi is not None and plate_roi.size > 0:
            self.plate_pool.add(frame_idx, frame_ms, plate_roi, float(plate_roi.shape[1]))


class TrackManager:
    """Manages active tracks, performs linear interpolation, and builds contract summaries."""

    def __init__(self, fps: float, orig_w: int, orig_h: int):
        self.fps = fps if fps > 0 else 30.0
        self.orig_w = orig_w
        self.orig_h = orig_h
        self.tracks: Dict[int, Track] = {}
        # Tracker id -> id of its current piece. A tracker id lost for longer than the gap we fill in can come back on
        # a different object (ByteTrack keeps lost ids ~2 s and re-matches them by predicted position), so a long gap
        # starts a new piece and each piece gets its own allow-list decision. Pieces count up from SPLIT_ID_START.
        self._piece: Dict[int, int] = {}
        self._last_frame: Dict[int, int] = {}
        self._next_piece_id = self.SPLIT_ID_START

    SPLIT_ID_START = 900000  # clear of tracker ids and the 500000+ ids of untracked boxes

    def _piece_for(self, track_id: int, frame_idx: int) -> int:
        """The piece a detection of this tracker id belongs to; starts a new one after a gap longer than we fill in.

        The gap stays visible to the reviewer: it is recorded in the ended piece's gap_ranges, as interpolate_gaps
        does for a gap inside a track."""
        piece = self._piece.get(track_id, track_id)
        last = self._last_frame.get(piece)
        if last is not None and frame_idx - last - 1 > max_gap_frames_for_fps(self.fps):
            self.tracks[piece].gap_ranges.append([int(((last + 1) / self.fps) * 1000),
                                                  int(((frame_idx - 1) / self.fps) * 1000)])
            piece = self._next_piece_id
            self._next_piece_id += 1
            self._piece[track_id] = piece
        self._last_frame[piece] = frame_idx
        return piece

    def get_or_create_track(self, track_id: int, label: str) -> Track:
        if track_id not in self.tracks:
            self.tracks[track_id] = Track(track_id=track_id, label=label)
        return self.tracks[track_id]

    def has_track(self, track_id: int) -> bool:
        """Check if track ID (a tracker id or a piece id) is already registered in active tracks."""
        return self._piece.get(track_id, track_id) in self.tracks

    def add_detection(
        self,
        track_id: int,
        label: str,
        frame_idx: int,
        frame_ms: int,
        box: List[int],
        confidence: float,
        face_roi: Optional[np.ndarray] = None,
        plate_roi: Optional[np.ndarray] = None,
        sharpness: float = 0.0,
    ):
        track = self.get_or_create_track(self._piece_for(track_id, frame_idx), label)
        track.add_detection(
            frame_idx=frame_idx,
            frame_ms=frame_ms,
            box=box,
            confidence=confidence,
            orig_w=self.orig_w,
            orig_h=self.orig_h,
            face_roi=face_roi,
            plate_roi=plate_roi,
            sharpness=sharpness,
        )

    def interpolate_gaps(self, max_gap_frames: Optional[int] = None):
        """Bridge short tracking dropouts (<= max_gap_frames) via linear interpolation."""
        if max_gap_frames is None:
            max_gap_frames = max_gap_frames_for_fps(self.fps)
        for track in self.tracks.values():
            if len(track.detections) < 2:
                continue

            sorted_frames = sorted(track.detections.keys())
            for i in range(len(sorted_frames) - 1):
                f_curr = sorted_frames[i]
                f_next = sorted_frames[i + 1]
                gap = f_next - f_curr - 1

                if 1 <= gap <= max_gap_frames:
                    det_curr = track.detections[f_curr]
                    det_next = track.detections[f_next]
                    box_curr = det_curr.box
                    box_next = det_next.box
                    conf_curr = det_curr.confidence
                    conf_next = det_next.confidence

                    total_steps = f_next - f_curr
                    for step, f in enumerate(range(f_curr + 1, f_next), start=1):
                        alpha = step / float(total_steps)
                        ix1 = max(0, min(self.orig_w, int(round(box_curr[0] + alpha * (box_next[0] - box_curr[0])))))
                        iy1 = max(0, min(self.orig_h, int(round(box_curr[1] + alpha * (box_next[1] - box_curr[1])))))
                        ix2 = max(0, min(self.orig_w, int(round(box_curr[2] + alpha * (box_next[2] - box_curr[2])))))
                        iy2 = max(0, min(self.orig_h, int(round(box_curr[3] + alpha * (box_next[3] - box_curr[3])))))
                        iconf = round(conf_curr + alpha * (conf_next - conf_curr), 4)
                        f_ms = int((f / self.fps) * 1000)

                        track.detections[f] = TrackDetection(
                            frame_idx=f,
                            frame_ms=f_ms,
                            box=[ix1, iy1, ix2, iy2],
                            confidence=iconf,
                            is_interpolated=True,
                        )

                elif gap > max_gap_frames:
                    gap_start_ms = int(((f_curr + 1) / self.fps) * 1000)
                    gap_end_ms = int(((f_next - 1) / self.fps) * 1000)
                    track.gap_ranges.append([gap_start_ms, gap_end_ms])

    def compute_ranges(self, review_threshold: float):
        """Identify contiguous frame ranges where confidence fell below reviewThreshold."""
        for track in self.tracks.values():
            if not track.detections:
                continue

            sorted_frames = sorted(track.detections.keys())
            low_conf_start_ms = None
            last_low_ms = None

            for f in sorted_frames:
                det = track.detections[f]
                if det.confidence < review_threshold:
                    if low_conf_start_ms is None:
                        low_conf_start_ms = det.frame_ms
                    last_low_ms = det.frame_ms
                else:
                    if low_conf_start_ms is not None and last_low_ms is not None:
                        track.low_confidence_ranges.append([low_conf_start_ms, last_low_ms])
                        low_conf_start_ms = None
                        last_low_ms = None

            if low_conf_start_ms is not None and last_low_ms is not None:
                track.low_confidence_ranges.append([low_conf_start_ms, last_low_ms])

    def apply_holds(self, hold_frames: Optional[int] = None):
        """Hold blur around detected frames to prevent reveals when objects appear or disappear."""
        if hold_frames is None:
            hold_frames = hold_frames_for_fps(self.fps)
        if hold_frames <= 0:
            return

        for track in self.tracks.values():
            track.held_boxes.clear()
            if not track.detections:
                continue

            sorted_frames = sorted(track.detections.keys())
            runs: List[Tuple[int, int]] = []
            run_start = sorted_frames[0]
            run_end = sorted_frames[0]
            for f in sorted_frames[1:]:
                if f == run_end + 1:
                    run_end = f
                else:
                    runs.append((run_start, run_end))
                    run_start = f
                    run_end = f
            runs.append((run_start, run_end))

            for r_start, r_end in runs:
                first_box = track.detections[r_start].box
                last_box = track.detections[r_end].box

                # Frames run_start - hold .. run_start - 1 hold the run's first box, stopping at frame 0.
                for f in range(max(0, r_start - hold_frames), r_start):
                    if f not in track.detections:
                        track.held_boxes[f] = list(first_box)

                # Frames run_end + 1 .. run_end + hold hold the run's last box.
                for f in range(r_end + 1, r_end + hold_frames + 1):
                    if f not in track.detections:
                        track.held_boxes[f] = list(last_box)

    def get_active_redactions(self, frame_idx: int) -> List[List[int]]:
        """Retrieve bounding boxes of all tracks that must be redacted on a specific frame."""
        boxes = []
        for track in self.tracks.values():
            if not track.redacted:
                continue
            if frame_idx in track.detections:
                boxes.append(track.detections[frame_idx].box)
            elif frame_idx in track.held_boxes:
                boxes.append(track.held_boxes[frame_idx])
        return boxes

    def to_contract_summary(self, review_threshold: float = DEFAULT_REVIEW_THRESHOLD) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        """Export tracks and summary counts conforming 100% to Contract §3 B2."""
        tracks_summary: List[Dict[str, Any]] = []
        counts = {
            "faceTracks": 0,
            "plateTracks": 0,
            "whitelistedFaceTracks": 0,
            "whitelistedPlateTracks": 0,
            "redactedTracks": 0,
            "lowConfidenceTracks": 0,
        }

        for track_id in sorted(self.tracks.keys()):
            track = self.tracks[track_id]
            if not track.detections:
                continue

            sorted_frames = sorted(track.detections.keys())
            start_ms = track.detections[sorted_frames[0]].frame_ms
            end_ms = track.detections[sorted_frames[-1]].frame_ms

            confs = [d.confidence for d in track.detections.values() if not d.is_interpolated]
            if not confs:
                confs = [d.confidence for d in track.detections.values()]
            max_conf = round(float(np.max(confs)), 4) if confs else 0.0
            mean_conf = round(float(np.mean(confs)), 4) if confs else 0.0

            if track.label == "face":
                counts["faceTracks"] += 1
                if track.whitelisted:
                    counts["whitelistedFaceTracks"] += 1
            elif track.label == "plate":
                counts["plateTracks"] += 1
                if track.whitelisted:
                    counts["whitelistedPlateTracks"] += 1

            if track.redacted:
                counts["redactedTracks"] += 1

            # A track counts toward lowConfidenceTracks only when its mean_conf is below review_threshold.
            # A brief dip must not flag a whole track; lowConfidenceRanges still captures localized drops.
            is_low_conf_track = bool(mean_conf < review_threshold)
            if is_low_conf_track:
                counts["lowConfidenceTracks"] += 1

            summary_item: Dict[str, Any] = {
                "trackId": track.track_id,
                "label": track.label,
                "startMs": start_ms,
                "endMs": end_ms,
                "maxConfidence": max_conf,
                "meanConfidence": mean_conf,
                "redacted": track.redacted,
                "whitelisted": track.whitelisted,
                "bestFrameMs": track.best_frame_ms,
                "box": track.best_box,
                "lowConfidenceRanges": track.low_confidence_ranges,
                "gapRanges": track.gap_ranges,
            }

            if track.similarity is not None:
                summary_item["similarity"] = round(track.similarity, 4)
            if track.whitelisted and track.whitelist_ref is not None:
                summary_item["whitelistRef"] = track.whitelist_ref
            if track.label == "plate" and track.plate_text is not None:
                summary_item["plateText"] = track.plate_text

            tracks_summary.append(summary_item)

        return tracks_summary, counts


class VideoProbe:
    """Utility to probe video metadata using ffprobe with OpenCV fallback."""

    @staticmethod
    def probe(video_path: str, ffprobe_bin: str = "ffprobe", ffmpeg_bin: str = "ffmpeg") -> VideoMetadata:
        """Extract metadata from video file."""
        if not os.path.exists(video_path) or os.path.getsize(video_path) == 0:
            raise InvalidInputFileError("Video file is empty or missing")

        resolved_ffprobe = resolve_ffprobe_bin(ffprobe_bin)
        metadata = VideoProbe._probe_with_ffprobe(video_path, resolved_ffprobe)
        if metadata is not None:
            return metadata

        resolved_ffmpeg = resolve_ffmpeg_bin(ffmpeg_bin)
        return VideoProbe._probe_with_opencv(video_path, resolved_ffmpeg)

    @staticmethod
    def _probe_with_ffprobe(video_path: str, ffprobe_bin: str) -> Optional[VideoMetadata]:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path,
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
            if res.returncode != 0 or not res.stdout.strip():
                return None
            data = json.loads(res.stdout)
            streams = data.get("streams", [])
            format_info = data.get("format", {})

            video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
            if not video_stream:
                return None

            width = int(video_stream.get("width", 0))
            height = int(video_stream.get("height", 0))
            if width <= 0 or height <= 0:
                return None

            fps_str = video_stream.get("r_frame_rate") or video_stream.get("avg_frame_rate") or "30/1"
            if "/" in fps_str:
                num, den = fps_str.split("/")
                fps = float(num) / float(den) if float(den) > 0 else 30.0
            else:
                fps = float(fps_str)
            if fps <= 0 or np.isnan(fps):
                fps = 30.0

            nb_frames = video_stream.get("nb_frames")
            if nb_frames and nb_frames.isdigit() and int(nb_frames) > 0:
                frames = int(nb_frames)
            else:
                dur_sec = float(video_stream.get("duration") or format_info.get("duration", 0))
                frames = max(1, int(dur_sec * fps))

            dur_val = video_stream.get("duration") or format_info.get("duration")
            duration_ms = int(float(dur_val) * 1000) if dur_val else int((frames / fps) * 1000)

            has_audio = any(s.get("codec_type") == "audio" for s in streams)
            codec = str(video_stream.get("codec_name", "h264"))

            return VideoMetadata(
                width=width,
                height=height,
                fps=fps,
                duration_ms=duration_ms,
                frames=frames,
                has_audio=has_audio,
                codec=codec,
            )
        except Exception as e:
            logger.debug(f"ffprobe probe failed: {e}. Falling back to OpenCV.")
            return None

    @staticmethod
    def _probe_with_opencv(video_path: str, ffmpeg_bin: str) -> VideoMetadata:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise InvalidInputFileError("Cannot identify or decode video file: not a readable MP4 video")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        if fps <= 0 or np.isnan(fps):
            fps = 30.0
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        if width <= 0 or height <= 0 or frames <= 0:
            raise InvalidInputFileError(
                f"Invalid video stream dimensions or frame count: {width}x{height}, frames={frames}"
            )

        duration_ms = int((frames / fps) * 1000)

        has_audio = False
        try:
            resolved_bin = resolve_ffmpeg_bin(ffmpeg_bin)
            cmd = [resolved_bin, "-i", video_path]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            has_audio = "Audio:" in res.stderr
        except Exception:
            has_audio = False

        return VideoMetadata(
            width=width,
            height=height,
            fps=fps,
            duration_ms=duration_ms,
            frames=frames,
            has_audio=has_audio,
            codec="h264",
        )


class AudioHandler:
    """Manages audio demuxing and remuxing without re-encoding (-c:a copy)."""

    @staticmethod
    def extract_audio(input_video_path: str, output_audio_path: str, ffmpeg_bin: str = "ffmpeg") -> bool:
        """Extract original audio stream without re-encoding."""
        resolved_bin = resolve_ffmpeg_bin(ffmpeg_bin)
        cmd = [
            resolved_bin,
            "-y",
            "-i", input_video_path,
            "-vn",
            "-c:a", "copy",
            output_audio_path,
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
            if res.returncode == 0 and os.path.exists(output_audio_path) and os.path.getsize(output_audio_path) > 0:
                logger.info(f"Extracted audio stream successfully to {output_audio_path}")
                return True
            logger.debug(f"Audio extraction returned {res.returncode}: {res.stderr.decode('utf-8', errors='ignore')}")
            return False
        except Exception as e:
            logger.warning(f"Could not extract audio via ffmpeg: {e}")
            return False


class ProgressThrottler:
    """Throttles progress events to maximum 1 event per 2 seconds (contract §2B)."""

    def __init__(
        self,
        callback: Optional[Callable[[int, str], None]] = None,
        min_interval_sec: float = 2.0,
    ):
        self.callback = callback
        self.min_interval_sec = min_interval_sec
        self.last_emitted_time = 0.0
        self.last_emitted_progress = -1

    def update_range(
        self,
        current_step: int,
        total_steps: int,
        start_pct: int,
        end_pct: int,
        stage: str = "PROCESSING",
        force: bool = False,
    ):
        """Update progress scaled within a specific percentage window [start_pct, end_pct]."""
        if not self.callback or total_steps <= 0:
            return

        ratio = min(1.0, max(0.0, current_step / float(total_steps)))
        pct = int(start_pct + ratio * (end_pct - start_pct))
        now = time.monotonic()
        if force or (now - self.last_emitted_time >= self.min_interval_sec and pct != self.last_emitted_progress):
            self.last_emitted_time = now
            self.last_emitted_progress = pct
            try:
                self.callback(pct, stage)
            except Exception as e:
                logger.warning(f"Error executing progress callback: {e}")


class VideoRedactProcessor(BaseProcessor):
    """Processor for 'video-redact' job type.

    Performs video redaction pipeline:
    1. Demuxes metadata and audio stream.
    2. Pass 1: Runs YOLOv8 + ByteTrack object tracking on all frames.
    3. Bridges tracking dropouts (<= 167 ms) via linear interpolation.
    4. Evaluates Face Whitelisting (ArcFace 512-d) across candidate frames with spatial-temporal inheritance.
    5. Pass 2: Renders target masking with padding and streams into FFmpeg H.264 writer.
    6. Remuxes original audio stream (-c:a copy) without re-encoding.
    """

    DEFAULT_CLASS_MAPPING = {
        "Human face": "face",
        "Vehicle registration plate": "plate",
        "face": "face",
        "plate": "plate",
    }

    def __init__(
        self,
        model_name: str = "yolo26n-1280-e5-dashcam.pt",
        face_embedding_model: str = "w600k_mbf.onnx",
        class_mapping: Optional[Dict[str, str]] = None,
        imgsz: int = 1280,
        ffmpeg_bin: str = "ffmpeg",
        ffprobe_bin: str = "ffprobe",
        tracker_config: str = "bytetrack.yaml",
        face_embedder: Optional[FaceEmbedder] = None,
        whitelist_manager: Optional[WhitelistManager] = None,
        plate_whitelist_manager: Optional[PlateWhitelistManager] = None,
        storage_client: Optional[Any] = None,
    ):
        self.class_mapping = class_mapping or self.DEFAULT_CLASS_MAPPING
        self.imgsz = imgsz
        self.face_embedding_model = face_embedding_model
        self.face_embedder = face_embedder
        self.whitelist_manager = whitelist_manager
        self.plate_whitelist_manager = plate_whitelist_manager
        self.storage_client = storage_client
        self.ffmpeg_bin = resolve_ffmpeg_bin(ffmpeg_bin)
        self.ffprobe_bin = resolve_ffprobe_bin(ffprobe_bin)
        self.tracker_config = tracker_config
        self.model_name = model_name

        chosen_model = self._resolve_model_path(model_name)
        self.default_model_path = chosen_model  # used by jobs that do not name a detection mode
        self.chosen_model_path = chosen_model
        self.model_tag = os.path.splitext(os.path.basename(chosen_model))[0]
        self._model = None
        self.video_encoder = self._probe_video_encoder()
        logger.info(
            f"Initialized VideoRedactProcessor (model_tag={self.model_tag}, tracker={self.tracker_config}, encoder={self.video_encoder})"
        )

    def _probe_video_encoder(self) -> str:
        """Detect supported H.264 encoder in the current FFmpeg installation at startup."""
        encoder = "libx264"
        try:
            res = subprocess.run(
                [self.ffmpeg_bin, "-encoders"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5,
                check=False,
            )
            output = res.stdout + res.stderr
            if "libx264" in output:
                encoder = "libx264"
            elif "h264_mf" in output:
                encoder = "h264_mf"
            elif "libopenh264" in output:
                encoder = "libopenh264"
            else:
                encoder = "mpeg4"
        except Exception:
            encoder = "libx264"
        return encoder

    @staticmethod
    def _resolve_model_path(model_name: str) -> str:
        """Local path of a model weight file; same lookup as the image processor."""
        return resolve_model_path(model_name)

    def _use_model(self, target_path: str) -> None:
        """Make ``target_path`` the model the next job runs, dropping the loaded one if it differs.

        Why: a worker holds one YOLO model at a time (the pod memory limit does not fit two), exactly like
        ImageRedactProcessor._ensure_model. Same weights as the last job: nothing happens, the loaded model is reused.
        The new weights are loaded lazily by _get_model().
        """
        if target_path == self.chosen_model_path:
            return
        logger.info(f"Model switch: '{self.chosen_model_path}' -> '{target_path}'")
        if self._model is not None:
            del self._model
            self._model = None
            import gc

            gc.collect()
        self.chosen_model_path = target_path
        self.model_tag = os.path.splitext(os.path.basename(target_path))[0]

    def _get_model(self):
        """Lazy load YOLO model."""
        if self._model is None:
            from ultralytics import YOLO
            logger.info(f"Loading YOLO model for video-redact from: {self.chosen_model_path}...")
            self._model = YOLO(self.chosen_model_path)
            logger.info(f"YOLO model ({self.model_tag}) loaded successfully!")
        return self._model

    def _get_whitelist_manager(self) -> WhitelistManager:
        """Lazily initialize WhitelistManager and FaceEmbedder."""
        if self.whitelist_manager is None:
            if self.face_embedder is None:
                self.face_embedder = FaceEmbedder(model_name=self.face_embedding_model)
            self.whitelist_manager = WhitelistManager(
                embedder=self.face_embedder,
                max_cache_size=settings.whitelist_max_cache_size,
                ttl_seconds=settings.whitelist_cache_ttl_seconds,
            )
        return self.whitelist_manager

    @staticmethod
    def _apply_redaction_style(roi: np.ndarray, style: str, strength: Optional[int] = None) -> np.ndarray:
        """Apply blur, pixelate, or blackout to a single region of interest."""
        return apply_redaction_style(roi, style, strength)

    def _match_face_directly(
        self,
        track: Track,
        ref_embeddings: List[np.ndarray],
        similarity_threshold: float,
        whitelist_mgr: WhitelistManager,
    ) -> None:
        """Embed the first FACE_ARCFACE_CANDIDATES crops of the track's pool and whitelist the track if any is similar enough to a reference."""
        embedder = whitelist_mgr.embedder

        best_sim: Optional[float] = None
        best_ref: Optional[int] = None
        has_embedding = False

        for candidate in track.face_pool.ordered()[:FACE_ARCFACE_CANDIDATES]:
            try:
                det_emb = embedder.extract_embedding(candidate.crop)
                has_embedding = True
                for ref_idx, ref_emb in enumerate(ref_embeddings):
                    sim = float(embedder.compute_similarity(det_emb, ref_emb))
                    if best_sim is None or sim > best_sim:
                        best_sim = sim
                        best_ref = ref_idx
            except Exception as e:
                logger.warning(f"Error computing embedding for track {track.track_id}: {e}")

        track.has_embedding = has_embedding
        if has_embedding and best_sim is not None:
            track.similarity = round(best_sim, 4)
            if best_sim >= similarity_threshold:
                track.whitelisted = True
                track.redacted = False
                track.whitelist_ref = best_ref
                logger.info(
                    f"Track {track.track_id} (face) WHITELISTED: similarity={best_sim:.4f} >= {similarity_threshold} "
                    f"(ref index={best_ref})"
                )
            else:
                track.whitelisted = False
                track.redacted = True
                track.whitelist_ref = None
                logger.info(
                    f"Track {track.track_id} (face) REDACTED: similarity={best_sim:.4f} < {similarity_threshold}"
                )
        else:
            track.whitelisted = False
            track.redacted = True
            track.similarity = 0.0
            track.whitelist_ref = None

        # Free face candidate memory immediately
        track.face_pool.clear()

    def _evaluate_face_whitelist(
        self,
        track_mgr: TrackManager,
        ref_embeddings: List[np.ndarray],
        similarity_threshold: float,
        whitelist_mgr: WhitelistManager,
    ) -> None:
        """Evaluate Face Whitelist matching per track using ArcFace embeddings, then inherit across broken tracks."""
        for track in track_mgr.tracks.values():
            if track.label == "face":
                self._match_face_directly(track, ref_embeddings, similarity_threshold, whitelist_mgr)

        def is_face_blocked(t: Track) -> bool:
            """Block inheritance when best similarity is below FACE_INHERIT_BLOCK_SIMILARITY (looks like someone else); tracks with no embedding are not blocked."""
            return t.has_embedding and t.similarity is not None and t.similarity < FACE_INHERIT_BLOCK_SIMILARITY

        self._inherit_whitelist(
            track_mgr=track_mgr,
            label="face",
            min_dist_px=FACE_INHERIT_MIN_DIST_PX,
            is_blocked=is_face_blocked,
        )

    def _get_plate_whitelist_manager(self) -> PlateWhitelistManager:
        """Lazily initialize PlateWhitelistManager."""
        if self.plate_whitelist_manager is None:
            self.plate_whitelist_manager = PlateWhitelistManager()
        return self.plate_whitelist_manager

    def _match_plate_directly(
        self,
        track: Track,
        plate_mgr: PlateWhitelistManager,
        whitelist_plates: List[str],
    ) -> None:
        """OCR the first PLATE_OCR_CANDIDATES crops of the track's pool (widest per time window, then widest overall) and whitelist the track if any reads as a whitelisted plate."""
        crops_to_eval = [
            c.crop
            for c in track.plate_pool.ordered()[:PLATE_OCR_CANDIDATES]
            if c is not None and c.crop is not None and c.crop.size > 0
        ]

        matched = bool(track.whitelisted)
        best_text = track.plate_text
        best_conf = 0.0

        for crop in crops_to_eval:
            is_white, norm_text, conf = plate_mgr.evaluate_plate(
                plate_bgr=crop,
                whitelist_plates=whitelist_plates,
            )
            if conf > best_conf or best_text is None:
                best_conf = conf
                best_text = norm_text
            if is_white:
                matched = True
                best_text = norm_text
                break

        track.plate_text = best_text if best_text else None
        if matched:
            track.whitelisted = True
            track.redacted = False
            logger.info(
                f"Track {track.track_id} (plate '{best_text}') WHITELISTED (conf={best_conf:.2f})"
            )
        else:
            track.whitelisted = False
            track.redacted = True
            logger.info(
                f"Track {track.track_id} (plate '{best_text}') REDACTED"
            )

        # Free plate crop memory
        track.plate_pool.clear()

    def _evaluate_plate_whitelist(
        self,
        track_mgr: TrackManager,
        whitelist_plates: List[str],
    ) -> None:
        """Evaluate license plate OCR whitelist matching per track using temporal candidate consensus, then inherit."""
        plate_mgr = self._get_plate_whitelist_manager()
        for track in track_mgr.tracks.values():
            if track.label == "plate":
                self._match_plate_directly(track, plate_mgr, whitelist_plates)

        norm_whitelist = plate_mgr.normalize_whitelist(whitelist_plates)

        def is_plate_blocked(t: Track) -> bool:
            """Block inheritance when a plate has readable text of at least PLATE_INHERIT_BLOCK_MIN_CHARS characters not on the whitelist."""
            if t.plate_text and len(t.plate_text) >= PLATE_INHERIT_BLOCK_MIN_CHARS:
                is_m, _ = plate_mgr.is_plate_match(t.plate_text, norm_whitelist)
                return not is_m
            return False

        self._inherit_whitelist(
            track_mgr=track_mgr,
            label="plate",
            min_dist_px=PLATE_INHERIT_MIN_DIST_PX,
            is_blocked=is_plate_blocked,
        )

    @classmethod
    def _is_sequential_continuation(
        cls,
        box_first: List[int],
        box_second: List[int],
        seed_box: List[int],
        gap: int,
        max_gap_frames: int,
        near_gap_frames: int,
        min_dist_px: float,
    ) -> bool:
        """Check whether box_second sequentially continues box_first within the allowed time gap and distance."""
        if not (0 <= gap <= max_gap_frames):
            return False
        if cls._box_iou(box_first, box_second) >= INHERIT_MIN_IOU:
            return True
        dist = cls._box_center_dist(box_first, box_second)
        seed_size = max(seed_box[2] - seed_box[0], seed_box[3] - seed_box[1])
        allowed_dist = max(seed_size * INHERIT_CENTER_DIST_FACTOR, min_dist_px)
        return dist <= allowed_dist and gap <= near_gap_frames

    @classmethod
    def _piece_continues_seed(
        cls,
        seed: Track,
        candidate: Track,
        fps: float,
        min_dist_px: float,
    ) -> bool:
        """Decide whether candidate track continues seed track via Case A (follows), B (precedes), or C (overlaps)."""
        f_w = sorted(seed.detections.keys())
        min_w, max_w = f_w[0], f_w[-1]
        box_w_start = seed.detections[min_w].box
        box_w_end = seed.detections[max_w].box

        f_u = sorted(candidate.detections.keys())
        min_u, max_u = f_u[0], f_u[-1]
        box_u_start = candidate.detections[min_u].box
        box_u_end = candidate.detections[max_u].box

        max_gap_frames = frames_for_ms(fps, INHERIT_MAX_GAP_MS)
        near_gap_frames = frames_for_ms(fps, INHERIT_NEAR_GAP_MS)

        # Case A: candidate follows seed
        if cls._is_sequential_continuation(
            box_first=box_w_end,
            box_second=box_u_start,
            seed_box=box_w_end,
            gap=min_u - max_w,
            max_gap_frames=max_gap_frames,
            near_gap_frames=near_gap_frames,
            min_dist_px=min_dist_px,
        ):
            return True

        # Case B: candidate precedes seed
        if cls._is_sequential_continuation(
            box_first=box_u_end,
            box_second=box_w_start,
            seed_box=box_w_start,
            gap=min_w - max_u,
            max_gap_frames=max_gap_frames,
            near_gap_frames=near_gap_frames,
            min_dist_px=min_dist_px,
        ):
            return True

        # Case C: Overlapping or concurrent frames
        overlap_frames = frames_for_ms(fps, INHERIT_OVERLAP_MS)
        if abs(min_u - min_w) <= overlap_frames or abs(max_u - max_w) <= overlap_frames:
            common_f = max(min_u, min_w)
            if common_f in seed.detections and common_f in candidate.detections:
                iou = cls._box_iou(seed.detections[common_f].box, candidate.detections[common_f].box)
                if iou >= INHERIT_OVERLAP_MIN_IOU:
                    return True

        return False

    def _inherit_whitelist(
        self,
        track_mgr: TrackManager,
        label: str,
        min_dist_px: float,
        is_blocked: Callable[[Track], bool],
    ) -> None:
        """Propagate whitelist exemption from directly matched seed tracks to contiguous pieces."""
        tracks = [t for t in track_mgr.tracks.values() if t.label == label and t.detections]
        seed_tracks = [t for t in tracks if t.whitelisted and t.inherited_from is None]
        if not seed_tracks:
            return

        for seed in seed_tracks:
            for candidate in tracks:
                if candidate.whitelisted or not candidate.detections:
                    continue
                if is_blocked(candidate):
                    continue
                if self._piece_continues_seed(
                    seed=seed,
                    candidate=candidate,
                    fps=track_mgr.fps,
                    min_dist_px=min_dist_px,
                ):
                    candidate.whitelisted = True
                    candidate.redacted = False
                    candidate.inherited_from = seed.track_id
                    if candidate.whitelist_ref is None and seed.whitelist_ref is not None:
                        candidate.whitelist_ref = seed.whitelist_ref
                    if candidate.plate_text is None and seed.plate_text is not None:
                        candidate.plate_text = seed.plate_text
                    logger.info(
                        f"Track {candidate.track_id} inherited WHITELIST from seed Track {seed.track_id}"
                    )

    @staticmethod
    def _box_iou(b1: List[int], b2: List[int]) -> float:
        """Calculate Intersection over Union (IoU) of two bounding boxes."""
        ix1 = max(b1[0], b2[0])
        iy1 = max(b1[1], b2[1])
        ix2 = min(b1[2], b2[2])
        iy2 = min(b1[3], b2[3])
        inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        union = (b1[2] - b1[0]) * (b1[3] - b1[1]) + (b2[2] - b2[0]) * (b2[3] - b2[1]) - inter
        return float(inter / union) if union > 0 else 0.0

    @staticmethod
    def _box_center_dist(b1: List[int], b2: List[int]) -> float:
        """Calculate Euclidean distance between bounding box centers."""
        cx1 = (b1[0] + b1[2]) / 2.0
        cy1 = (b1[1] + b1[3]) / 2.0
        cx2 = (b2[0] + b2[2]) / 2.0
        cy2 = (b2[1] + b2[3]) / 2.0
        return float(math.hypot(cx1 - cx2, cy1 - cy2))

    def process(
        self,
        input_bytes: bytes,
        params: Dict[str, Any],
        output_key: str = "",
        storage_client: Optional[Any] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Tuple[bytes, Dict[str, Any], str]:
        """Execute video-redact processing pipeline."""
        start_time = time.monotonic()

        if not input_bytes or len(input_bytes) == 0:
            raise InvalidInputFileError("Input video file is empty (0 bytes).")

        params = params or {}
        redaction_cfg = params.get("redaction", {})
        targets_param = redaction_cfg.get("targets", ["face", "plate"])
        if isinstance(targets_param, str):
            targets_param = [targets_param]
        targets_set = set(t.lower() for t in targets_param)

        style = str(redaction_cfg.get("style", "blur")).lower()
        if style not in ("blur", "pixelate", "blackout"):
            style = "blur"

        default_strength = DEFAULT_REDACTION_STRENGTHS.get(style, 15)
        strength = int(redaction_cfg.get("strength", default_strength))
        padding = max(0.0, min(0.5, float(redaction_cfg.get("padding", 0.1))))

        # Detection mode (fast / max_privacy) picks the model, input size and base thresholds, as for images.
        # No mode: the processor's own model and size, with the default thresholds.
        detection_cfg = params.get("detection") if isinstance(params.get("detection"), dict) else {}
        mode_param = detection_cfg.get("mode")
        if mode_param:
            mode_cfg = get_detection_mode_config(str(mode_param))
            self._use_model(self._resolve_model_path(mode_cfg.model_name))
            active_imgsz = mode_cfg.imgsz
            mode_name = mode_cfg.mode
            base_thresholds = mode_cfg.confidence_thresholds
        else:
            self._use_model(self.default_model_path)
            active_imgsz = self.imgsz
            mode_name = None
            base_thresholds = None
        thresholds = parse_confidence_thresholds(params, base_thresholds=base_thresholds)
        review_threshold = float(params.get("reviewThreshold", DEFAULT_REVIEW_THRESHOLD))

        # Parse Whitelist configuration
        whitelist_cfg = params.get("whitelist", {}) if isinstance(params.get("whitelist"), dict) else {}
        face_specs = whitelist_cfg.get("faces", []) if isinstance(whitelist_cfg, dict) else []
        similarity_threshold = (float(whitelist_cfg.get("similarityThreshold", DEFAULT_FACE_SIMILARITY))
                                if isinstance(whitelist_cfg, dict) else DEFAULT_FACE_SIMILARITY)
        has_face_whitelist = bool(face_specs and len(face_specs) > 0)

        plate_specs = whitelist_cfg.get("plates", []) if isinstance(whitelist_cfg, dict) else []
        has_plate_whitelist = bool(plate_specs and len(plate_specs) > 0)

        quality_level = str(params.get("output", {}).get("quality", "high")).lower()
        crf_value = CRF_MAP.get(quality_level, 23)

        throttler = ProgressThrottler(callback=progress_callback, min_interval_sec=2.0)

        # Temporary working directory inside /tmp (read-only rootfs compliance)
        with tempfile.TemporaryDirectory(dir=tempfile.gettempdir(), prefix="vid_redact_") as work_dir:
            input_video_path = os.path.join(work_dir, "input.mp4")
            raw_audio_path = os.path.join(work_dir, "audio.m4a")
            output_video_path = os.path.join(work_dir, "output.mp4")

            with open(input_video_path, "wb") as f:
                f.write(input_bytes)

            metadata = VideoProbe.probe(input_video_path, ffprobe_bin=self.ffprobe_bin)
            logger.info(
                f"Probed video: {metadata.width}x{metadata.height} @ {metadata.fps:.2f}fps, "
                f"frames={metadata.frames}, duration={metadata.duration_ms}ms, hasAudio={metadata.has_audio}"
            )

            audio_extracted = False
            if metadata.has_audio:
                audio_extracted = AudioHandler.extract_audio(
                    input_video_path, raw_audio_path, ffmpeg_bin=self.ffmpeg_bin
                )

            # Pass 1: Tracking & Trajectory Analysis (10% -> 45%)
            track_mgr = self._track_pass(
                input_video_path=input_video_path,
                metadata=metadata,
                targets_set=targets_set,
                thresholds=thresholds,
                review_threshold=review_threshold,
                throttler=throttler,
                imgsz=active_imgsz,
            )

            # Milestone 2: Evaluate Whitelist per Track (45% -> 50%)
            if has_face_whitelist:
                if progress_callback:
                    progress_callback(45, "MATCHING_WHITELIST")
                whitelist_mgr = self._get_whitelist_manager()
                active_storage = storage_client or self.storage_client
                ref_embeddings = whitelist_mgr.load_reference_embeddings(
                    faces_specs=face_specs,
                    yolo_model=self._get_model(),
                    class_mapping=self.class_mapping,
                    storage_client=active_storage,
                )
                self._evaluate_face_whitelist(
                    track_mgr=track_mgr,
                    ref_embeddings=ref_embeddings,
                    similarity_threshold=similarity_threshold,
                    whitelist_mgr=whitelist_mgr,
                )

            # Milestone 2 (Phase 2): Evaluate License Plate Whitelist per Track
            if has_plate_whitelist:
                if progress_callback:
                    progress_callback(48, "MATCHING_PLATE_WHITELIST")
                self._evaluate_plate_whitelist(
                    track_mgr=track_mgr,
                    whitelist_plates=plate_specs,
                )

            # Pass 2: Target Redaction & Rendering (50% -> 90%)
            self._render_pass(
                input_video_path=input_video_path,
                output_video_path=output_video_path,
                audio_path=raw_audio_path if audio_extracted else None,
                metadata=metadata,
                track_mgr=track_mgr,
                crf=crf_value,
                style=style,
                strength=strength,
                padding=padding,
                throttler=throttler,
            )

            # Final export stage
            if progress_callback:
                progress_callback(95, "EXPORTING")

            if not os.path.exists(output_video_path) or os.path.getsize(output_video_path) == 0:
                raise RuntimeError("Failed to encode or export redacted video file.")

            with open(output_video_path, "rb") as f:
                output_bytes = f.read()

        processing_time_ms = int((time.monotonic() - start_time) * 1000)

        tracks_summary, counts = track_mgr.to_contract_summary(review_threshold=review_threshold)

        result_summary: Dict[str, Any] = {
            "video": {
                "width": metadata.width,
                "height": metadata.height,
                "fps": round(metadata.fps, 2),
                "durationMs": metadata.duration_ms,
                "frames": metadata.frames,
                "hasAudio": metadata.has_audio,
            },
            "counts": counts,
            "tracks": tracks_summary,
            "redaction": {
                "style": style,
                "strength": strength,
                "padding": padding,
            },
            # With a mode, say what actually ran (model, size, thresholds) like image jobs; otherwise just the model.
            "model": (
                f"{self.model_tag}@{active_imgsz}[{mode_name}:face={thresholds['face']:.2f},plate={thresholds['plate']:.2f}]"
                if mode_name
                else self.model_tag
            ),
            "tracker": "bytetrack",
            "processingTimeMs": processing_time_ms,
        }

        return output_bytes, result_summary, "video/mp4"

    def _make_tracker(self, fps: float, floor: float, track_low_thresh: float):
        """A fresh tracker for one video (no IDs carried over from the previous job).

        Default ByteTrack settings for redaction: the class floor starts and keeps tracks, a 2-second buffer and
        match_thresh 0.75 keep IDs through camera shake. Any other configured tracker YAML is used as is.
        """
        from ultralytics.trackers.track import TRACKER_MAP
        from ultralytics.utils import YAML, IterableSimpleNamespace
        from ultralytics.utils.checks import check_yaml

        configured_tracker = getattr(settings, "video_tracker", self.tracker_config)
        if configured_tracker == "bytetrack.yaml" and self.tracker_config == "bytetrack.yaml":
            cfg = {
                "tracker_type": "bytetrack",
                "track_high_thresh": floor,
                "new_track_thresh": floor,
                "track_low_thresh": track_low_thresh,
                "track_buffer": max(60, round(fps * 2)),
                "match_thresh": 0.75,
                "fuse_score": True,
            }
        else:
            cfg = YAML.load(check_yaml(self.tracker_config))
        args = IterableSimpleNamespace(**cfg)
        return TRACKER_MAP[args.tracker_type](args=args)

    @staticmethod
    def _tracked_and_untracked(tracker, det, frame) -> List[Tuple[List[float], Optional[int], float, int]]:
        """Run the tracker on one frame's detections; return every detection, with its track ID when it has one.

        The tracker only reports confirmed tracks, so a new object's first frame and a detection that does not join
        a track would be lost (Ultralytics' model.track() drops them). Here they come back with no ID, and the
        caller keeps them if they reach their class threshold. Rows are (xyxy, track_id or None, conf, cls).
        """
        tracks = tracker.update(det, frame)
        rows = []
        used = set()
        for t in tracks:
            rows.append(([float(v) for v in t[:4]], int(t[4]), float(t[5]), int(t[6])))
            used.add(int(t[7]))
        for i in range(len(det)):
            if i not in used:
                rows.append((det.xyxy[i].tolist(), None, float(det.conf[i]), int(det.cls[i])))
        return rows

    def _track_pass(
        self,
        input_video_path: str,
        metadata: VideoMetadata,
        targets_set: set,
        thresholds: Dict[str, float],
        review_threshold: float,
        throttler: ProgressThrottler,
        imgsz: Optional[int] = None,
    ) -> TrackManager:
        """Pass 1: Detect and track faces/plates across all frames using ByteTrack."""
        cap = cv2.VideoCapture(input_video_path)
        if not cap.isOpened():
            raise InvalidInputFileError("Cannot read the video stream: not a readable MP4 video")

        track_mgr = TrackManager(fps=metadata.fps, orig_w=metadata.width, orig_h=metadata.height)
        model = self._get_model()

        frame_idx = 0
        total_frames = max(1, metadata.frames)
        untracked_counter = 500000

        target_thresholds = [thresholds[t] for t in targets_set if t in thresholds]
        floor = min(target_thresholds) if target_thresholds else min(thresholds.values())
        track_low_thresh = min(0.05, floor)

        tracker = self._make_tracker(metadata.fps, floor, track_low_thresh)

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                frame_ms = int((frame_idx / metadata.fps) * 1000)

                try:
                    results = model.predict(
                        source=frame,
                        conf=track_low_thresh,
                        imgsz=imgsz or self.imgsz,
                        verbose=False,
                    )
                    if not results or len(results) == 0 or results[0] is None:
                        raise RuntimeError("the detector returned no result")
                    boxes = self._tracked_and_untracked(tracker, results[0].boxes.cpu().numpy(), frame)
                    if boxes:
                        for xyxy, box_id, conf, cls_id in boxes:
                            raw_label = model.names.get(cls_id, str(cls_id))
                            norm_label = self.class_mapping.get(raw_label)

                            if not norm_label or norm_label not in targets_set:
                                continue

                            class_threshold = thresholds.get(norm_label, floor)

                            x1 = max(0, min(metadata.width, int(round(xyxy[0]))))
                            y1 = max(0, min(metadata.height, int(round(xyxy[1]))))
                            x2 = max(0, min(metadata.width, int(round(xyxy[2]))))
                            y2 = max(0, min(metadata.height, int(round(xyxy[3]))))

                            if x2 <= x1 or y2 <= y1:
                                continue

                            # Keep a box if its confidence reaches its class's threshold,
                            # or if its track ID is already in the TrackManager (low-score recovery).
                            # If box_id is None, perform spatial IoU recovery before creating untracked ID.
                            if box_id is not None:
                                track_id = box_id
                                if conf < class_threshold and not track_mgr.has_track(track_id):
                                    continue
                            else:
                                if conf < class_threshold:
                                    continue
                                matched_tid = None
                                best_iou = 0.0
                                for tid, trk in track_mgr.tracks.items():
                                    if trk.label != norm_label:
                                        continue
                                    for check_f in (frame_idx - 1, frame_idx - 2):
                                        pdet = trk.detections.get(check_f)
                                        if pdet is not None:
                                            pb = pdet.box
                                            ix1 = max(x1, pb[0])
                                            iy1 = max(y1, pb[1])
                                            ix2 = min(x2, pb[2])
                                            iy2 = min(y2, pb[3])
                                            inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                                            union = (x2 - x1) * (y2 - y1) + (pb[2] - pb[0]) * (pb[3] - pb[1]) - inter
                                            iou = inter / union if union > 0 else 0.0
                                            if iou > 0.40 and iou > best_iou:
                                                best_iou = iou
                                                matched_tid = tid
                                if matched_tid is not None:
                                    track_id = matched_tid
                                else:
                                    track_id = untracked_counter
                                    untracked_counter += 1

                            face_roi = None
                            plate_roi = None
                            sharpness = 0.0
                            if norm_label == "face":
                                face_roi = frame[y1:y2, x1:x2]
                                if face_roi.size > 0:
                                    gray_roi = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
                                    sharpness = float(cv2.Laplacian(gray_roi, cv2.CV_64F).var())
                            elif norm_label == "plate":
                                plate_roi = frame[y1:y2, x1:x2]

                            track_mgr.add_detection(
                                track_id=track_id,
                                label=norm_label,
                                frame_idx=frame_idx,
                                frame_ms=frame_ms,
                                box=[x1, y1, x2, y2],
                                confidence=conf,
                                face_roi=face_roi,
                                plate_roi=plate_roi,
                                sharpness=sharpness,
                            )
                except Exception as track_err:
                    # Fail the job: a frame without detections would be rendered unredacted in a COMPLETED video.
                    raise RuntimeError(f"Detection failed on frame {frame_idx}: {track_err}") from track_err

                frame_idx += 1
                throttler.update_range(
                    current_step=frame_idx,
                    total_steps=total_frames,
                    start_pct=10,
                    end_pct=45,
                    stage="DETECTING",
                )

        finally:
            cap.release()

        # Bridge tracking dropouts and record gaps
        track_mgr.interpolate_gaps()
        # Hold blur around detected frames
        track_mgr.apply_holds()
        # Compute low confidence ranges
        track_mgr.compute_ranges(review_threshold=review_threshold)

        return track_mgr

    def _render_pass(
        self,
        input_video_path: str,
        output_video_path: str,
        audio_path: Optional[str],
        metadata: VideoMetadata,
        track_mgr: TrackManager,
        crf: int,
        style: str,
        strength: int,
        padding: float,
        throttler: ProgressThrottler,
    ):
        """Pass 2: Apply padding, mask targets, and encode output video via FFmpeg pipe."""
        cap = cv2.VideoCapture(input_video_path)
        if not cap.isOpened():
            raise InvalidInputFileError("Cannot reopen the video for rendering")

        ffmpeg_writer = self._create_ffmpeg_writer(
            output_video_path=output_video_path,
            audio_path=audio_path,
            metadata=metadata,
            crf=crf,
        )

        cv_writer = None
        if ffmpeg_writer is None:
            logger.warning("FFmpeg binary not available; falling back to OpenCV VideoWriter (audio will be omitted)")
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            cv_writer = cv2.VideoWriter(
                output_video_path, fourcc, metadata.fps, (metadata.width, metadata.height)
            )

        frame_idx = 0
        total_frames = max(1, metadata.frames)

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                # Retrieve all active redaction boxes for this frame
                active_boxes = track_mgr.get_active_redactions(frame_idx)
                for box in active_boxes:
                    x1, y1, x2, y2 = box
                    w_box = x2 - x1
                    h_box = y2 - y1
                    pad_x = int(w_box * padding)
                    pad_y = int(h_box * padding)

                    px1 = max(0, x1 - pad_x)
                    py1 = max(0, y1 - pad_y)
                    px2 = min(metadata.width, x2 + pad_x)
                    py2 = min(metadata.height, y2 + pad_y)

                    if px2 > px1 and py2 > py1:
                        roi = frame[py1:py2, px1:px2]
                        redacted_roi = self._apply_redaction_style(roi, style, strength)
                        frame[py1:py2, px1:px2] = redacted_roi

                if ffmpeg_writer is not None:
                    try:
                        ffmpeg_writer.stdin.write(frame.tobytes())
                    except Exception as pipe_err:
                        logger.error(f"Error piping frame to FFmpeg: {pipe_err}")
                        break
                elif cv_writer is not None:
                    cv_writer.write(frame)

                frame_idx += 1
                throttler.update_range(
                    current_step=frame_idx,
                    total_steps=total_frames,
                    start_pct=50,
                    end_pct=90,
                    stage="RENDERING",
                )

        finally:
            cap.release()
            if ffmpeg_writer is not None:
                # communicate() closes stdin itself. Closing it first raises ValueError on POSIX, where it flushes stdin.
                _, stderr_data = ffmpeg_writer.communicate(timeout=60)
                if ffmpeg_writer.returncode != 0:
                    err_msg = stderr_data.decode("utf-8", errors="ignore") if stderr_data else "Unknown error"
                    logger.error(f"FFmpeg encoding exited with code {ffmpeg_writer.returncode}: {err_msg}")
                    raise RuntimeError(f"FFmpeg encoding failed with code {ffmpeg_writer.returncode}: {err_msg}")
            if cv_writer is not None:
                cv_writer.release()

        throttler.update_range(
            current_step=total_frames,
            total_steps=total_frames,
            start_pct=50,
            end_pct=90,
            stage="RENDERING",
            force=True,
        )

    def _create_ffmpeg_writer(
        self,
        output_video_path: str,
        audio_path: Optional[str],
        metadata: VideoMetadata,
        crf: int,
    ) -> Optional[subprocess.Popen]:
        """Creates an FFmpeg subprocess that accepts raw BGR frames on stdin and remuxes audio."""
        # Why: stderr is a pipe nobody reads until the end, so it must stay small enough
        # not to block ffmpeg. Error output is kept.
        cmd = [
            self.ffmpeg_bin,
            "-nostats",
            "-loglevel", "error",
            "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{metadata.width}x{metadata.height}",
            "-pix_fmt", "bgr24",
            "-r", f"{metadata.fps}",
            "-i", "-",  # Read raw BGR24 frames from stdin pipe
        ]

        if audio_path and os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
            cmd.extend([
                "-i", audio_path,
                "-map", "0:v:0",
                "-map", "1:a:0?",
                "-c:a", "copy",
            ])
        else:
            cmd.extend([
                "-map", "0:v:0",
            ])

        encoder = getattr(self, "video_encoder", "libx264")
        if encoder == "libx264":
            cmd.extend([
                "-c:v", "libx264",
                "-crf", str(crf),
                "-preset", "fast",
                "-x264-params", f"rc-lookahead={X264_RC_LOOKAHEAD}",
                "-pix_fmt", "yuv420p",
            ])
        elif encoder == "h264_mf":
            quality_val = max(40, min(95, int(100 - (crf - 18) * 4.5)))
            cmd.extend([
                "-c:v", "h264_mf",
                "-rate_control", "quality",
                "-quality", str(quality_val),
                "-pix_fmt", "yuv420p",
            ])
        elif encoder == "libopenh264":
            cmd.extend([
                "-c:v", "libopenh264",
                "-crf", str(crf),
                "-b:v", "2M",
                "-pix_fmt", "yuv420p",
            ])
        else:
            cmd.extend([
                "-c:v", "mpeg4",
                "-crf", str(crf),
                "-q:v", "3",
                "-pix_fmt", "yuv420p",
            ])

        cmd.extend([
            "-shortest",
            "-map_metadata", "-1",  # Strip GPS/location and device metadata per Contract §2B
            "-movflags", "+faststart",
            output_video_path,
        ])

        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            return proc
        except Exception as e:
            logger.warning(f"Could not spawn FFmpeg subprocess: {e}")
            return None
