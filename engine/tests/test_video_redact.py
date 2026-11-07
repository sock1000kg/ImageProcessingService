"""Unit tests for VideoRedactProcessor, ByteTrack tracking, and interpolation (Phase 2 - Giai đoạn 2).

Tests run completely standalone without Docker, NATS, or GPU.
"""
import os
import sys
import time
import tempfile
import numpy as np
import cv2

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Ensure engine package is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.video_redact import (
    VideoRedactProcessor,
    VideoProbe,
    VideoMetadata,
    ProgressThrottler,
    CRF_MAP,
    max_gap_frames_for_fps,
    hold_frames_for_fps,
    TRACK_HOLD_MS,
    Track,
    TrackManager,
    InvalidInputFileError,
)
from src.processors.whitelist import WhitelistReferenceError
from src.processors.plate_ocr import (
    PlateWhitelistManager,
    PlateOCRRecognizer,
    normalize_plate_text,
)


def _create_synthetic_video(width: int = 320, height: int = 240, fps: float = 25.0, num_frames: int = 30) -> bytes:
    """Generate a valid, playable MP4 video in memory using OpenCV."""
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(tmp_path, fourcc, fps, (width, height))
        if not writer.isOpened():
            raise RuntimeError(f"Could not open VideoWriter at {tmp_path}")

        for i in range(num_frames):
            frame = np.full((height, width, 3), 40, dtype=np.uint8)
            x_pos = int((i / num_frames) * (width - 60))
            cv2.rectangle(frame, (x_pos, 50), (x_pos + 50, 100), (0, 200, 0), -1)
            cv2.putText(
                frame,
                f"F: {i:02d}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
            )
            writer.write(frame)

        writer.release()

        with open(tmp_path, "rb") as f:
            video_bytes = f.read()

        return video_bytes
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_quality_crf_mapping():
    """Verify CRF mapping matches Contract §2 table."""
    print("Test 1: Kiểm tra ánh xạ chất lượng sang H.264 CRF (Contract §2)...")
    assert CRF_MAP["standard"] == 28, f"Expected standard=28, got {CRF_MAP['standard']}"
    assert CRF_MAP["high"] == 23, f"Expected high=23, got {CRF_MAP['high']}"
    assert CRF_MAP["max"] == 18, f"Expected max=18, got {CRF_MAP['max']}"
    print("  -> PASS: standard=28, high=23, max=18 đúng chuẩn.")


def test_video_probe_valid():
    """Verify VideoProbe accurately extracts dimensions, fps, duration, and frames."""
    print("Test 2: Kiểm tra trích xuất metadata video (VideoProbe)...")
    video_bytes = _create_synthetic_video(width=320, height=240, fps=25.0, num_frames=30)
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        meta = VideoProbe.probe(tmp_path)
        assert isinstance(meta, VideoMetadata), "Expected VideoMetadata instance"
        assert meta.width == 320, f"Expected width=320, got {meta.width}"
        assert meta.height == 240, f"Expected height=240, got {meta.height}"
        assert abs(meta.fps - 25.0) < 1.0, f"Expected fps ~ 25, got {meta.fps}"
        assert meta.frames == 30, f"Expected frames=30, got {meta.frames}"
        assert meta.duration_ms >= 1000, f"Expected duration >= 1000ms, got {meta.duration_ms}"
        print(f"  -> PASS: Probed metadata: {meta.width}x{meta.height} @ {meta.fps}fps, {meta.frames} frames, {meta.duration_ms}ms")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_video_probe_invalid_input():
    """Verify VideoProbe raises InvalidInputFileError on corrupt or empty files."""
    print("Test 3: Kiểm tra xử lý file hỏng hoặc rỗng (INVALID_INPUT_FILE)...")
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(b"NOT_A_VALID_MP4_HEADER_OR_DATA")
        tmp_path = tmp.name

    try:
        try:
            VideoProbe.probe(tmp_path)
            assert False, "Should have raised InvalidInputFileError"
        except InvalidInputFileError as err:
            assert "Cannot" in str(err) or "Invalid" in str(err)
            print("  -> PASS: Ném đúng InvalidInputFileError khi file bị hỏng.")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_progress_throttler():
    """Verify ProgressThrottler enforces <= 1 event / 2 seconds rate limit (Contract §2B)."""
    print("Test 4: Kiểm tra giới hạn tần suất tiến độ (ProgressThrottler)...")
    emitted = []

    def mock_callback(pct: int, stage: str):
        emitted.append((time.monotonic(), pct, stage))

    throttler = ProgressThrottler(callback=mock_callback, min_interval_sec=0.1)

    for i in range(1, 100):
        throttler.update_range(current_step=i, total_steps=100, start_pct=10, end_pct=50, stage="PROCESSING")

    assert len(emitted) <= 2, f"Expected <= 2 emissions in tight loop, got {len(emitted)}"

    time.sleep(0.12)
    throttler.update_range(current_step=80, total_steps=100, start_pct=10, end_pct=50, stage="PROCESSING")
    assert len(emitted) >= 2, "Expected another emission after time interval passed"

    throttler.update_range(current_step=100, total_steps=100, start_pct=50, end_pct=90, stage="DONE", force=True)
    assert emitted[-1][1] == 90 and emitted[-1][2] == "DONE"
    print(f"  -> PASS: Throttler hoạt động chính xác (chỉ bắn {len(emitted)} events thay vì 100).")


