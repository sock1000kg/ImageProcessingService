# Job Specifications & Processing Engines

> **Đặc tả chi tiết các tác vụ xử lý (Jobs) của Engine**  
> Định nghĩa đầu vào (`input`), đầu ra (`output`), tham số cấu hình (`params`), thư viện mã nguồn mở tương ứng và định dạng kết quả (`resultSummary`).

---

## 1. Bảng tổng hợp các loại Job

| Job `type` | Mục đích | Thư viện / Model | Mức ưu tiên | Mức RAM ước tính | Thời gian xử lý (CPU) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `object-detection` | Nhận diện & đóng khung vật thể | `ultralytics` (`yolov8n.pt`) | **MVP (Bắt buộc)** | ~300MB – 400MB | 150ms – 300ms |
| `image-convert` | Đổi đuôi ảnh, resize, nén | `Pillow` (PIL) | **MVP (Bắt buộc)** | < 50MB | 10ms – 50ms |
| `background-removal` | Tách nền ảnh trong suốt | `rembg` (`u2netp`) | **Pha 2 (Khuyên dùng)** | ~300MB – 500MB | 0.8s – 1.8s |
| `image-sharpening` | Làm nét, nâng độ phân giải | `opencv-python-headless` | **Pha 2** | ~150MB – 250MB | 200ms – 500ms |
| `text-recognition` | Trích xuất chữ trong ảnh (OCR) | `easyocr` / `pytesseract` | **Pha 2 (Rất hữu ích)** | ~300MB – 500MB | 0.5s – 1.5s |
| `video-transcribe` | Tạo phụ đề video clip ngắn | `openai-whisper` (`tiny`) | **Pha 2 (Tùy chọn)** | ~1GB – 1.5GB | 15s – 35s (video 15s) |

---

## 2. Đặc tả chi tiết từng Job

### 2.1. `object-detection` (Nhận diện vật thể)
Nhận diện các đối tượng trong ảnh, vẽ khung bao (bounding box), nhãn tên và % tin cậy lên ảnh đầu ra; đồng thời xuất danh sách thống kê metadata.

* **NATS Subject:** `jobs.ai`
* **Mô hình mã nguồn mở:** `yolov8n.pt` (tự động tải ~6MB từ Ultralytics, miễn phí 100%).
* **Cấu hình `params`:**
  * `confidenceThreshold` *(float, optional, mặc định `0.45`)*: Ngưỡng tin cậy tối thiểu để hiển thị nhãn.
* **Mẫu Job Message nhận từ NATS:**
  ```json
  {
    "jobId": "e1f2a3b4-5678-90ab-cdef-1234567890ab",
    "type": "object-detection",
    "input": {
      "bucket": "uploads",
      "key": "e1f2a3b4-5678-90ab-cdef-1234567890ab/input.jpg"
    },
    "output": {
      "bucket": "results",
      "key": "e1f2a3b4-5678-90ab-cdef-1234567890ab/result.jpg"
    },
    "params": {
      "confidenceThreshold": 0.45
    }
  }
  ```
* **Mẫu `resultSummary` trả về:**
  ```json
  {
    "objectsDetected": 3,
    "labels": ["person", "dog", "car"],
    "details": [
      {"label": "person", "confidence": 0.92, "box": [34, 12, 120, 250]},
      {"label": "dog", "confidence": 0.85, "box": [130, 80, 200, 220]},
      {"label": "car", "confidence": 0.78, "box": [220, 100, 380, 280]}
    ],
    "processingTimeMs": 235
  }
  ```

---

### 2.2. `image-convert` (Chuyển đổi định dạng & Thay đổi kích thước)
Xử lý chuyển đổi qua lại giữa JPG, PNG, WEBP, thay đổi kích thước ảnh theo tỷ lệ hoặc nén chất lượng để tối ưu dung lượng.

* **NATS Subject:** `jobs.image`
* **Thư viện:** `Pillow`
* **Cấu hình `params`:**
  * `targetFormat` *(string, bắt buộc)*: `"JPEG"`, `"PNG"`, hoặc `"WEBP"`.
  * `width` *(int, optional)*: Chiều rộng mong muốn.
  * `height` *(int, optional)*: Chiều cao mong muốn.
  * `quality` *(int, optional, mặc định `85`)*: Mức nén chất lượng ảnh (1-100).
