"""Script giả lập Backend (Mock Backend) để test độc lập với Engine.

Nhiệm vụ của script này:
1. Đóng vai Backend: Upload ảnh mẫu (hoặc file ảnh tùy chọn của bạn) lên MinIO bucket `uploads/`.
2. Lắng nghe kênh `jobs.events` qua consumer `backend-job-events` trên stream `JOB_EVENTS`.
3. Bắn gói tin JSON Job Command vào NATS JetStream (kênh `jobs.image`).
4. Theo dõi phản hồi từ Worker và tự động tải ảnh kết quả về thư mục `output/` để xem ngay!

Cách dùng:
  python tests/mock_backend.py [job_type] [đường_dẫn_ảnh_tùy_chọn]

Ví dụ:
  python tests/mock_backend.py image-redact my_photo.jpg
  python tests/mock_backend.py image-redact
"""
import asyncio
import io
import json
import os
import sys
import uuid
import nats
import nats.errors
from minio import Minio
from PIL import Image, ImageDraw

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
NATS_URL = "nats://localhost:4222"


def create_sample_image(format: str = "JPEG") -> bytes:
    """Tạo nhanh 1 bức ảnh test trong RAM (nếu người dùng không truyền file ảnh ngoài)."""
    img = Image.new("RGB", (640, 480), color=(230, 240, 250))
    draw = ImageDraw.Draw(img)
    # Vẽ vài hình khối mẫu
    draw.rectangle([80, 100, 280, 320], fill=(60, 120, 240), outline=(0, 0, 0))
    draw.ellipse([320, 80, 520, 280], fill=(255, 180, 40), outline=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format=format)
    return buf.getvalue()