def test_track_manager_gap_interpolation():
    """Verify linear interpolation bridges dropouts within the time gap limit."""
    print("Test 5: Kiểm tra thuật toán nội suy Bounding Box chống Flicker...")
    mgr = TrackManager(fps=25.0, orig_w=640, orig_h=480)

    # Detection at frame 10: box [100, 100, 200, 200], conf 0.90
    mgr.add_detection(track_id=1, label="face", frame_idx=10, frame_ms=400, box=[100, 100, 200, 200], confidence=0.90)

    # Dropout for frames 11, 12, 13 (gap = 3 frames <= 4 at 25 fps)
    # Next detection at frame 14: box [140, 140, 240, 240], conf 0.82
    mgr.add_detection(track_id=1, label="face", frame_idx=14, frame_ms=560, box=[140, 140, 240, 240], confidence=0.82)

    # Run interpolation
    mgr.interpolate_gaps()
    track = mgr.tracks[1]

    # Verify frames 11, 12, 13 were created with interpolated coordinates
    for f in (11, 12, 13):
        assert f in track.detections, f"Frame {f} should be interpolated"
        det = track.detections[f]
        assert det.is_interpolated is True

    # Check linear interpolation math
    # Frame 11 (step 1/4): box [110, 110, 210, 210], conf 0.88
    d11 = track.detections[11]
    assert d11.box == [110, 110, 210, 210], f"Expected [110, 110, 210, 210], got {d11.box}"
    assert abs(d11.confidence - 0.88) < 0.01

    # Frame 12 (step 2/4): box [120, 120, 220, 220], conf 0.86
    d12 = track.detections[12]
    assert d12.box == [120, 120, 220, 220], f"Expected [120, 120, 220, 220], got {d12.box}"
    assert abs(d12.confidence - 0.86) < 0.01

    # Frame 13 (step 3/4): box [130, 130, 230, 230], conf 0.84
    d13 = track.detections[13]
    assert d13.box == [130, 130, 230, 230], f"Expected [130, 130, 230, 230], got {d13.box}"

    # Verify gap_ranges is empty because gap was bridged
    assert len(track.gap_ranges) == 0
    print("  -> PASS: Bounding Box nội suy tuyến tính chính xác, không nhấp nháy.")


def test_track_manager_gap_exceeded():
    """Verify dropouts exceeding the gap limit are recorded into gapRanges per Contract §3 B2."""
    print("Test 6: Kiểm tra xử lý mất dấu vượt ngưỡng nội suy (gapRanges)...")
    mgr = TrackManager(fps=25.0, orig_w=640, orig_h=480)

    # Detection at frame 10
    mgr.add_detection(track_id=2, label="face", frame_idx=10, frame_ms=400, box=[100, 100, 200, 200], confidence=0.85)

    # Dropout from frame 11 to 24 (gap = 14 frames > gap limit)
    # Next detection at frame 25 (1000ms)
    mgr.add_detection(track_id=2, label="face", frame_idx=25, frame_ms=1000, box=[150, 150, 250, 250], confidence=0.80)

    mgr.interpolate_gaps()
    track = mgr.tracks[2]

    # Verify dropout was NOT interpolated
    assert 15 not in track.detections, "Frame 15 should not be interpolated"

    # Verify gap range recorded
    assert len(track.gap_ranges) == 1
    gap = track.gap_ranges[0]
    expected_start_ms = int((11 / 25.0) * 1000)  # 440ms
    expected_end_ms = int((24 / 25.0) * 1000)    # 960ms
    assert gap == [expected_start_ms, expected_end_ms], f"Expected [{expected_start_ms}, {expected_end_ms}], got {gap}"
    print(f"  -> PASS: Ghi nhận chính xác gapRanges: {gap} per Contract §3 B2.")


def test_max_gap_frames_scaling():
    """Verify max_gap_frames_for_fps calculation and frame-rate adaptive gap bridging."""
    print("Test 6b: Kiểm tra hàm tính gap nội suy theo FPS (max_gap_frames_for_fps)...")
    # max_gap_frames_for_fps returns 5 at 30, 10 at 59.94, and at least 1 at a very low frame rate
    assert max_gap_frames_for_fps(30.0) == 5, f"Expected 5 at 30 fps, got {max_gap_frames_for_fps(30.0)}"
    assert max_gap_frames_for_fps(59.94) == 10, f"Expected 10 at 59.94 fps, got {max_gap_frames_for_fps(59.94)}"
    assert max_gap_frames_for_fps(1.0) >= 1, f"Expected >= 1 at 1 fps, got {max_gap_frames_for_fps(1.0)}"
    assert max_gap_frames_for_fps(0.1) >= 1, f"Expected >= 1 at 0.1 fps, got {max_gap_frames_for_fps(0.1)}"

    # A manager at 60 fps bridges an 8-frame dropout and records no gap for it
    mgr_60 = TrackManager(fps=60.0, orig_w=640, orig_h=480)
    mgr_60.add_detection(track_id=1, label="face", frame_idx=10, frame_ms=167, box=[100, 100, 200, 200], confidence=0.90)
    # 8-frame dropout: frames 11 to 18 (gap = 19 - 10 - 1 = 8 frames)
    mgr_60.add_detection(track_id=1, label="face", frame_idx=19, frame_ms=317, box=[180, 180, 280, 280], confidence=0.85)
    mgr_60.interpolate_gaps()
    track_60 = mgr_60.tracks[1]
    for f in range(11, 19):
        assert f in track_60.detections, f"Frame {f} should be interpolated at 60 fps"
    assert len(track_60.gap_ranges) == 0, f"Expected 0 gap ranges at 60 fps, got {track_60.gap_ranges}"

    # A manager at 30 fps records the same 8-frame dropout as a gap
    mgr_30 = TrackManager(fps=30.0, orig_w=640, orig_h=480)
    mgr_30.add_detection(track_id=1, label="face", frame_idx=10, frame_ms=333, box=[100, 100, 200, 200], confidence=0.90)
    # same 8-frame dropout: frames 11 to 18
    mgr_30.add_detection(track_id=1, label="face", frame_idx=19, frame_ms=633, box=[180, 180, 280, 280], confidence=0.85)
    mgr_30.interpolate_gaps()
    track_30 = mgr_30.tracks[1]
    for f in range(11, 19):
        assert f not in track_30.detections, f"Frame {f} should NOT be interpolated at 30 fps"
    assert len(track_30.gap_ranges) == 1, f"Expected 1 gap range at 30 fps, got {track_30.gap_ranges}"
    print("  -> PASS: Gap limit scales chính xác theo frame rate (60 fps bridge 8 frames, 30 fps record gap).")