* **Mẫu Job Message nhận từ NATS:**
  ```json
  {
    "jobId": "a9b8c7d6-1122-3344-5566-778899aabbcc",
    "type": "image-convert",
    "input": {
      "bucket": "uploads",
      "key": "a9b8c7d6-1122-3344-5566-778899aabbcc/input.png"
    },
    "output": {
      "bucket": "results",
      "key": "a9b8c7d6-1122-3344-5566-778899aabbcc/result.webp"
    },
    "params": {
      "targetFormat": "WEBP",
      "width": 1280,
      "height": 720,
      "quality": 80
    }
  }
  ```
* **Mẫu `resultSummary` trả về:**
  ```json
  {
    "originalFormat": "PNG",
    "targetFormat": "WEBP",
    "originalDimensions": [1920, 1080],
    "outputDimensions": [1280, 720],
    "originalSizeBytes": 2048500,
    "outputSizeBytes": 320140,
    "processingTimeMs": 42
  }
  ```

---

### 2.3. `background-removal` (Tách nền ảnh)
Xóa phông nền của ảnh chân dung, sản phẩm hoặc động vật, trả về file ảnh PNG có nền trong suốt (alpha channel).

* **NATS Subject:** `jobs.ai`
* **Thư viện mã nguồn mở:** `rembg` (chỉ định session sử dụng model `u2netp` nhẹ ~4MB).
* **Cấu hình `params`:**
  * `alphaMatting` *(bool, optional, mặc định `false`)*: Bật tinh chỉnh viền tóc (nếu cần sắc nét hơn).
* **Mẫu Job Message nhận từ NATS:**
  ```json
  {
    "jobId": "f1e2d3c4-9988-7766-5544-33221100aabb",
    "type": "background-removal",
    "input": {
      "bucket": "uploads",
      "key": "f1e2d3c4-9988-7766-5544-33221100aabb/input.jpg"
    },
    "output": {
      "bucket": "results",
      "key": "f1e2d3c4-9988-7766-5544-33221100aabb/result.png"
    },
    "params": {
      "alphaMatting": false
    }
  }
  ```
* **Mẫu `resultSummary` trả về:**
  ```json
  {
    "modelUsed": "u2netp",
    "transparentFormat": "PNG",
    "processingTimeMs": 1150
  }
  ```

---

### 2.4. `image-sharpening` (Làm nét & Cải thiện chi tiết)
Sử dụng thuật toán làm nét Unsharp Masking hoặc FSRCNN để làm rõ ảnh mờ/nhiễu mà không gây tốn nhiều CPU.

* **NATS Subject:** `jobs.image` hoặc `jobs.ai`
* **Thư viện:** `opencv-python-headless`
* **Cấu hình `params`:**
  * `mode` *(string, optional, `"unsharp"` hoặc `"fsrcnn"`)*: Mặc định `"unsharp"`.
  * `strength` *(float, optional, mặc định `1.5`)*: Độ sắc nét áp dụng.
* **Mẫu `resultSummary` trả về:**
  ```json
  {
    "appliedFilter": "unsharp_mask",
    "strength": 1.5,
    "processingTimeMs": 180
  }
  ```

---

### 2.5. `video-transcribe` (Tạo phụ đề video clip ngắn - Day 2 Feature)
Trích xuất âm thanh từ video ngắn (dưới 20s) và chuyển đổi thành văn bản phụ đề (SRT / JSON) bằng Whisper offline.

* **NATS Subject:** `jobs.ai`
* **Thư viện:** `openai-whisper` (model `tiny`), kết hợp `ffmpeg` để extract audio WAV 16kHz.
* **Cấu hình `params`:**
  * `language` *(string, optional, ví dụ `"en"` hoặc `"vi"`)*.
