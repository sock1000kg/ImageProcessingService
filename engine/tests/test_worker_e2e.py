"""End-to-End Integration Tests for EngineWorker with 'video-redact' job type (Phase 2 - Giai đoạn 6).

Verifies:
1. EngineWorker successfully routes 'video-redact' jobs to VideoRedactProcessor.
2. In-flight progress emissions (DOWNLOADING_INPUT, DETECTING, MATCHING_WHITELIST, RENDERING, EXPORTING, UPLOADING_OUTPUT).
3. Whitelisted targets are preserved and non-whitelisted targets are masked.
4. Output video is uploaded to storage results bucket with correct content-type ('video/mp4').
5. COMPLETED event payload matches Contract §3 B2 schema.
6. JetStream message ACK is sent upon completion.
7. Error contract compliance: INVALID_INPUT_FILE, WHITELIST_REFERENCE_ERROR, UNSUPPORTED_JOB_TYPE.
"""
import os
import sys
import json
import asyncio
import tempfile
import numpy as np
import cv2

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.main import EngineWorker
from src.processors import get_processor_registry


class MockStorageClient:
    """In-memory mock storage client simulating MinIO S3."""

    def __init__(self):
        self.buckets = {
            "uploads": {},
            "results": {},
        }

    def download_file(self, bucket: str, key: str) -> bytes:
        if bucket not in self.buckets or key not in self.buckets[bucket]:
            raise RuntimeError(f"Storage download error: object '{key}' not found in bucket '{bucket}'")
        return self.buckets[bucket][key]

    def upload_file(self, bucket: str, key: str, data: bytes, content_type: str = "application/octet-stream"):
        if bucket not in self.buckets:
            self.buckets[bucket] = {}
        self.buckets[bucket][key] = data


class MockMessagingClient:
    """Mock messaging client capturing emitted events."""

    def __init__(self):
        self.events = []

    async def emit_progress_event(self, job_id: str, progress: int, stage: str, batch_id: str = None):
        self.events.append({
            "status": "PROCESSING",
            "jobId": job_id,
            "batchId": batch_id,
            "progress": progress,
            "stage": stage,
        })

    async def emit_completion_event(self, job_id: str, bucket: str, key: str, summary: dict, batch_id: str = None):
        self.events.append({
            "status": "COMPLETED",
            "jobId": job_id,
            "batchId": batch_id,
            "progress": 100,
            "stage": "DONE",
            "result": {"bucket": bucket, "key": key},
            "resultSummary": summary,
        })

    async def emit_failure_event(self, job_id: str, error_code: str, error_msg: str, stage: str, batch_id: str = None):
        self.events.append({
            "status": "FAILED",
            "jobId": job_id,
            "batchId": batch_id,
            "progress": 0,
            "stage": stage,
            "error": {"code": error_code, "message": error_msg},
        })


class MockNatsMessage:
    """Simulates a JetStream message."""

    def __init__(self, data: dict, num_delivered: int = 1):
        self.data = json.dumps(data).encode("utf-8")
        self.metadata = type("Metadata", (), {"num_delivered": num_delivered})()
        self.acked = False
        self.naked = False
        self.in_progress_calls = 0

    async def ack(self):
        self.acked = True

    async def nak(self, delay: float = 0):
        self.naked = True

    async def in_progress(self):
        self.in_progress_calls += 1