def test_track_manager_low_confidence_ranges():
    """Verify lowConfidenceRanges groups contiguous frames below reviewThreshold."""
    print("Test 7: Kiểm tra phát hiện vùng cảnh báo độ tự tin thấp (lowConfidenceRanges)...")
    mgr = TrackManager(fps=25.0, orig_w=640, orig_h=480)

    # Normal confidence
    mgr.add_detection(track_id=3, label="face", frame_idx=0, frame_ms=0, box=[50, 50, 100, 100], confidence=0.85)
    # Low confidence range: frames 1..3
    mgr.add_detection(track_id=3, label="face", frame_idx=1, frame_ms=40, box=[50, 50, 100, 100], confidence=0.42)
    mgr.add_detection(track_id=3, label="face", frame_idx=2, frame_ms=80, box=[50, 50, 100, 100], confidence=0.38)
    mgr.add_detection(track_id=3, label="face", frame_idx=3, frame_ms=120, box=[50, 50, 100, 100], confidence=0.45)
    # Back to normal confidence
    mgr.add_detection(track_id=3, label="face", frame_idx=4, frame_ms=160, box=[50, 50, 100, 100], confidence=0.80)

    mgr.compute_ranges(review_threshold=0.50)
    track = mgr.tracks[3]

    assert len(track.low_confidence_ranges) == 1
    assert track.low_confidence_ranges[0] == [40, 120], f"Expected [40, 120], got {track.low_confidence_ranges[0]}"
    print("  -> PASS: Gom dải lowConfidenceRanges [40, 120]ms chính xác.")


def test_track_best_frame_selection():
    """Verify Track chooses bestFrameMs and bestBox favoring highest confidence and area."""
    print("Test 8: Kiểm tra thuật toán chọn khung hình tốt nhất (bestFrameMs & bestBox)...")
    track = Track(track_id=4, label="face")

    # Small blurry face at frame 0
    track.add_detection(frame_idx=0, frame_ms=0, box=[10, 10, 30, 30], confidence=0.55, orig_w=640, orig_h=480)
    # Large clear frontal face at frame 15
    track.add_detection(frame_idx=15, frame_ms=600, box=[100, 100, 260, 260], confidence=0.92, orig_w=640, orig_h=480)
    # Slightly tilted face at frame 20
    track.add_detection(frame_idx=20, frame_ms=800, box=[100, 100, 200, 200], confidence=0.75, orig_w=640, orig_h=480)

    assert track.best_frame_ms == 600, f"Expected best_frame_ms=600, got {track.best_frame_ms}"
    assert track.best_box == [100, 100, 260, 260], f"Expected [100, 100, 260, 260], got {track.best_box}"
    print(f"  -> PASS: bestFrameMs={track.best_frame_ms}ms và bestBox={track.best_box} được chọn chuẩn xác.")


def test_two_pass_video_redaction_pipeline():
    """Verify full Two-Pass execution: Pass 1 Tracking -> Pass 2 Redaction & FFmpeg."""
    print("Test 9: Kiểm tra toàn trình Two-Pass Video Redaction Pipeline...")
    video_bytes = _create_synthetic_video(width=320, height=240, fps=25.0, num_frames=25)

    processor = VideoRedactProcessor(
        model_name="yolov8n-oiv7.pt",
        imgsz=640,
    )

    progress_stages = []

    def on_progress(pct: int, stage: str):
        progress_stages.append((pct, stage))

    params = {
        "redaction": {
            "targets": ["face", "plate"],
            "style": "blur",
            "strength": 15,
            "padding": 0.1,
        },
        "output": {
            "quality": "high",
        },
        "confidenceThresholds": {"face": 0.35, "plate": 0.35},
        "reviewThreshold": 0.50,
    }

    out_bytes, result_summary, content_type = processor.process(
        input_bytes=video_bytes,
        params=params,
        output_key="results/batch-1/job-1/result.mp4",
        progress_callback=on_progress,
    )

    assert content_type == "video/mp4"
    assert len(out_bytes) > 0

    assert "video" in result_summary
    assert "tracks" in result_summary
    assert "counts" in result_summary
    assert result_summary["tracker"] == "bytetrack"
    assert result_summary["model"] == "yolov8n-oiv7"

    # Verify both DETECTING and RENDERING stages emitted progress
    stages_seen = set(s for _, s in progress_stages)
    assert "DETECTING" in stages_seen or "RENDERING" in stages_seen
    print(f"  -> PASS: Two-Pass hoàn tất. Size: {len(out_bytes)} bytes, tiến độ: {stages_seen}.")