* **Mẫu `resultSummary` trả về:**
  ```json
  {
    "detectedLanguage": "vi",
    "durationSeconds": 14.5,
    "textSegmentCount": 3,
    "fullText": "Xin chào các bạn, đây là video thử nghiệm hệ thống...",
    "processingTimeMs": 18500
  }
  ```

---

### 2.6. `text-recognition` (Trích xuất văn bản trong ảnh / OCR)
Nhận diện và đọc toàn bộ chữ (text) xuất hiện trong ảnh (tài liệu, hóa đơn, biển hiệu, nhãn chai lọ...), vẽ khung viền quanh các khối chữ lên ảnh kết quả và xuất toàn bộ nội dung text cùng vị trí tọa độ.

* **NATS Subject:** `jobs.ai`
* **Thư viện:** `easyocr` (hỗ trợ 80+ ngôn ngữ, bao gồm tiếng Việt và tiếng Anh, tự tải weights ~40MB, chạy mượt trên CPU) hoặc `pytesseract`.
* **Cấu hình `params`:**
  * `languages` *(list of string, optional, mặc định `["en"]`)*: Ngôn ngữ cần nhận diện, ví dụ `["en", "vi"]`.
  * `drawBoxes` *(bool, optional, mặc định `true`)*: Vẽ khung viền quanh các đoạn chữ phát hiện được lên ảnh kết quả.
* **Mẫu Job Message nhận từ NATS:**
  ```json
  {
    "jobId": "d3e4f5a6-7890-12bc-defa-445566778899",
    "type": "text-recognition",
    "input": {
      "bucket": "uploads",
      "key": "d3e4f5a6-7890-12bc-defa-445566778899/input.jpg"
    },
    "output": {
      "bucket": "results",
      "key": "d3e4f5a6-7890-12bc-defa-445566778899/result.jpg"
    },
    "params": {
      "languages": ["en", "vi"],
      "drawBoxes": true
    }
  }
  ```
* **Mẫu `resultSummary` trả về:**
  ```json
  {
    "detectedBlockCount": 4,
    "fullText": "ĐẠI HỌC QUỐC GIA HÀ NỘI TRƯỜNG ĐẠI HỌC CÔNG NGHỆ",
    "blocks": [
      {
        "text": "ĐẠI HỌC",
        "confidence": 0.98,
        "box": [[45, 30], [180, 30], [180, 75], [45, 75]]
      },
      {
        "text": "QUỐC GIA HÀ NỘI",
        "confidence": 0.95,
        "box": [[195, 30], [450, 30], [450, 75], [195, 75]]
      },
      {
        "text": "TRƯỜNG ĐẠI HỌC CÔNG NGHỆ",
        "confidence": 0.93,
        "box": [[45, 90], [520, 90], [520, 140], [45, 140]]
      }
    ],
    "processingTimeMs": 680
  }
  ```

---

## 3. Quy chuẩn mã lỗi xử lý thất bại (Standardized Error Codes)

Khi xử lý gặp sự cố, Worker bắt buộc phải bắt ngoại lệ (try-except) và phát ra event `status: "FAILED"` với mã lỗi rõ ràng:

```json
{
  "jobId": "e1f2a3b4-5678-90ab-cdef-1234567890ab",
  "status": "FAILED",
  "progress": 0,
  "stage": "INFERENCE",
  "error": {
    "code": "MODEL_INFERENCE_ERROR",
    "message": "Corrupted image data or unsupported channels"
  },
  "timestamp": "2026-09-21T07:05:10Z"
}
```

### Danh mục mã lỗi chuẩn:
* `STORAGE_DOWNLOAD_ERROR`: Không tìm thấy file trong MinIO hoặc lỗi mạng S3.
* `INVALID_INPUT_FILE`: File tải về không phải là file ảnh/video hợp lệ hoặc bị hỏng (corrupted).
* `UNSUPPORTED_JOB_TYPE`: Giá trị `type` trong job không nằm trong danh sách hỗ trợ.
* `MODEL_INFERENCE_ERROR`: Lỗi phát sinh trong quá trình chạy YOLO hoặc thuật toán xử lý ảnh.
* `STORAGE_UPLOAD_ERROR`: Lỗi khi lưu file kết quả ngược lại lên MinIO.