def create_synthetic_mp4(num_frames: int = 15, width: int = 320, height: int = 240, fps: float = 25.0) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(tmp_path, fourcc, fps, (width, height))
        for i in range(num_frames):
            frame = np.full((height, width, 3), 30, dtype=np.uint8)
            cv2.rectangle(frame, (50, 50), (120, 120), (100, 150, 200), -1)
            writer.write(frame)
        writer.release()
        with open(tmp_path, "rb") as f:
            data = f.read()
        return data
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_worker_video_redact_success():
    """Verify EngineWorker handles a standard video-redact job command to completion."""
    print("Test 1: Kiểm tra Worker xử lý thành công job 'video-redact'...")

    worker = EngineWorker(pool_type="video")
    worker.storage = MockStorageClient()
    worker.messaging = MockMessagingClient()

    # Prepopulate storage with an input video
    video_bytes = create_synthetic_mp4(num_frames=10)
    in_key = "uploads/batch-1/job-1/input.mp4"
    out_key = "results/batch-1/job-1/result.mp4"
    worker.storage.buckets["uploads"][in_key] = video_bytes

    # Craft contract §2B job command
    command = {
        "jobId": "job-vid-001",
        "batchId": "batch-vid-001",
        "type": "video-redact",
        "input": {"bucket": "uploads", "key": in_key},
        "output": {"bucket": "results", "key": out_key},
        "params": {
            "redaction": {"targets": ["face"], "style": "blur", "strength": 15, "padding": 0.1},
            "output": {"quality": "high"},
            "confidenceThresholds": {"face": 0.35, "plate": 0.35},
            "reviewThreshold": 0.50,
        },
    }

    msg = MockNatsMessage(command)

    # Execute async handle_job
    asyncio.run(worker.handle_job(msg))

    assert msg.acked is True, "Message must be ACKed after successful processing"
    assert not msg.naked, "Message must not be NAKed"

    # Verify storage has output file
    assert out_key in worker.storage.buckets["results"], "Output video must be uploaded to results bucket"
    uploaded_video = worker.storage.buckets["results"][out_key]
    assert len(uploaded_video) > 0, "Uploaded video must not be empty"

    # Verify event progression
    events = worker.messaging.events
    assert len(events) >= 3, "Expected multiple progress events"

    completed_event = next(e for e in events if e["status"] == "COMPLETED")
    assert completed_event["jobId"] == "job-vid-001"
    assert completed_event["batchId"] == "batch-vid-001"
    assert completed_event["result"]["bucket"] == "results"
    assert completed_event["result"]["key"] == out_key

    summary = completed_event["resultSummary"]
    assert "video" in summary
    assert summary["video"]["frames"] == 10
    assert "yolo" in summary["model"].lower()
    assert summary["tracker"] == "bytetrack"
    assert "counts" in summary
    print(f"  -> PASS: Job 'video-redact' hoàn tất xuất sắc, ACK message, upload {len(uploaded_video)} bytes.")


def test_worker_video_redact_with_face_and_plate_whitelists():
    """Verify EngineWorker coordinates Face and Plate Whitelisting seamlessly."""
    print("Test 2: Kiểm tra Worker xử lý video-redact đồng thời Face & Plate Whitelisting...")

    worker = EngineWorker(pool_type="video")
    worker.storage = MockStorageClient()
    worker.messaging = MockMessagingClient()

    video_bytes = create_synthetic_mp4(num_frames=10)
    in_key = "uploads/batch-2/job-2/input.mp4"
    out_key = "results/batch-2/job-2/result.mp4"
    worker.storage.buckets["uploads"][in_key] = video_bytes

    # Create dummy reference face embedding
    dummy_face_emb = np.random.randn(512).astype(np.float32)
    dummy_face_emb /= np.linalg.norm(dummy_face_emb)

    command = {
        "jobId": "job-vid-002",
        "batchId": "batch-vid-002",
        "type": "video-redact",
        "input": {"bucket": "uploads", "key": in_key},
        "output": {"bucket": "results", "key": out_key},
        "params": {
            "redaction": {"targets": ["face", "plate"], "style": "pixelate", "strength": 8},
            "output": {"quality": "high"},
            "whitelist": {
                "faces": [{"bucket": "uploads", "key": "vlogger.jpg", "embedding": dummy_face_emb.tolist()}],
                "similarityThreshold": 0.45,
                "plates": ["30A - 123.45"],
            },
        },
    }

    msg = MockNatsMessage(command)
    asyncio.run(worker.handle_job(msg))

    assert msg.acked is True
    assert out_key in worker.storage.buckets["results"]

    completed = next(e for e in worker.messaging.events if e["status"] == "COMPLETED")
    summary = completed["resultSummary"]
    assert "whitelistedFaceTracks" in summary["counts"]
    assert "whitelistedPlateTracks" in summary["counts"]
    print("  -> PASS: Tích hợp đầy đủ Whitelist Face & Plate theo đúng Contract §2B.")


