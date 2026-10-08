"""Khung code Worker hoàn chỉnh cho Engine.

Toàn bộ phần kết nối NATS, MinIO, nhận JSON, tải file, đẩy kết quả và gửi ACK đã được viết sẵn.
👉 BẠN CHỈ CẦN TẬP TRUNG VIẾT HÀM `my_custom_processing` Ở BÊN DƯỚI!
"""
import asyncio
import io
import json
import logging
import time
from datetime import datetime, timezone

import nats
from minio import Minio
from minio.error import S3Error
from PIL import Image

# Cấu hình logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("worker")

# ==============================================================================
# CẤU HÌNH KẾT NỐI (Chạy cục bộ với Docker)
# ==============================================================================
NATS_URL = "nats://localhost:4222"
NATS_SUBJECTS = ["jobs.ai", "jobs.image"]  # Các kênh lắng nghe
NATS_EVENTS_SUBJECT = "jobs.events"        # Kênh báo cáo về Backend

MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
MINIO_SECURE = False


# ==============================================================================
# 👉 [KHU VỰC CỦA BẠN] TỰ VIẾT CODE XỬ LÝ ẢNH / AI TẠI ĐÂY 👈
# ==============================================================================
def my_custom_processing(input_bytes: bytes, job_type: str, params: dict) -> tuple[bytes, dict, str]:
    """Hàm xử lý nghiệp vụ chính - Nơi bạn tự viết code.

    Args:
        input_bytes: Dữ liệu nhị phân (bytes) của file ảnh/video tải về từ MinIO.
        job_type: Loại job (ví dụ: 'object-detection', 'image-convert', 'background-removal'...)
        params: Các tham số cấu hình gửi từ backend (ví dụ: confidenceThreshold, targetFormat...)

    Returns:
        output_bytes: Dữ liệu nhị phân (bytes) của ảnh kết quả sau khi xử lý xong.
        result_summary: Dictionary chứa thông số tóm tắt (Backend sẽ lưu vào Postgres và gửi lên web).
        content_type: Kiểu MIME của file kết quả (ví dụ: 'image/jpeg', 'image/png'...)
    """
    logger.info(f"==> Bắt đầu xử lý nghiệp vụ cho job loại: '{job_type}'...")
    start_time = time.perf_counter()

    # Mở ảnh từ input_bytes (ví dụ sử dụng Pillow)
    image = Image.open(io.BytesIO(input_bytes))
    original_size = image.size

    # --------------------------------------------------------------------------
    # TODO: VIẾT CODE XỬ LÝ CỦA BẠN DƯỚI ĐÂY
    # Bạn có thể dùng YOLO, OpenCV, Pillow, Rembg,... tùy ý
    # --------------------------------------------------------------------------

    if job_type == "object-detection":
        # VÍ DỤ MẪU: Đọc tham số threshold
        conf_threshold = params.get("confidenceThreshold", 0.45)
        logger.info(f"Đang chạy Object Detection với threshold={conf_threshold}...")

        # [CHỖ NÀY]: Bạn ném ảnh vào model YOLO của bạn:
        # results = my_yolo_model(image, conf=conf_threshold)
        # output_image = Image.fromarray(results[0].plot())
        
        # (Tạm thời demo: Giả sử kết quả là ảnh gốc)
        output_image = image.convert("RGB")
        
        # Chuẩn bị thông số tóm tắt trả về
        result_summary = {
            "objectsDetected": 2,
            "labels": ["person", "car"],
            "note": "Đây là kết quả mẫu từ my_custom_processing"
        }
        output_format = "JPEG"
        content_type = "image/jpeg"

    elif job_type == "image-convert":
        # VÍ DỤ MẪU: Đổi đuôi hoặc resize ảnh
        target_format = params.get("targetFormat", "JPEG").upper()
        logger.info(f"Đang chuyển đổi ảnh sang định dạng: {target_format}...")
        
        output_image = image.convert("RGB") if target_format == "JPEG" else image
        output_format = target_format
        content_type = f"image/{target_format.lower()}"
        result_summary = {
            "originalSize": list(original_size),
            "outputSize": list(output_image.size),
            "format": target_format
        }

    elif job_type == "text-recognition":
        # VÍ DỤ MẪU: Nhận diện văn bản trong ảnh (OCR)
        languages = params.get("languages", ["en"])
        logger.info(f"Đang chạy OCR nhận diện văn bản với ngôn ngữ: {languages}...")

        # [CHỖ NÀY]: Bạn ném ảnh vào easyocr hoặc pytesseract:
        # reader = easyocr.Reader(languages)
        # results = reader.readtext(np.array(image))
        output_image = image.convert("RGB")
        output_format = "JPEG"
        content_type = "image/jpeg"

        result_summary = {
            "detectedBlockCount": 2,
            "fullText": "ĐẠI HỌC CÔNG NGHỆ",
            "blocks": [
                {"text": "ĐẠI HỌC", "confidence": 0.98},
                {"text": "CÔNG NGHỆ", "confidence": 0.95}
            ]
        }

    else:
        # Nếu là loại job khác mà bạn chưa hỗ trợ
        raise ValueError(f"Chưa hỗ trợ loại job '{job_type}'")

    # --------------------------------------------------------------------------
    # Xuất ảnh kết quả ra dạng bytes để chuẩn bị upload lên MinIO
    # --------------------------------------------------------------------------
    output_buffer = io.BytesIO()
    output_image.save(output_buffer, format=output_format)
    output_bytes = output_buffer.getvalue()

    processing_time_ms = round((time.perf_counter() - start_time) * 1000)
    result_summary["processingTimeMs"] = processing_time_ms

    logger.info(f"<== Xử lý xong trong {processing_time_ms}ms!")
    return output_bytes, result_summary, content_type