async def main():
    job_type = sys.argv[1].strip() if len(sys.argv) > 1 else "image-redact"
    custom_image_path = sys.argv[2].strip() if len(sys.argv) > 2 else None

    print("==================================================")
    print(f"🚀 [MOCK BACKEND] KHỞI ĐỘNG GIẢ LẬP TEST JOB: {job_type}")
    print("==================================================")

    job_id = str(uuid.uuid4())
    batch_id = str(uuid.uuid4())

    # 1. Cấu hình thông số Job
    if job_type == "image-redact":
        nats_subject = "jobs.image"
        input_ext = "jpg"
        output_ext = "jpg"
        params = {
            "redaction": {
                "targets": ["face", "plate"],
                "style": "pixelate",
                "strength": 12,
                "padding": 0.1,
            },
            "confidenceThreshold": 0.35,
            "reviewThreshold": 0.50,
        }
        default_format = "JPEG"
    elif job_type in ("image-redact-blur", "blur"):
        job_type = "image-redact"
        nats_subject = "jobs.image"
        input_ext = "jpg"
        output_ext = "jpg"
        params = {
            "redaction": {
                "targets": ["face", "plate"],
                "style": "blur",
                "strength": 25,
                "padding": 0.1,
            },
            "confidenceThreshold": 0.35,
            "reviewThreshold": 0.50,
        }
        default_format = "JPEG"
    elif job_type in ("image-redact-blackout", "blackout"):
        job_type = "image-redact"
        nats_subject = "jobs.image"
        input_ext = "jpg"
        output_ext = "jpg"
        params = {
            "redaction": {
                "targets": ["face", "plate"],
                "style": "blackout",
                "padding": 0.1,
            },
            "confidenceThreshold": 0.35,
            "reviewThreshold": 0.50,
        }
        default_format = "JPEG"
    else:  # default image-redact
        job_type = "image-redact"
        nats_subject = "jobs.image"
        input_ext = "jpg"
        output_ext = "jpg"
        params = {
            "redaction": {
                "targets": ["face", "plate"],
                "style": "blur",
                "strength": 25,
                "padding": 0.1,
            },
            "confidenceThreshold": 0.35,
            "reviewThreshold": 0.50,
        }
        default_format = "JPEG"

    # Đọc ảnh từ file ngoài nếu có truyền, hoặc tự tạo ảnh mẫu
    if custom_image_path:
        if not os.path.exists(custom_image_path):
            print(f"[!] Không tìm thấy file ảnh: {custom_image_path}")
            return
        print(f"[*] Sử dụng file ảnh của bạn: {custom_image_path}")
        with open(custom_image_path, "rb") as f:
            sample_bytes = f.read()

        file_ext = os.path.splitext(custom_image_path)[1].lower().replace(".", "")
        if file_ext in ("jpg", "jpeg"):
            content_type = "image/jpeg"
            input_ext = "jpg"
        elif file_ext == "png":
            content_type = "image/png"
            input_ext = "png"
        elif file_ext == "webp":
            content_type = "image/webp"
            input_ext = "webp"
        else:
            content_type = "image/jpeg"
            input_ext = "jpg"
    else:
        print("[*] Không chỉ định file ảnh ngoài, tự động sinh ảnh test trong RAM.")
        sample_bytes = create_sample_image(default_format)
        content_type = f"image/{default_format.lower()}"

    input_key = f"{job_id}/input.{input_ext}"
    output_key = f"{job_id}/result.{output_ext}"

    # 2. Kết nối MinIO & Tải ảnh mẫu lên
    print(f"[*] 1. Đang kết nối MinIO ({MINIO_ENDPOINT})...")
    s3 = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
    for b in ["uploads", "results"]:
        if not s3.bucket_exists(b):
            s3.make_bucket(b)

    s3.put_object("uploads", input_key, io.BytesIO(sample_bytes), len(sample_bytes), content_type=content_type)
    print(f"[+] Đã tải ảnh lên MinIO: uploads/{input_key} ({len(sample_bytes)} bytes)")

    # 3. Kết nối NATS JetStream
    print(f"[*] 2. Đang kết nối NATS ({NATS_URL})...")
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()

    # 4. Lắng nghe phản hồi từ Worker qua kênh jobs.events (Durable: backend-job-events)
    done_event = asyncio.Event()

    async def on_worker_event(msg):
        event = json.loads(msg.data.decode("utf-8"))
        j_id = event.get("jobId")
        if j_id != job_id:
            await msg.ack()
            return

        status = event.get("status")
        progress = event.get("progress")
        stage = event.get("stage")

        print(f"\n📩 [BACKEND NHẬN EVENT TỪ WORKER]")
        print(f"   - Job ID:  {j_id}")
        print(f"   - Status:  {status} ({progress}%)")
        print(f"   - Stage:   {stage}")

        if status == "COMPLETED":
            result_bucket = event.get("result", {}).get("bucket", "results")
            result_key = event.get("result", {}).get("key")
            print(f"   🎉 [THÀNH CÔNG RỰC RỠ!]")
            print(f"   - MinIO Object: {result_bucket}/{result_key}")
            print(f"   - Thống kê (resultSummary): {json.dumps(event.get('resultSummary'), indent=6, ensure_ascii=False)}")

            # Tự động tải file kết quả từ MinIO về máy để người dùng xem ngay
            try:
                os.makedirs("output", exist_ok=True)
                ext = os.path.splitext(result_key)[1]
                local_file = os.path.join("output", f"{job_type}_{job_id[:8]}{ext}")
                s3.fget_object(result_bucket, result_key, local_file)
                abs_path = os.path.abspath(local_file)
                print(f"   💾 [ẢNH ĐÃ TẢI VỀ MÁY]: {abs_path}")
            except Exception as dl_err:
                print(f"   [!] Lỗi khi tải ảnh về máy: {dl_err}")

            done_event.set()
        elif status == "FAILED":
            print(f"   ❌ [THẤT BẠI]: {json.dumps(event.get('error'), indent=6, ensure_ascii=False)}")
            done_event.set()

        await msg.ack()

    # Bind vào consumer backend-job-events trên stream JOB_EVENTS
    try:
        events_sub = await js.pull_subscribe_bind(
            consumer="backend-job-events",
            stream="JOB_EVENTS",
        )
    except Exception as e:
        print(f"[!] Lỗi khi bind vào consumer 'backend-job-events': {e}")
        print("[!] Hãy chắc chắn bạn đã chạy: python tests/setup_local_streams.py")
        await nc.close()
        return

    async def event_poller():
        while not done_event.is_set():
            try:
                msgs = await events_sub.fetch(batch=1, timeout=1.0)
                for msg in msgs:
                    await on_worker_event(msg)
            except (nats.errors.TimeoutError, TimeoutError, asyncio.TimeoutError):
                continue
            except Exception:
                if not done_event.is_set():
                    await asyncio.sleep(0.2)

    poller_task = asyncio.create_task(event_poller())

    # 5. Bắn gói tin JSON sang kênh tương ứng
    job_payload = {
        "jobId": job_id,
        "batchId": batch_id,
        "type": job_type,
        "input": {
            "bucket": "uploads",
            "key": input_key,
        },
        "output": {
            "bucket": "results",
            "key": output_key,
        },
        "params": params,
    }

    print(f"\n[*] 3. Backend đang bắn JSON lệnh vào kênh '{nats_subject}'...")
    print(json.dumps(job_payload, indent=2))
    await js.publish(nats_subject, json.dumps(job_payload).encode("utf-8"))

    print("\n[*] 4. Đang chờ Worker xử lý (timeout 30s)...")
    try:
        await asyncio.wait_for(done_event.wait(), timeout=30.0)
        print("\n==================================================")
        print("✅ TEST HOÀN TẤT THÀNH CÔNG!")
        print("==================================================")
    except asyncio.TimeoutError:
        print("\n[!] Hết thời gian chờ: Chưa thấy Worker phản hồi. Bạn đã bật worker tương ứng với kênh chưa?")
    finally:
        poller_task.cancel()
        try:
            await poller_task
        except asyncio.CancelledError:
            pass
        await nc.drain()

if __name__ == "__main__":
    asyncio.run(main())