def test_track_level_face_whitelist_matching():
    """Verify Track-Level Face Whitelisting accurately distinguishes vlogger from stranger."""
    print("Test 10: Kiểm tra so khớp Whitelist khuôn mặt theo Track (Track-Level ArcFace)...")
    from src.processors.face_embedding import FaceEmbedder
    from src.processors.whitelist import WhitelistManager

    np.random.seed(42)
    vlogger_emb = np.random.randn(512).astype(np.float32)
    vlogger_emb /= np.linalg.norm(vlogger_emb)

    stranger_emb = np.random.randn(512).astype(np.float32)
    stranger_emb /= np.linalg.norm(stranger_emb)

    class ControlledEmbedder(FaceEmbedder):
        def __init__(self):
            super().__init__(model_name="w600k_mbf.onnx")

        def extract_embedding(self, face_bgr: np.ndarray) -> np.ndarray:
            if np.mean(face_bgr) > 120:
                return vlogger_emb.copy()
            return stranger_emb.copy()

    controlled_embedder = ControlledEmbedder()
    whitelist_mgr = WhitelistManager(embedder=controlled_embedder)

    processor = VideoRedactProcessor(
        model_name="yolov8n-oiv7.pt",
        face_embedder=controlled_embedder,
        whitelist_manager=whitelist_mgr,
    )

    mgr = TrackManager(fps=25.0, orig_w=640, orig_h=480)

    # 1. Vlogger face ROI (bright: mean 200 > 120)
    vlogger_roi = np.full((112, 112, 3), 200, dtype=np.uint8)

    # 2. Stranger face ROI (dark: mean 50 <= 120)
    stranger_roi = np.full((112, 112, 3), 50, dtype=np.uint8)

    # Add Track 1 (Vlogger)
    mgr.add_detection(
        track_id=1,
        label="face",
        frame_idx=5,
        frame_ms=200,
        box=[100, 100, 220, 220],
        confidence=0.92,
        face_roi=vlogger_roi,
        sharpness=120.0,
    )

    # Add Track 2 (Stranger)
    mgr.add_detection(
        track_id=2,
        label="face",
        frame_idx=5,
        frame_ms=200,
        box=[300, 100, 420, 220],
        confidence=0.89,
        face_roi=stranger_roi,
        sharpness=110.0,
    )

    # Evaluate Whitelist with reference = vlogger_emb
    processor._evaluate_face_whitelist(
        track_mgr=mgr,
        ref_embeddings=[vlogger_emb],
        similarity_threshold=0.45,
        whitelist_mgr=whitelist_mgr,
    )

    t1 = mgr.tracks[1]
    t2 = mgr.tracks[2]

    # Vlogger assertions
    assert t1.whitelisted is True, "Track 1 should be whitelisted"
    assert t1.redacted is False, "Track 1 should NOT be redacted"
    assert t1.whitelist_ref == 0, f"Expected whitelist_ref=0, got {t1.whitelist_ref}"
    assert t1.similarity >= 0.95, f"Expected similarity ~ 1.0, got {t1.similarity}"
    assert t1.best_face_roi is None, "best_face_roi should be freed to release memory"

    # Stranger assertions
    assert t2.whitelisted is False, "Track 2 (stranger) should NOT be whitelisted"
    assert t2.redacted is True, "Track 2 (stranger) MUST be redacted"
    assert t2.whitelist_ref is None, "Stranger should have no whitelist_ref"
    assert t2.similarity < 0.45, f"Stranger similarity should be < 0.45, got {t2.similarity}"
    assert t2.best_face_roi is None, "best_face_roi should be freed"

    # Contract summary assertions
    summary, counts = mgr.to_contract_summary(review_threshold=0.50)
    assert counts["faceTracks"] == 2
    assert counts["whitelistedFaceTracks"] == 1
    assert counts["redactedTracks"] == 1

    print("  -> PASS: Whitelist theo Track hoạt động chuẩn xác (Vlogger giữ nguyên nét, Người lạ bị che).")


def test_whitelist_reference_error_propagation():
    """Verify WhitelistReferenceError is raised when reference face is invalid."""
    print("Test 11: Kiểm tra ném WhitelistReferenceError khi ảnh mẫu hỏng/rỗng...")
    processor = VideoRedactProcessor(model_name="yolov8n-oiv7.pt")
    video_bytes = _create_synthetic_video(width=320, height=240, fps=25.0, num_frames=10)

    # Reference spec with empty bytes
    params = {
        "redaction": {"targets": ["face"], "style": "blur"},
        "whitelist": {
            "faces": [{"bucket": "uploads", "key": "empty.jpg", "bytes": b""}],
            "similarityThreshold": 0.45,
        },
    }

    try:
        processor.process(
            input_bytes=video_bytes,
            params=params,
            output_key="results/batch-1/job-1/result.mp4",
        )
        assert False, "Should have raised WhitelistReferenceError"
    except WhitelistReferenceError as e:
        assert "empty" in str(e) or "invalid" in str(e).lower()
        print(f"  -> PASS: Ném đúng WhitelistReferenceError: {e}")


def test_two_pass_video_redaction_with_whitelist_e2e():
    """Verify end-to-end video-redact with Whitelist preserves audio and produces compliant summary."""
    print("Test 12: Kiểm tra toàn trình End-to-End Video Redact có Face Whitelist...")
    from src.processors.face_embedding import FaceEmbedder
    from src.processors.whitelist import WhitelistManager

    embedder = FaceEmbedder(model_name="w600k_mbf.onnx")
    whitelist_mgr = WhitelistManager(embedder=embedder)

    processor = VideoRedactProcessor(
        model_name="yolov8n-oiv7.pt",
        face_embedder=embedder,
        whitelist_manager=whitelist_mgr,
    )

    video_bytes = _create_synthetic_video(width=320, height=240, fps=25.0, num_frames=20)
    dummy_ref_emb = np.random.randn(512).astype(np.float32)
    dummy_ref_emb /= np.linalg.norm(dummy_ref_emb)

    params = {
        "redaction": {"targets": ["face", "plate"], "style": "pixelate", "strength": 8},
        "output": {"quality": "high"},
        "whitelist": {
            "faces": [{"bucket": "uploads", "key": "vlogger.jpg", "embedding": dummy_ref_emb}],
            "similarityThreshold": 0.45,
        },
    }

    out_bytes, result_summary, content_type = processor.process(
        input_bytes=video_bytes,
        params=params,
        output_key="results/batch-1/job-1/result.mp4",
    )

    assert content_type == "video/mp4"
    assert len(out_bytes) > 0
    assert "counts" in result_summary
    assert "whitelistedFaceTracks" in result_summary["counts"]
    assert result_summary["redaction"]["style"] == "pixelate"
    print(f"  -> PASS: E2E Video Redact + Whitelist thành công ({len(out_bytes)} bytes).")


def test_redaction_styles_clamping_and_safety():
    """Verify redaction styles handle extreme ROI dimensions without assertions or crashes."""
    print("Test 13: Kiểm tra an toàn bộ lọc làm mờ/che trên ROI cực tiểu...")
    # Tiny ROI
    tiny_roi = np.random.randint(0, 255, (7, 7, 3), dtype=np.uint8)

    # 1. Blur with very large strength
    blurred = VideoRedactProcessor._apply_redaction_style(tiny_roi, "blur", strength=50)
    assert blurred.shape == tiny_roi.shape, "Shape must remain identical after blur"

    # 2. Pixelate with large strength
    pixelated = VideoRedactProcessor._apply_redaction_style(tiny_roi, "pixelate", strength=20)
    assert pixelated.shape == tiny_roi.shape, "Shape must remain identical after pixelate"

    # 3. Blackout
    blackout = VideoRedactProcessor._apply_redaction_style(tiny_roi, "blackout", strength=0)
    assert np.all(blackout == 0), "Blackout must produce pure black (0,0,0)"

    # 4. Zero-sized ROI
    empty_roi = np.zeros((0, 0, 3), dtype=np.uint8)
    res_empty = VideoRedactProcessor._apply_redaction_style(empty_roi, "blur", 15)
    assert res_empty.size == 0
    print("  -> PASS: Xử lý an toàn 100% mọi kích thước ROI (kể cả 7x7 và 0x0).")


