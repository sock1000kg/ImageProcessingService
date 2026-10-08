# Tài liệu Giao thức Giao tiếp giữa Backend và Engine (Handshake Contract)

> **Dành cho:** Phụ trách Backend (Anh Đức Huy) và Phụ trách Engine (Huy Đức)  
> **Mục đích:** Quy chuẩn toàn bộ cấu trúc JSON và đường dẫn tệp MinIO để hai bên lập trình độc lập và tích hợp trơn tru.

---

## 1. Bản chất giao tiếp & Giải thích thuật ngữ

1. **MinIO là kho chứa tệp nhị phân nặng:**
   * Tệp người dùng upload (ảnh `.jpg`, `.png`, `.webp`, video `.mp4`...) được lưu trên **MinIO**.
   * Không bao giờ gửi dữ liệu nhị phân (binary/base64) qua NATS để tránh làm nghẽn hàng đợi.
2. **NATS JetStream là hệ thống chuyển phát tin nhắn JSON:**
   * `jobs.ai`, `jobs.image`, `jobs.events` **KHÔNG PHẢI LÀ FILE**, mà là **tên kênh truyền thông điệp (Subject/Topic)** trên NATS (tương tự tên kênh chat `#jobs-ai`, `#jobs-image`).
   * **Backend** gửi gói tin JSON (chứa đường dẫn MinIO và tham số) vào kênh `jobs.ai` hoặc `jobs.image`.
   * **Worker** đọc JSON từ NATS $\rightarrow$ kết nối MinIO tải tệp về xử lý $\rightarrow$ tải tệp kết quả lên MinIO $\rightarrow$ bắn JSON thông báo hoàn thành vào kênh `jobs.events`.

---

## 2. Quy ước đường dẫn tệp trên MinIO

| Loại tệp | Bucket trên MinIO | Quy tắc đặt đường dẫn (`key`) | Ví dụ | Do ai ghi / đọc |
| :--- | :--- | :--- | :--- | :--- |
| **Tệp đầu vào** (ảnh/video gốc) | `uploads` | `<jobId>/input.<ext>` | `uploads/123e4567/input.jpg` | **Backend** tải lên, **Engine** tải về đọc |
| **Tệp kết quả** (sau khi xử lý) | `results` | `<jobId>/result.<ext>` | `results/123e4567/result.jpg` | **Engine** tải lên, **Frontend/User** tải về đọc |

*Lưu ý: `<jobId>` là chuỗi định danh duy nhất dạng UUID v4 (ví dụ: `c9bf9e57-1685-4c89-bafb-ff5af830be8a`).*

---

## 3. Cấu trúc JSON Backend gửi sang Engine (Job Command)

Được Backend bắn vào kênh:
* Kênh **`jobs.ai`** nếu `type` là: `"object-detection"`, `"background-removal"`, `"text-recognition"`.
* Kênh **`jobs.image`** nếu `type` là: `"image-convert"`.

### 3.1. Job Nhận diện vật thể (`type: "object-detection"`)
* **Kênh NATS:** `jobs.ai`
* **Cấu trúc JSON:**
```json
{
  "jobId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
  "type": "object-detection",
  "input": {
    "bucket": "uploads",
    "key": "c9bf9e57-1685-4c89-bafb-ff5af830be8a/input.jpg"
  },
  "output": {
    "bucket": "results",
    "key": "c9bf9e57-1685-4c89-bafb-ff5af830be8a/result.jpg"
  },
  "params": {
    "confidenceThreshold": 0.45
  }
}
```

### 3.2. Job Đổi đuôi / Resize ảnh (`type: "image-convert"`)
* **Kênh NATS:** `jobs.image`
* **Cấu trúc JSON:**
```json
{
  "jobId": "a1b2c3d4-5678-90ab-cdef-112233445566",
  "type": "image-convert",
  "input": {
    "bucket": "uploads",
    "key": "a1b2c3d4-5678-90ab-cdef-112233445566/input.png"
  },
  "output": {
    "bucket": "results",
    "key": "a1b2c3d4-5678-90ab-cdef-112233445566/result.webp"
  },
  "params": {
    "targetFormat": "WEBP",
    "quality": 85,
    "width": 1280,
    "height": 720
  }
}
```
*(Ghi chú: `targetFormat` nhận một trong 3 giá trị: `"JPEG"`, `"PNG"`, `"WEBP"`. `width` và `height` là tùy chọn).*

