"""Unit test kiểm tra nhanh các processor của Engine (Không cần bật Docker hay NATS/MinIO)."""
import io
import time
from PIL import Image, ImageDraw
from src.processors.yolo_detector import YoloDetectorProcessor
from src.processors.image_converter import ImageConverterProcessor


def create_sample_image() -> bytes:
    """Tạo nhanh 1 bức ảnh test trong RAM có vẽ vài hình khối."""
    img = Image.new("RGB", (640, 480), color=(240, 245, 250))
    draw = ImageDraw.Draw(img)
    # Vẽ vài hình khối mẫu
    draw.rectangle([100, 150, 300, 350], fill=(50, 100, 220), outline=(0, 0, 0))
    draw.ellipse([350, 100, 500, 250], fill=(240, 200, 50), outline=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_image_converter():
    print("\n--- [TEST 1] Kiểm tra Image Converter (Pillow) ---")
    converter = ImageConverterProcessor()
    sample_bytes = create_sample_image()

    params = {
        "targetFormat": "WEBP",
        "width": 320,
        "height": 240,
        "quality": 80,
    }

    out_bytes, summary, content_type = converter.process(sample_bytes, params)
    print(f"✅ Định dạng đầu ra: {content_type}")
    print(f"✅ Kích thước gốc: {summary.get('originalDimensions')} -> Kích thước mới: {summary.get('outputDimensions')}")
    print(f"✅ Dung lượng: {summary.get('originalSizeBytes')} bytes -> {summary.get('outputSizeBytes')} bytes")
    print(f"✅ Thời gian xử lý: {summary.get('processingTimeMs')}ms")
    assert content_type == "image/webp"
    assert len(out_bytes) > 0
    print("=> TEST 1 THÀNH CÔNG RỰC RỠ!\n")


def test_yolo_detector():
    print("--- [TEST 2] Kiểm tra YOLO Detector (AI Model) ---")
    print("Đang nạp mô hình YOLO vào RAM...")
    detector = YoloDetectorProcessor()
    sample_bytes = create_sample_image()

    params = {
        "confidenceThreshold": 0.35,
    }

    out_bytes, summary, content_type = detector.process(sample_bytes, params)
    print(f"✅ Định dạng ảnh đầu ra: {content_type}")
    print(f"✅ Số vật thể phát hiện: {summary.get('objectsDetected')}")
    print(f"✅ Danh sách nhãn: {summary.get('labels')}")
    print(f"✅ Thời gian suy luận AI: {summary.get('processingTimeMs')}ms")
    assert content_type == "image/jpeg"
    assert len(out_bytes) > 0
    print("=> TEST 2 THÀNH CÔNG RỰC RỠ!\n")


if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU CHẠY KIỂM THỬ ĐỘC LẬP ENGINE PROCESSORS")
    print("==================================================")
    t0 = time.perf_counter()
    test_image_converter()
    test_yolo_detector()
    total_time = round((time.perf_counter() - t0) * 1000)
    print("==================================================")
    print(f"🎉 TẤT CẢ PROCESSOR ĐÃ ĐẠT CHUẨN TRONG {total_time}ms!")
    print("==================================================")