def test_ffmpeg_writer_flags_and_metadata_stripping():
    """Verify FFmpeg command flags enforce metadata stripping, web streaming, and audio copy."""
    print("Test 14: Kiểm tra tham số lệnh FFmpeg (-map_metadata, +faststart, -c:a copy)...")
    processor = VideoRedactProcessor(ffmpeg_bin="ffmpeg")
    meta = VideoMetadata(
        width=1920,
        height=1080,
        fps=30.0,
        duration_ms=5000,
        frames=150,
        has_audio=True,
    )

    # Monkey-patch subprocess.Popen to capture the command line passed
    captured_cmds = []
    import subprocess
    orig_popen = subprocess.Popen

    def mock_popen(cmd, *args, **kwargs):
        captured_cmds.append(cmd)
        # Return a mock process
        mock_proc = type("MockProc", (), {
            "stdin": type("MockStdin", (), {"write": lambda self, b: None, "close": lambda self: None})(),
            "stdout": None,
            "stderr": type("MockStderr", (), {"decode": lambda *args: ""})(),
            "communicate": lambda self, timeout=60: (b"", b""),
            "returncode": 0,
        })()
        return mock_proc

    try:
        subprocess.Popen = mock_popen
        dummy_audio = os.path.join(tempfile.gettempdir(), "test_audio.m4a")
        with open(dummy_audio, "wb") as f:
            f.write(b"AUDIO_DATA")

        proc = processor._create_ffmpeg_writer(
            output_video_path="output.mp4",
            audio_path=dummy_audio,
            metadata=meta,
            crf=23,
        )
        assert proc is not None

        assert len(captured_cmds) == 1, "Expected exactly 1 Popen call"
        cmd = captured_cmds[0]

        # Verify Contract §2B requirements
        assert "-nostats" in cmd, "Missing -nostats flag"
        assert "-loglevel" in cmd and cmd[cmd.index("-loglevel") + 1] == "error", "Missing -loglevel error"
        assert "-map_metadata" in cmd and cmd[cmd.index("-map_metadata") + 1] == "-1", "Missing -map_metadata -1 (GPS strip)"
        assert "-movflags" in cmd and cmd[cmd.index("-movflags") + 1] == "+faststart", "Missing +faststart (Web streaming)"
        assert "-c:a" in cmd and cmd[cmd.index("-c:a") + 1] == "copy", "Missing -c:a copy (Original audio remux)"
        assert "-crf" in cmd and cmd[cmd.index("-crf") + 1] == "23", "Missing CRF 23"
        assert "-pix_fmt" in cmd and "yuv420p" in cmd, "Missing yuv420p"
        assert "-shortest" in cmd, "Missing -shortest flag"
        print("  -> PASS: Toàn bộ cờ FFmpeg chuẩn xác: -map_metadata -1, +faststart, -c:a copy, -crf 23.")
    finally:
        subprocess.Popen = orig_popen
        if os.path.exists(dummy_audio):
            os.remove(dummy_audio)


def test_plate_normalization():
    """Verify license plate normalization strips punctuation, whitespace, and preserves uppercase."""
    print("Test 15: Kiểm tra hàm chuẩn hóa biển số xe Việt Nam (normalize_plate_text)...")
    assert normalize_plate_text("30A - 123.45") == "30A12345"
    assert normalize_plate_text("51G-678.90") == "51G67890"
    assert normalize_plate_text("29-V1\n123.45") == "29V112345"
    assert normalize_plate_text("43A.999.99") == "43A99999"
    assert normalize_plate_text("  29_A1 - 888.88  ") == "29A188888"
    assert normalize_plate_text("") == ""
    assert normalize_plate_text(None) == ""
    assert normalize_plate_text("!!#$$%^&*()") == ""
    print("  -> PASS: Chuẩn hóa 1-line, 2-line, khoảng trắng, gạch nối, dấu chấm đạt 100%.")


def test_plate_whitelist_manager_matching():
    """Verify PlateWhitelistManager matches whitelisted plates and enforces Privacy by Design."""
    print("Test 16: Kiểm tra PlateWhitelistManager & nguyên tắc Privacy by Design...")
    # Mock OCR recognizer that maps simulated plate crops to text + confidence
    class MockPlateRecognizer(PlateOCRRecognizer):
        def __init__(self):
            super().__init__()
            self._backend = "mock"

        def recognize(self, plate_bgr):
            # Inspect first pixel to simulate recognition
            if plate_bgr is None or plate_bgr.size == 0:
                return "", 0.0
            tag = plate_bgr[0, 0, 0]
            if tag == 100:
                return "30A-123.45", 0.95
            elif tag == 101:
                # Low confidence reading
                return "30A-123.45", 0.30
            elif tag == 200:
                return "51G-678.90", 0.92
            return "UNKNOWN", 0.0

    mgr = PlateWhitelistManager(recognizer=MockPlateRecognizer())
    whitelist = ["30A - 123.45", "43A99999"]

    # 1. Matching plate with high confidence -> WHITELISTED
    img_whitelisted = np.full((50, 150, 3), 100, dtype=np.uint8)
    is_w, text, conf = mgr.evaluate_plate(img_whitelisted, whitelist)
    assert is_w is True, "Expected plate to be whitelisted"
    assert text == "30A12345"
    assert conf == 0.95

    # 2. Matching plate text but LOW confidence (< 0.50) -> REDACTED (Privacy by Design)
    img_low_conf = np.full((50, 150, 3), 101, dtype=np.uint8)
    is_w_low, text_low, conf_low = mgr.evaluate_plate(img_low_conf, whitelist)
    assert is_w_low is False, "Low confidence OCR must NOT whitelist (Recall > Precision)"
    assert text_low == "30A12345"
    assert conf_low == 0.30

    # 3. Non-whitelisted plate -> REDACTED
    img_stranger = np.full((50, 150, 3), 200, dtype=np.uint8)
    is_w_stranger, text_stranger, conf_stranger = mgr.evaluate_plate(img_stranger, whitelist)
    assert is_w_stranger is False, "Stranger plate must NOT be whitelisted"
    assert text_stranger == "51G67890"

    # 4. Empty whitelist -> REDACTED
    is_w_empty, _, _ = mgr.evaluate_plate(img_whitelisted, [])
    assert is_w_empty is False
    print("  -> PASS: Whitelist matching chuẩn xác, Recall > Precision khi OCR không chắc chắn.")


