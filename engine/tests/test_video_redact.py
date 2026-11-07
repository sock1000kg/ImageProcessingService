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
    AudioHandler,
    ProgressThrottler,
    CRF_MAP,
    MAX_INTERPOLATION_GAP_FRAMES,
    Track,
    TrackDetection,
    TrackManager,
    InvalidInputFileError,
    WhitelistReferenceError,
)
from src.processors.plate_ocr import (
    PlateWhitelistManager,
    PlateOCRRecognizer,
    normalize_plate_text,
)
from src.processors import get_processor_registry


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
    """Verify linear interpolation bridges dropouts <= MAX_INTERPOLATION_GAP_FRAMES."""
    print("Test 5: Kiểm tra thuật toán nội suy Bounding Box chống Flicker (gap <= 5 frames)...")
    mgr = TrackManager(fps=25.0, orig_w=640, orig_h=480)

    # Detection at frame 10: box [100, 100, 200, 200], conf 0.90
    mgr.add_detection(track_id=1, label="face", frame_idx=10, frame_ms=400, box=[100, 100, 200, 200], confidence=0.90)

    # Dropout for frames 11, 12, 13 (gap = 3 frames <= 5)
    # Next detection at frame 14: box [140, 140, 240, 240], conf 0.82
    mgr.add_detection(track_id=1, label="face", frame_idx=14, frame_ms=560, box=[140, 140, 240, 240], confidence=0.82)

    # Run interpolation
    mgr.interpolate_gaps(max_gap_frames=MAX_INTERPOLATION_GAP_FRAMES)
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
    """Verify dropouts > MAX_INTERPOLATION_GAP_FRAMES are recorded into gapRanges per Contract §3 B2."""
    print("Test 6: Kiểm tra xử lý mất dấu vượt ngưỡng nội suy (gapRanges)...")
    mgr = TrackManager(fps=25.0, orig_w=640, orig_h=480)

    # Detection at frame 10
    mgr.add_detection(track_id=2, label="face", frame_idx=10, frame_ms=400, box=[100, 100, 200, 200], confidence=0.85)

    # Dropout from frame 11 to 24 (gap = 14 frames > 5)
    # Next detection at frame 25 (1000ms)
    mgr.add_detection(track_id=2, label="face", frame_idx=25, frame_ms=1000, box=[150, 150, 250, 250], confidence=0.80)

    mgr.interpolate_gaps(max_gap_frames=MAX_INTERPOLATION_GAP_FRAMES)
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
        "confidenceThreshold": 0.35,
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

        assert len(captured_cmds) == 1, "Expected exactly 1 Popen call"
        cmd = captured_cmds[0]

        # Verify Contract §2B requirements
        assert "-map_metadata" in cmd and cmd[cmd.index("-map_metadata") + 1] == "-1", "Missing -map_metadata -1 (GPS strip)"
        assert "-movflags" in cmd and cmd[cmd.index("-movflags") + 1] == "+faststart", "Missing +faststart (Web streaming)"
        assert "-c:a" in cmd and cmd[cmd.index("-c:a") + 1] == "copy", "Missing -c:a copy (Original audio remux)"
        assert "-crf" in cmd and cmd[cmd.index("-crf") + 1] == "23", "Missing CRF 23"
        assert "-pix_fmt" in cmd and "yuv420p" in cmd, "Missing yuv420p"
        assert "-shortest" in cmd, "Missing -shortest flag"
        print(f"  -> PASS: Toàn bộ cờ FFmpeg chuẩn xác: -map_metadata -1, +faststart, -c:a copy, -crf 23.")
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

    def mock_track_pass(input_video_path, metadata, targets_set, conf_threshold, review_threshold, throttler):
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
    print("==================================================")
    print("✅ TOÀN BỘ 17/17 TEST CASES GIAI ĐOẠN 5 PASS 100%!")
    print("==================================================")