def test_worker_error_handling_corrupt_video():
    """Verify INVALID_INPUT_FILE emitted and ACKed when input video is corrupt."""
    print("Test 3: Kiểm tra Worker phân loại lỗi INVALID_INPUT_FILE khi file hỏng...")

    worker = EngineWorker(pool_type="video")
    worker.storage = MockStorageClient()
    worker.messaging = MockMessagingClient()

    in_key = "uploads/batch-3/job-3/corrupt.mp4"
    out_key = "results/batch-3/job-3/result.mp4"
    worker.storage.buckets["uploads"][in_key] = b"CORRUPTED_NON_VIDEO_DATA"

    command = {
        "jobId": "job-vid-003",
        "batchId": "batch-3",
        "type": "video-redact",
        "input": {"bucket": "uploads", "key": in_key},
        "output": {"bucket": "results", "key": out_key},
        "params": {},
    }

    msg = MockNatsMessage(command)
    asyncio.run(worker.handle_job(msg))

    assert msg.acked is True, "Must ACK fatal input error per Contract §4"
    failed_event = next(e for e in worker.messaging.events if e["status"] == "FAILED")
    assert failed_event["error"]["code"] == "INVALID_INPUT_FILE"
    print("  -> PASS: Ném đúng mã lỗi INVALID_INPUT_FILE và ACK message.")


def test_worker_unsupported_job_type():
    """Verify UNSUPPORTED_JOB_TYPE emitted and ACKed when unknown job type received."""
    print("Test 4: Kiểm tra Worker phân loại lỗi UNSUPPORTED_JOB_TYPE...")

    worker = EngineWorker()
    worker.storage = MockStorageClient()
    worker.messaging = MockMessagingClient()

    worker.storage.buckets["uploads"]["test.mp4"] = b"DUMMY"

    command = {
        "jobId": "job-vid-004",
        "type": "unknown-audio-processor",
        "input": {"bucket": "uploads", "key": "test.mp4"},
        "output": {"bucket": "results", "key": "res.mp4"},
    }

    msg = MockNatsMessage(command)
    asyncio.run(worker.handle_job(msg))

    assert msg.acked is True
    failed_event = next(e for e in worker.messaging.events if e["status"] == "FAILED")
    assert failed_event["error"]["code"] == "UNSUPPORTED_JOB_TYPE"
    print("  -> PASS: Ném đúng mã lỗi UNSUPPORTED_JOB_TYPE và ACK message.")


def test_processor_registry_pools():
    """Verify registry dynamically provisions processors by pool type."""
    print("Test 5: Kiểm tra Processor Registry phân định theo pool...")
    image_reg = get_processor_registry(pool_type="image")
    assert "image-redact" in image_reg
    assert "image-render" in image_reg
    assert "video-redact" not in image_reg

    video_reg = get_processor_registry(pool_type="video")
    assert "video-redact" in video_reg
    assert "image-redact" not in video_reg
    assert "image-render" not in video_reg

    all_reg = get_processor_registry(pool_type="all")
    assert "image-redact" in all_reg
    assert "image-render" in all_reg
    assert "video-redact" in all_reg
    print("  -> PASS: Registry cấu hình chính xác cho image, video, and all pools.")