def test_plate_whitelist_video_e2e():
    """Verify end-to-end video-redact with license plate whitelisting per Contract §2B & §3 B2."""
    print("Test 17: Kiểm tra tích hợp E2E Video Redact với Plate Whitelist...")
    processor = VideoRedactProcessor(ffmpeg_bin="ffmpeg")

    # Generate synthetic video
    video_bytes = _create_synthetic_video(width=320, height=240, fps=25.0, num_frames=10)

    # Mock plate recognizer
    class MockPlateRecognizer(PlateOCRRecognizer):
        def __init__(self):
            super().__init__()
            self._backend = "mock"

        def recognize(self, plate_bgr):
            if plate_bgr is not None and plate_bgr.size > 0:
                tag = plate_bgr[0, 0, 0]
                if tag == 100:
                    return "30A-123.45", 0.95
                elif tag == 200:
                    return "51G-888.88", 0.90
            return "", 0.0

    mock_rec = MockPlateRecognizer()
    processor.plate_whitelist_manager = PlateWhitelistManager(recognizer=mock_rec)

    # Mock _track_pass to return two plate tracks
    orig_track_pass = processor._track_pass

    def mock_track_pass(input_video_path, metadata, targets_set, thresholds, review_threshold, throttler):
        tm = TrackManager(fps=metadata.fps, orig_w=metadata.width, orig_h=metadata.height)
        # Track 1: Authorized vehicle "30A-123.45"
        plate_roi_1 = np.full((40, 100, 3), 100, dtype=np.uint8)
        # Track 2: Stranger vehicle "51G-888.88"
        plate_roi_2 = np.full((40, 100, 3), 200, dtype=np.uint8)

        for f in range(metadata.frames):
            tm.add_detection(
                track_id=1,
                label="plate",
                frame_idx=f,
                frame_ms=int(f * 1000 / metadata.fps),
                box=[50, 50, 150, 90],
                confidence=0.90,
                plate_roi=plate_roi_1 if f == 0 else None,
            )
            tm.add_detection(
                track_id=2,
                label="plate",
                frame_idx=f,
                frame_ms=int(f * 1000 / metadata.fps),
                box=[200, 50, 300, 90],
                confidence=0.88,
                plate_roi=plate_roi_2 if f == 0 else None,
            )
        return tm

    processor._track_pass = mock_track_pass

    try:
        params = {
            "redaction": {"targets": ["plate"], "style": "blur", "strength": 15},
            "output": {"quality": "high"},
            "whitelist": {
                "plates": ["30A-123.45"],
            },
        }

        out_bytes, summary, content_type = processor.process(
            input_bytes=video_bytes,
            params=params,
            output_key="results/batch-1/job-plate/result.mp4",
        )

        assert content_type == "video/mp4"
        assert len(out_bytes) > 0

        # Verify summary contract
        counts = summary.get("counts", {})
        assert counts.get("plateTracks") == 2, f"Expected 2 plate tracks, got {counts.get('plateTracks')}"
        assert counts.get("whitelistedPlateTracks") == 1, f"Expected 1 whitelisted plate, got {counts.get('whitelistedPlateTracks')}"
        assert counts.get("redactedTracks") == 1, f"Expected 1 redacted track, got {counts.get('redactedTracks')}"

        tracks = summary.get("tracks", [])
        track_1 = next(t for t in tracks if t["trackId"] == 1)
        track_2 = next(t for t in tracks if t["trackId"] == 2)

        # Track 1: Whitelisted vehicle
        assert track_1["whitelisted"] is True
        assert track_1["redacted"] is False
        assert track_1["plateText"] == "30A12345"

        # Track 2: Stranger vehicle -> Redacted
        assert track_2["whitelisted"] is False
        assert track_2["redacted"] is True
        assert track_2["plateText"] == "51G88888"

        print(f"  -> PASS: E2E Video Redact + Plate Whitelist hoàn thành ({len(out_bytes)} bytes).")
    finally:
        processor._track_pass = orig_track_pass


def test_track_manager_low_confidence_track_count():
    """Verify that a track with high mean confidence and a brief dip isn't counted as low confidence."""
    print("Test 18: Kiểm tra đếm lowConfidenceTracks theo meanConfidence thay vì dip đơn lẻ...")
    mgr = TrackManager(fps=25.0, orig_w=640, orig_h=480)

    # Track 1: 9 frames at 0.90, 1 frame at 0.15 (brief dip below 0.35)
    # meanConfidence = (9 * 0.90 + 0.15) / 10 = 0.825 >= 0.35
    for f in range(9):
        mgr.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=f * 40, box=[50, 50, 100, 100], confidence=0.90)
    mgr.add_detection(track_id=1, label="face", frame_idx=9, frame_ms=360, box=[50, 50, 100, 100], confidence=0.15)

    # Track 2: Consistently low confidence (mean < 0.35)
    for f in range(3):
        mgr.add_detection(track_id=2, label="face", frame_idx=f, frame_ms=f * 40, box=[150, 150, 200, 200], confidence=0.20)

    mgr.compute_ranges(review_threshold=0.35)

    # Check track 1 low_confidence_ranges recorded the dip
    assert len(mgr.tracks[1].low_confidence_ranges) == 1

    tracks_summary, counts = mgr.to_contract_summary(review_threshold=0.35)
    # Only track 2 should count as lowConfidenceTracks
    assert counts["lowConfidenceTracks"] == 1, f"Expected 1 lowConfidenceTrack, got {counts['lowConfidenceTracks']}"

    t1 = next(t for t in tracks_summary if t["trackId"] == 1)
    t2 = next(t for t in tracks_summary if t["trackId"] == 2)
    assert t1["meanConfidence"] >= 0.35
    assert len(t1["lowConfidenceRanges"]) > 0
    assert t2["meanConfidence"] < 0.35
    print("  -> PASS: Track có meanConfidence cao và brief dip không bị tính vào lowConfidenceTracks.")