# ==============================================================================
# KHUNG HỆ THỐNG: QUẢN LÝ NATS, MINIO & VÒNG ĐỜI JOB (KHÔNG CẦN SỬA ĐOẠN NÀY)
# ==============================================================================
class WorkerFramework:
    def __init__(self):
        # 1. Kết nối MinIO
        logger.info(f"Đang kết nối MinIO tại {MINIO_ENDPOINT}...")
        self.s3 = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
        self.nc = None
        self.js = None

    async def emit_event(self, payload: dict):
        """Gửi sự kiện trạng thái về kênh jobs.events cho Backend."""
        payload["timestamp"] = datetime.now(timezone.utc).isoformat()
        await self.js.publish(NATS_EVENTS_SUBJECT, json.dumps(payload).encode("utf-8"))

    async def handle_message(self, msg):
        """Xử lý từng gói tin nhận được từ NATS."""
        job_id = "unknown"
        try:
            # 1. Đọc và giải mã JSON nhận từ Backend
            data = json.loads(msg.data.decode("utf-8"))
            job_id = data.get("jobId", "unknown")
            job_type = data.get("type", "unknown")
            input_spec = data.get("input", {})
            output_spec = data.get("output", {})
            params = data.get("params", {})

            logger.info(f"\n[JOB MỚI] ID: {job_id} | Loại: {job_type}")

            # 2. Báo cáo cho Backend: "Tớ đang bắt đầu tải ảnh và chuẩn bị làm nhé"
            await self.emit_event({
                "jobId": job_id,
                "status": "PROCESSING",
                "progress": 20,
                "stage": "DOWNLOADING_INPUT",
            })

            # 3. Tải file ảnh gốc từ MinIO về bộ nhớ RAM (input_bytes)
            in_bucket = input_spec.get("bucket", "uploads")
            in_key = input_spec.get("key")
            logger.info(f"[*] Đang tải file gốc từ MinIO: {in_bucket}/{in_key}...")
            
            try:
                res = self.s3.get_object(in_bucket, in_key)
                input_bytes = res.read()
                res.close()
                res.release_conn()
                logger.info(f"[+] Tải thành công {len(input_bytes)} bytes từ MinIO.")
            except Exception as e:
                logger.error(f"[!] Lỗi khi tải file từ MinIO: {e}")
                await self.emit_event({
                    "jobId": job_id,
                    "status": "FAILED",
                    "progress": 0,
                    "stage": "DOWNLOADING_INPUT",
                    "error": {"code": "STORAGE_DOWNLOAD_ERROR", "message": str(e)},
                })
                await msg.ack()
                return

            # 4. GỌI HÀM XỬ LÝ CỦA BẠN
            await self.emit_event({
                "jobId": job_id,
                "status": "PROCESSING",
                "progress": 50,
                "stage": "PROCESSING",
            })
            
            try:
                output_bytes, result_summary, content_type = my_custom_processing(
                    input_bytes=input_bytes,
                    job_type=job_type,
                    params=params,
                )
            except Exception as e:
                logger.exception(f"[!] Lỗi xảy ra trong code xử lý của bạn: {e}")
                await self.emit_event({
                    "jobId": job_id,
                    "status": "FAILED",
                    "progress": 0,
                    "stage": "PROCESSING",
                    "error": {"code": "MODEL_INFERENCE_ERROR", "message": str(e)},
                })
                await msg.ack()
                return

            # 5. Đẩy kết quả đã xử lý lên MinIO
            out_bucket = output_spec.get("bucket", "results")
            out_key = output_spec.get("key")
            logger.info(f"[*] Đang tải ảnh kết quả lên MinIO: {out_bucket}/{out_key}...")
            
            try:
                if not self.s3.bucket_exists(out_bucket):
                    self.s3.make_bucket(out_bucket)
                
                self.s3.put_object(
                    bucket_name=out_bucket,
                    object_name=out_key,
                    data=io.BytesIO(output_bytes),
                    length=len(output_bytes),
                    content_type=content_type,
                )
                logger.info(f"[+] Upload thành công kết quả lên MinIO.")
            except Exception as e:
                logger.error(f"[!] Lỗi khi upload kết quả lên MinIO: {e}")
                await self.emit_event({
                    "jobId": job_id,
                    "status": "FAILED",
                    "progress": 0,
                    "stage": "UPLOADING_OUTPUT",
                    "error": {"code": "STORAGE_UPLOAD_ERROR", "message": str(e)},
                })
                await msg.ack()
                return

            # 6. Báo cáo Backend: "Tớ đã hoàn thành 100%, đây là kết quả!"
            await self.emit_event({
                "jobId": job_id,
                "status": "COMPLETED",
                "progress": 100,
                "stage": "DONE",
                "result": {
                    "bucket": out_bucket,
                    "key": out_key,
                },
                "resultSummary": result_summary,
            })

            # 7. XÁC NHẬN (ACK) VỚI NATS ĐỂ XÓA JOB KHỎI HÀNG ĐỢI
            await msg.ack()
            logger.info(f"[HOÀN THÀNH XUẤT SẮC] Job {job_id} đã xong và đã gửi ACK!\n")

        except Exception as e:
            logger.exception(f"[!] Lỗi ngoài dự tính: {e}")
            await msg.ack()

    async def run(self):
        """Khởi động kết nối NATS và vòng lặp nhận job."""
        logger.info(f"Đang kết nối NATS tại {NATS_URL}...")
        self.nc = await nats.connect(NATS_URL)
        self.js = self.nc.jetstream()
        logger.info("Đã kết nối NATS JetStream thành công.")

        # Đảm bảo các Stream tồn tại
        for stream, subject in [("AI_JOBS", "jobs.ai"), ("IMAGE_JOBS", "jobs.image")]:
            try:
                await self.js.add_stream(name=stream, subjects=[subject])
            except Exception:
                pass

        # Lắng nghe các kênh
        subs = []
        for subject in NATS_SUBJECTS:
            consumer_name = f"dev-worker-{subject.replace('.', '-')}"
            sub = await self.js.pull_subscribe(subject, durable=consumer_name)
            subs.append(sub)
            logger.info(f"[+] Đang chờ nhận job trên kênh: '{subject}'...")

        # Vòng lặp liên tục chờ nhận job
        while True:
            for sub in subs:
                try:
                    msgs = await sub.fetch(batch=1, timeout=0.5)
                    for msg in msgs:
                        await self.handle_message(msg)
                except nats.errors.TimeoutError:
                    continue
                except Exception as e:
                    logger.error(f"Lỗi hàng đợi: {e}")
                    await asyncio.sleep(1)


if __name__ == "__main__":
    worker = WorkerFramework()
    try:
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        logger.info("Worker đã dừng.")