### 3.3. Job Tách nền ảnh (`type: "background-removal"`) — *Pha 2*
* **Kênh NATS:** `jobs.ai`
* **Cấu trúc JSON:**
```json
{
  "jobId": "f9e8d7c6-4321-ba09-fedc-998877665544",
  "type": "background-removal",
  "input": {
    "bucket": "uploads",
    "key": "f9e8d7c6-4321-ba09-fedc-998877665544/input.jpg"
  },
  "output": {
    "bucket": "results",
    "key": "f9e8d7c6-4321-ba09-fedc-998877665544/result.png"
  },
  "params": {
    "alphaMatting": false
  }
}
```

### 3.4. Job Trích xuất chữ / OCR (`type: "text-recognition"`) — *Pha 2*
* **Kênh NATS:** `jobs.ai`
* **Cấu trúc JSON:**
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
*(Ghi chú: `languages` là mảng ngôn ngữ cần nhận diện, mặc định `["en"]`. `drawBoxes` nếu là `true` thì worker sẽ vẽ khung viền quanh các khối chữ lên ảnh kết quả).*

---

## 4. Cấu trúc JSON Engine gửi ngược về Backend (Worker Events)

Worker sẽ phát các sự kiện này vào kênh: **`jobs.events`**.  
Backend lắng nghe kênh này để cập nhật hàng tương ứng trong bảng PostgreSQL.

### 4.1. Sự kiện đang xử lý (`status: "PROCESSING"`)
Phát ra ngay khi Worker nhận job và bắt đầu kéo ảnh từ MinIO:
```json
{
  "jobId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
  "status": "PROCESSING",
  "progress": 20,
  "stage": "DOWNLOADING_INPUT",
  "timestamp": "2026-09-21T07:00:01Z"
}
```
*Các stage phổ biến:* `DOWNLOADING_INPUT`, `PROCESSING`, `UPLOADING_OUTPUT`.

### 4.2. Sự kiện hoàn tất thành công (`status: "COMPLETED"`)
Phát ra sau khi kết quả đã được upload an toàn lên MinIO `results/`:
```json
{
  "jobId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
  "status": "COMPLETED",
  "progress": 100,
  "stage": "DONE",
  "result": {
    "bucket": "results",
    "key": "c9bf9e57-1685-4c89-bafb-ff5af830be8a/result.jpg"
  },
  "resultSummary": {
    "objectsDetected": 3,
    "labels": ["person", "dog", "car"],
    "details": [
      {"label": "person", "confidence": 0.92, "box": [34, 12, 120, 250]},
      {"label": "dog", "confidence": 0.85, "box": [130, 80, 200, 220]},
      {"label": "car", "confidence": 0.78, "box": [220, 100, 380, 280]}
    ],
    "processingTimeMs": 235
  },
  "timestamp": "2026-09-21T07:00:03Z"
}
```

*Ví dụ `resultSummary` khi trả về của Job `text-recognition` (OCR):*
```json
{
  "detectedBlockCount": 3,
  "fullText": "ĐẠI HỌC CÔNG NGHỆ - ĐHQGHN",
  "blocks": [
    {"text": "ĐẠI HỌC", "confidence": 0.98, "box": [[45, 30], [180, 30], [180, 75], [45, 75]]},
    {"text": "CÔNG NGHỆ", "confidence": 0.96, "box": [[190, 30], [350, 30], [350, 75], [190, 75]]},
    {"text": "ĐHQGHN", "confidence": 0.94, "box": [[360, 30], [480, 30], [480, 75], [360, 75]]}
  ],
  "processingTimeMs": 520
}
```
> **Backend xử lý:**
> * Cập nhật cột `status = 'COMPLETED'`, `progress = 100`.
> * Lưu nguyên trường `resultSummary` vào cột `result_summary` (dạng JSONB trong PostgreSQL) để trả về cho Frontend hiển thị.
> * Cung cấp link tải trực tiếp: `/results/c9bf9e57-1685-4c89-bafb-ff5af830be8a/result.jpg`.

### 4.3. Sự kiện thất bại (`status: "FAILED"`)
Phát ra khi file hỏng, sai định dạng hoặc lỗi inference:
```json
{
  "jobId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
  "status": "FAILED",
  "progress": 0,
  "stage": "PROCESSING",
  "error": {
    "code": "MODEL_INFERENCE_ERROR",
    "message": "Corrupted image file or unsupported channels"
  },
  "timestamp": "2026-09-21T07:00:02Z"
}
```
> **Danh sách mã lỗi (`error.code`):**
> * `STORAGE_DOWNLOAD_ERROR`: Không tìm thấy ảnh trên MinIO hoặc lỗi mạng.
> * `UNSUPPORTED_JOB_TYPE`: Loại job không được hỗ trợ.
> * `MODEL_INFERENCE_ERROR`: Lỗi trong quá trình chạy YOLO/Pillow.
> * `STORAGE_UPLOAD_ERROR`: Lỗi khi đẩy file kết quả lên MinIO.