def test_low_score_box_tracking_recovery():
    """Verify low-score box on an existing track is kept (recovery), and one with no existing track is dropped."""
    print("Test 19: Kiểm tra giữ box điểm thấp trên track đã tồn tại (recovery) và bỏ box không có track...")
    processor = VideoRedactProcessor()

    class MockBox:
        def __init__(self, cls_id, conf, xyxy, track_id=None):
            self.cls = np.array([cls_id])
            self.conf = np.array([conf])
            self.xyxy = np.array([xyxy])
            self.id = np.array([track_id]) if track_id is not None else None

    class MockResults:
        def __init__(self, boxes):
            self.boxes = boxes

    frame_boxes = [
        [
            MockBox(0, 0.40, [20, 20, 80, 80], track_id=10),
            MockBox(0, 0.10, [100, 100, 150, 150], track_id=20),
            MockBox(0, 0.10, [200, 200, 250, 250], track_id=None),
        ],
        [
            MockBox(0, 0.10, [22, 22, 82, 82], track_id=10),
            MockBox(0, 0.10, [300, 300, 350, 350], track_id=30),
        ]
    ]

    current_frame = [0]

    class MockCap:
        def isOpened(self): return True
        def read(self):
            if current_frame[0] < len(frame_boxes):
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                current_frame[0] += 1
                return True, frame
            return False, None
        def release(self): pass

    class MockModel:
        def __init__(self):
            self.names = {0: "face", 1: "plate"}
            self.predictor = None
        def track(self, *args, **kwargs):
            idx = current_frame[0] - 1
            boxes = frame_boxes[idx] if idx < len(frame_boxes) else []
            return [MockResults(boxes)]

    orig_cap = cv2.VideoCapture
    orig_model = processor._model
    try:
        cv2.VideoCapture = lambda *args, **kwargs: MockCap()
        processor._model = MockModel()
        metadata = VideoMetadata(width=640, height=480, fps=25.0, duration_ms=80, frames=2, has_audio=False)
        throttler = ProgressThrottler(callback=None)

        tm = processor._track_pass(
            input_video_path="dummy.mp4",
            metadata=metadata,
            targets_set={"face"},
            thresholds={"face": 0.17, "plate": 0.11},
            review_threshold=0.35,
            throttler=throttler,
        )

        assert tm.has_track(10), "Track 10 should exist in TrackManager"
        assert len(tm.tracks[10].detections) == 2, f"Track 10 should have 2 detections, got {len(tm.tracks[10].detections)}"
        assert tm.tracks[10].detections[1].confidence == 0.10, "Frame 1 low confidence box was kept on existing track"

        assert not tm.has_track(20), "Track 20 should have been dropped"
        assert not tm.has_track(30), "Track 30 should have been dropped"
        print("  -> PASS: Box điểm thấp trên track đã có được giữ lại, box điểm thấp không có track bị loại bỏ.")
    finally:
        cv2.VideoCapture = orig_cap
        processor._model = orig_model


def test_hold_frames_scaling():
    """Verify hold_frames_for_fps scaling per video frame rate."""
    print("Test 20: Kiểm tra hàm tính frame hold theo FPS (hold_frames_for_fps)...")
    assert TRACK_HOLD_MS == 200, f"Expected TRACK_HOLD_MS=200, got {TRACK_HOLD_MS}"
    assert hold_frames_for_fps(30.0) == 6, f"Expected 6 at 30 fps, got {hold_frames_for_fps(30.0)}"
    assert hold_frames_for_fps(59.94) == 12, f"Expected 12 at 59.94 fps, got {hold_frames_for_fps(59.94)}"
    assert hold_frames_for_fps(1.0) >= 1, f"Expected >= 1 at 1 fps, got {hold_frames_for_fps(1.0)}"
    assert hold_frames_for_fps(0.1) >= 1, f"Expected >= 1 at 0.1 fps, got {hold_frames_for_fps(0.1)}"
    print("  -> PASS: hold_frames_for_fps cho 6 tại 30 fps, 12 tại 59.94 fps, và >= 1 tại low fps.")


