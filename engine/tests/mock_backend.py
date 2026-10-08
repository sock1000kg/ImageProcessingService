"""Script giả lập Backend (Mock Backend) để test độc lập với Engine.

Nhiệm vụ của script này:
1. Đóng vai Backend: Upload 1 ảnh mẫu lên MinIO bucket `uploads/`.
2. Bắn gói tin JSON vào NATS JetStream (kênh `jobs.ai` hoặc `jobs.image`).
3. Ngồi lắng nghe kênh `jobs.events` xem Worker làm đến đâu và in kết quả ra màn hình.
"""
import asyncio
import io
import json
import uuid
import nats
from minio import Minio
from PIL import Image, ImageDraw

MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
NATS_URL = "nats://localhost:4222"


def create_sample_image() -> bytes:
    """Tạo nhanh 1 bức ảnh test trong RAM (không cần file ảnh bên ngoài)."""
    img = Image.new("RGB", (600, 400), color=(230, 240, 250))
    draw = ImageDraw.Draw(img)
    # Vẽ vài hình khối mẫu
    draw.rectangle([80, 100, 260, 300], fill=(60, 120, 240), outline=(0, 0, 0))
    draw.ellipse([320, 80, 500, 260], fill=(255, 180, 40), outline=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def main():
    print("==================================================")
    print("🚀 [MOCK BACKEND] KHỞI ĐỘNG GIẢ LẬP BACKEND ĐỂ TEST")
    print("==================================================")

    # 1. Kết nối MinIO & Tải ảnh mẫu lên
    print(f"[*] 1. Đang kết nối MinIO ({MINIO_ENDPOINT})...")
    s3 = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
    for b in ["uploads", "results"]:
        if not s3.bucket_exists(b):
            s3.make_bucket(b)

    job_id = str(uuid.uuid4())
    input_key = f"{job_id}/input.jpg"
    output_key = f"{job_id}/result.jpg"

    sample_bytes = create_sample_image()
    s3.put_object("uploads", input_key, io.BytesIO(sample_bytes), len(sample_bytes), content_type="image/jpeg")
    print(f"[+] Đã tải ảnh mẫu lên MinIO: uploads/{input_key}")

    # 2. Kết nối NATS JetStream
    print(f"[*] 2. Đang kết nối NATS ({NATS_URL})...")
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()

    # Đảm bảo các stream tồn tại
    for stream, subject in [("AI_JOBS", "jobs.ai"), ("JOB_EVENTS", "jobs.events")]:
        try:
            await js.add_stream(name=stream, subjects=[subject])
        except Exception:
            pass

    # 3. Lắng nghe phản hồi từ Worker qua kênh jobs.events
    done_event = asyncio.Event()

    async def on_worker_event(msg):
        event = json.loads(msg.data.decode("utf-8"))
        j_id = event.get("jobId")
        status = event.get("status")
        progress = event.get("progress")
        stage = event.get("stage")

        print(f"\n📩 [BACKEND NHẬN EVENT TỪ WORKER]")
        print(f"   - Job ID:  {j_id}")
        print(f"   - Status:  {status} ({progress}%)")
        print(f"   - Stage:   {stage}")

        if status == "COMPLETED":
            print(f"   🎉 [THÀNH CÔNG RỰC RỠ!]")
            print(f"   - Ảnh kết quả tại: {event.get('result', {}).get('bucket')}/{event.get('result', {}).get('key')}")
            print(f"   - Thống kê (resultSummary): {json.dumps(event.get('resultSummary'), indent=6, ensure_ascii=False)}")
            done_event.set()
        elif status == "FAILED":
            print(f"   ❌ [THẤT BẠI]: {json.dumps(event.get('error'), indent=6, ensure_ascii=False)}")
            done_event.set()

        await msg.ack()

    await js.subscribe("jobs.events", cb=on_worker_event)

    # 4. Bắn gói tin JSON sang kênh jobs.ai
    job_payload = {
        "jobId": job_id,
        "type": "object-detection",
        "input": {
            "bucket": "uploads",
            "key": input_key
        },
        "output": {
            "bucket": "results",
            "key": output_key
        },
        "params": {
            "confidenceThreshold": 0.5
        }
    }

    print(f"\n[*] 3. Backend đang bắn JSON lệnh vào kênh 'jobs.ai'...")
    print(json.dumps(job_payload, indent=2))
    await js.publish("jobs.ai", json.dumps(job_payload).encode("utf-8"))

    print("\n[*] 4. Đang chờ Worker xử lý (timeout 30s)...")
    try:
        await asyncio.wait_for(done_event.wait(), timeout=30.0)
        print("\n==================================================")
        print("✅ TEST HOÀN TẤT THÀNH CÔNG!")
        print("==================================================")
    except asyncio.TimeoutError:
        print("\n[!] Hết thời gian chờ: Chưa thấy Worker phản hồi. Bạn đã bật worker chưa?")
    finally:
        await nc.drain()

if __name__ == "__main__":
    asyncio.run(main())