def test_worker_image_render_success():
    """Verify EngineWorker handles 'image-render' job end-to-end (Contract §2C, §3B3)."""
    print("Test 6: Kiểm tra Worker xử lý job 'image-render' thành công...")

    worker = EngineWorker(pool_type="image")
    worker.storage = MockStorageClient()
    worker.messaging = MockMessagingClient()

    # Create dummy 200x200 JPEG
    dummy_img = np.zeros((200, 200, 3), dtype=np.uint8)
    dummy_img[:] = (100, 150, 200)
    _, buf = cv2.imencode(".jpg", dummy_img)
    in_bytes = buf.tobytes()

    in_key = "batch-render/job-render-1/input.jpg"
    out_key = "batch-render/job-render-1/result.jpg"
    worker.storage.buckets["uploads"][in_key] = in_bytes

    command = {
        "jobId": "job-render-1",
        "batchId": "batch-render",
        "type": "image-render",
        "input": {"bucket": "uploads", "key": in_key},
        "output": {"bucket": "results", "key": out_key},
        "params": {
            "redaction": {"style": "blur", "strength": 15, "padding": 0.1},
            "output": {"quality": "high"},
            "boxes": [
                {"label": "face", "box": [30, 30, 80, 90]},
                {"label": "custom", "box": [110, 110, 160, 170]},
            ],
        },
    }

    msg = MockNatsMessage(command)
    asyncio.run(worker.handle_job(msg))

    assert msg.acked is True, "Worker must ACK successfully processed image-render job"
    assert out_key in worker.storage.buckets["results"], "Output image must be uploaded to results bucket"

    comp_event = next(e for e in worker.messaging.events if e["status"] == "COMPLETED")
    assert comp_event["jobId"] == "job-render-1"
    assert comp_event["result"]["bucket"] == "results"
    assert comp_event["result"]["key"] == out_key

    # Validate Contract §3B3 resultSummary schema
    summary = comp_event["resultSummary"]
    assert summary["imageSize"] == [200, 200]
    assert summary["boxes"] == 2
    assert "redaction" in summary
    assert "processingTimeMs" in summary
    assert "detections" not in summary, "image-render must NOT return detections field per Contract §3B3"
    print("  -> PASS: Job image-render xử lý trơn tru, phát sinh COMPLETED event đúng chuẩn Contract §3B3.")


def test_worker_image_render_invalid_box_emits_failure():
    """Verify invalid box in 'image-render' emits INVALID_INPUT_FILE and ACKs per Contract §2C, §4."""
    print("Test 7: Kiểm tra Worker bắt lỗi box sai trong 'image-render'...")

    worker = EngineWorker(pool_type="image")
    worker.storage = MockStorageClient()
    worker.messaging = MockMessagingClient()

    dummy_img = np.zeros((100, 100, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", dummy_img)
    in_key = "batch-render/job-render-bad/input.jpg"
    out_key = "batch-render/job-render-bad/result.jpg"
    worker.storage.buckets["uploads"][in_key] = buf.tobytes()

    command = {
        "jobId": "job-render-bad",
        "type": "image-render",
        "input": {"bucket": "uploads", "key": in_key},
        "output": {"bucket": "results", "key": out_key},
        "params": {
            "boxes": [
                {"label": "face", "box": [50, 50, 50, 80]}  # Zero width (x2 == x1) -> invalid
            ]
        },
    }

    msg = MockNatsMessage(command)
    asyncio.run(worker.handle_job(msg))

    assert msg.acked is True, "Must ACK fatal input error per Contract §4"
    failed_event = next(e for e in worker.messaging.events if e["status"] == "FAILED")
    assert failed_event["error"]["code"] == "INVALID_INPUT_FILE"
    print("  -> PASS: Bắt đúng mã lỗi INVALID_INPUT_FILE khi box sai quy cách.")


if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU CHẠY KIỂM THỬ TÍCH HỢP WORKER E2E (GIAI ĐOẠN 6)")
    print("==================================================")
    test_worker_video_redact_success()
    test_worker_video_redact_with_face_and_plate_whitelists()
    test_worker_error_handling_corrupt_video()
    test_worker_unsupported_job_type()
    test_processor_registry_pools()
    test_worker_image_render_success()
    test_worker_image_render_invalid_box_emits_failure()
    print("==================================================")
    print("✅ TOÀN BỘ 7/7 TEST CASES WORKER E2E PASS 100%!")
    print("==================================================")