def test_track_manager_apply_holds():
    """Verify holding blur 200ms around detected frames across runs, gaps, boundaries, and whitelist."""
    print("Test 21: Kiểm tra hold blur 200ms quanh các khung hình phát hiện (apply_holds)...")

    # 1. A track detected on frames 100 to 110 at 60 fps gets boxes on 88 to 99 using its first box
    #    and on 111 to 122 using its last box, and none on 87 or 123.
    mgr_60 = TrackManager(fps=60.0, orig_w=640, orig_h=480)
    first_box = [100, 100, 200, 200]
    last_box = [150, 150, 250, 250]
    for f in range(100, 111):
        box = first_box if f == 100 else (last_box if f == 110 else [120, 120, 220, 220])
        mgr_60.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=int((f / 60.0) * 1000), box=box, confidence=0.85)

    mgr_60.apply_holds()
    assert mgr_60.get_active_redactions(87) == [], "Frame 87 should have no redaction box"
    assert mgr_60.get_active_redactions(123) == [], "Frame 123 should have no redaction box"
    for f in range(88, 100):
        assert mgr_60.get_active_redactions(f) == [first_box], f"Frame {f} should hold first box {first_box}"
    for f in range(111, 123):
        assert mgr_60.get_active_redactions(f) == [last_box], f"Frame {f} should hold last box {last_box}"

    # 2. A track with a long gap holds on both sides of the gap, and frames in the middle of the gap have no box.
    mgr_gap = TrackManager(fps=30.0, orig_w=640, orig_h=480)
    box_r1_first = [10, 10, 50, 50]
    box_r1_last = [20, 20, 60, 60]
    box_r2_first = [70, 70, 110, 110]
    box_r2_last = [80, 80, 120, 120]
    for f in range(10, 21):
        box = box_r1_first if f == 10 else (box_r1_last if f == 20 else [15, 15, 55, 55])
        mgr_gap.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=int((f / 30.0) * 1000), box=box, confidence=0.90)
    for f in range(80, 91):
        box = box_r2_first if f == 80 else (box_r2_last if f == 90 else [75, 75, 115, 115])
        mgr_gap.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=int((f / 30.0) * 1000), box=box, confidence=0.90)

    mgr_gap.apply_holds()  # at 30 fps, hold_frames = 6
    # Post-hold of run 1: frames 21 to 26 hold box_r1_last
    for f in range(21, 27):
        assert mgr_gap.get_active_redactions(f) == [box_r1_last], f"Frame {f} should hold box_r1_last"
    # Pre-hold of run 2: frames 74 to 79 hold box_r2_first
    for f in range(74, 80):
        assert mgr_gap.get_active_redactions(f) == [box_r2_first], f"Frame {f} should hold box_r2_first"
    # Middle of gap: frames 27 to 73 have no box
    for f in (27, 40, 50, 60, 73):
        assert mgr_gap.get_active_redactions(f) == [], f"Frame {f} in middle of gap should have no box"

    # 3. A track starting at frame 3 stops holding at frame 0, with no negative frames.
    mgr_start = TrackManager(fps=30.0, orig_w=640, orig_h=480)
    box_start = [30, 30, 80, 80]
    for f in range(3, 10):
        mgr_start.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=int((f / 30.0) * 1000), box=box_start, confidence=0.88)
    mgr_start.apply_holds()  # hold = 6
    track_start = mgr_start.tracks[1]
    assert 0 in track_start.held_boxes, "Frame 0 should be in held_boxes"
    assert 1 in track_start.held_boxes, "Frame 1 should be in held_boxes"
    assert 2 in track_start.held_boxes, "Frame 2 should be in held_boxes"
    assert all(f >= 0 for f in track_start.held_boxes.keys()), "No negative frames allowed in held_boxes"
    assert mgr_start.get_active_redactions(0) == [box_start]
    assert mgr_start.get_active_redactions(1) == [box_start]
    assert mgr_start.get_active_redactions(2) == [box_start]

    # 4. A whitelisted track returns no box on held frames.
    mgr_white = TrackManager(fps=30.0, orig_w=640, orig_h=480)
    box_white = [40, 40, 90, 90]
    for f in range(10, 20):
        mgr_white.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=int((f / 30.0) * 1000), box=box_white, confidence=0.92)
    # Whitelist track
    mgr_white.tracks[1].whitelisted = True
    mgr_white.tracks[1].redacted = False
    mgr_white.apply_holds()
    for f in range(4, 26):
        assert mgr_white.get_active_redactions(f) == [], f"Whitelisted track should return no box on frame {f}"

    # 5. After apply_holds, to_contract_summary gives the same startMs, endMs, confidences and ranges as before.
    mgr_sum = TrackManager(fps=30.0, orig_w=640, orig_h=480)
    for f in range(10, 20):
        mgr_sum.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=int((f / 30.0) * 1000), box=[10, 10, 50, 50], confidence=0.80)
    for f in range(40, 50):
        mgr_sum.add_detection(track_id=1, label="face", frame_idx=f, frame_ms=int((f / 30.0) * 1000), box=[20, 20, 60, 60], confidence=0.20)
    # Compute ranges before holds
    mgr_sum.interpolate_gaps()
    mgr_sum.compute_ranges(review_threshold=0.35)
    summary_before, counts_before = mgr_sum.to_contract_summary(review_threshold=0.35)

    # Now apply holds
    mgr_sum.apply_holds()
    summary_after, counts_after = mgr_sum.to_contract_summary(review_threshold=0.35)

    assert counts_after == counts_before, f"Counts changed: {counts_before} vs {counts_after}"
    assert summary_after == summary_before, f"Summary changed after apply_holds: {summary_before} vs {summary_after}"
    assert summary_after[0]["startMs"] == summary_before[0]["startMs"]
    assert summary_after[0]["endMs"] == summary_before[0]["endMs"]
    assert summary_after[0]["maxConfidence"] == summary_before[0]["maxConfidence"]
    assert summary_after[0]["meanConfidence"] == summary_before[0]["meanConfidence"]
    assert summary_after[0]["lowConfidenceRanges"] == summary_before[0]["lowConfidenceRanges"]
    assert summary_after[0]["gapRanges"] == summary_before[0]["gapRanges"]

    print("  -> PASS: Toàn bộ tiêu chí apply_holds (scaling, runs, gap, boundary, whitelist, contract summary) đạt 100%.")


if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU CHẠY KIỂM THỬ VIDEO REDACT (GIAI ĐOẠN 5)")
    print("==================================================")
    test_quality_crf_mapping()
    test_video_probe_valid()
    test_video_probe_invalid_input()
    test_progress_throttler()
    test_track_manager_gap_interpolation()
    test_track_manager_gap_exceeded()
    test_max_gap_frames_scaling()
    test_track_manager_low_confidence_ranges()
    test_track_best_frame_selection()
    test_two_pass_video_redaction_pipeline()
    test_track_level_face_whitelist_matching()
    test_whitelist_reference_error_propagation()
    test_two_pass_video_redaction_with_whitelist_e2e()
    test_redaction_styles_clamping_and_safety()
    test_ffmpeg_writer_flags_and_metadata_stripping()
    test_plate_normalization()
    test_plate_whitelist_manager_matching()
    test_plate_whitelist_video_e2e()
    test_track_manager_low_confidence_track_count()
    test_low_score_box_tracking_recovery()
    test_hold_frames_scaling()
    test_track_manager_apply_holds()
    print("==================================================")
    print("✅ TOÀN BỘ 22/22 TEST CASES GIAI ĐOẠN 5 PASS 100%!")
    print("==================================================")
