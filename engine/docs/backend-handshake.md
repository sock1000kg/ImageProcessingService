# Giao thức Giao tiếp Backend — Engine (Handshake Contract)
## Cloud-Native Privacy Service

> **Dành cho:** Phụ trách Backend (Anh Đức Huy) và Phụ trách Engine (Huy Đức)  
> **Mục đích:** Quy chuẩn toàn bộ cấu trúc tin nhắn NATS, đường dẫn tệp MinIO, vòng đời sự kiện để hai bên lập trình độc lập, không phụ thuộc và tích hợp trơn tru.

---

## 1. Nguyên tắc Phân định Trách nhiệm (Ownership)

* **MinIO lưu trữ nhị phân:** Toàn bộ file ảnh, video gốc và kết quả được lưu trữ trên MinIO. Không bao giờ gửi dữ liệu file nhị phân (binary/base64) qua NATS.
* **NATS JetStream vận chuyển điều khiển:** Chỉ gửi các thông điệp JSON chứa định danh `jobId`, đường dẫn MinIO và tham số cấu hình.
* **Độc lập cơ sở dữ liệu:** Worker **không** kết nối trực tiếp với PostgreSQL. Worker chỉ báo cáo trạng thái qua `jobs.events`; Backend tiêu thụ sự kiện này để cập nhật DB.
* **Hạ tầng bất biến:** Cả Backend và Worker **không tự tạo/sửa stream, consumer hay bucket**. Mọi tài nguyên được khởi tạo sẵn qua script hạ tầng của Đạt (Infra).

---

## 2. Quy ước Đường dẫn Tệp trên MinIO

Hạ tầng cấu hình 2 bucket chính (đều tự động xóa dữ liệu sau **24 giờ**):
1. **`uploads` (Private):** Chứa file người dùng tải lên và ảnh mẫu whitelist.
2. **`results` (Public chỉ đọc):** Chứa file kết quả sau khi đã che xong.

### Bảng quy ước `key`:

| Loại tệp | Bucket | Quy tắc đặt đường dẫn (`key`) | Ví dụ | Do ai ghi / đọc |
| :--- | :--- | :--- | :--- | :--- |
| **Ảnh/Video trong batch** | `uploads` | `<batchId>/<jobId>/input.<ext>` | `0f1e.../a1b2.../input.jpg` | **Backend** ghi, **Engine** đọc |
| **Ảnh/Video job lẻ** | `uploads` | `<jobId>/input.<ext>` | `a1b2.../input.jpg` | **Backend** ghi, **Engine** đọc |
| **Ảnh chân dung Whitelist** | `uploads` | `<batchId>/whitelist/face-<n>.<ext>` | `0f1e.../whitelist/face-1.jpg` | **Backend** ghi, **Engine** đọc |
| **Kết quả sau khi che** | `results` | `<batchId>/<jobId>/result.<ext>` | `0f1e.../a1b2.../result.jpg` | **Engine** ghi, **Frontend/User** đọc |

---

## 3. Các Kênh Giao tiếp NATS JetStream

| Kênh (Subject) | Stream | Consumer | Chiều gửi | Tác vụ |
| :--- | :--- | :--- | :--- | :--- |
| **`jobs.image`** | `IMAGE_JOBS` | `image-workers` | Backend $\rightarrow$ Worker | Giao việc ẩn danh hóa ảnh tĩnh (`image-redact`). |
| **`jobs.video`** | `VIDEO_JOBS` | `video-workers` | Backend $\rightarrow$ Worker | Giao việc ẩn danh hóa video (`video-redact` — Phase 2). |
| **`jobs.events`** | `JOB_EVENTS` | `backend-job-events` | Worker $\rightarrow$ Backend | Báo cáo tiến trình, kết quả hoặc lỗi xử lý. |

---

## 4. Cấu trúc Job Command (Backend gửi sang Worker)

### Mẫu `image-redact` (Kênh `jobs.image`):
```json
{
  "jobId": "a1b2c3d4-5678-40ab-8def-112233445566",
  "batchId": "0f1e2d3c-4b5a-4697-8877-665544332211",
  "type": "image-redact",
  "input": {
    "bucket": "uploads",
    "key": "0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-5678-40ab-8def-112233445566/input.jpg"
  },
  "output": {
    "bucket": "results",
    "key": "0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-5678-40ab-8def-112233445566/result.jpg"
  },
  "params": {
    "redaction": {
      "targets": ["face", "plate"],
      "style": "blur",
      "strength": 25,
      "padding": 0.1
    },
    "confidenceThreshold": 0.35,
    "reviewThreshold": 0.5,
    "whitelist": {
      "faces": [
        {
          "bucket": "uploads",
          "key": "0f1e2d3c-4b5a-4697-8877-665544332211/whitelist/face-1.jpg"
        }
      ],
      "similarityThreshold": 0.6
    }
  }
}
```

---

## 5. Cấu trúc Sự kiện Báo cáo (Worker gửi về `jobs.events`)

### 5.1. Sự kiện Đang xử lý (`status: "PROCESSING"`)
Worker gửi khi bắt đầu tiếp nhận job hoặc đang ở các chặng tính toán:
```json
{
  "jobId": "a1b2c3d4-5678-40ab-8def-112233445566",
  "batchId": "0f1e2d3c-4b5a-4697-8877-665544332211",
  "status": "PROCESSING",
  "progress": 40,
  "stage": "DETECTING",
  "timestamp": "2026-10-24T07:00:01Z"
}
```
*Các giá trị `stage` chuẩn của Engine:* `DOWNLOADING`, `DETECTING`, `REDACTING`, `UPLOADING`, `DONE`.

### 5.2. Sự kiện Hoàn thành (`status: "COMPLETED"`)
Phát ra sau khi kết quả đã được upload an toàn lên MinIO bucket `results`:
```json
{
  "jobId": "a1b2c3d4-5678-40ab-8def-112233445566",
  "batchId": "0f1e2d3c-4b5a-4697-8877-665544332211",
  "status": "COMPLETED",
  "progress": 100,
  "stage": "DONE",
  "result": {
    "bucket": "results",
    "key": "0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-5678-40ab-8def-112233445566/result.jpg"
  },
  "resultSummary": {
    "imageSize": [1920, 1080],
    "counts": {
      "face": 3,
      "plate": 1,
      "whitelistedFace": 1,
      "redacted": 3,
      "lowConfidence": 1
    },
    "detections": [
      {
        "label": "face",
        "confidence": 0.92,
        "box": [34, 12, 120, 250],
        "redacted": true,
        "whitelisted": false,
        "lowConfidence": false
      },
      {
        "label": "face",
        "confidence": 0.88,
        "box": [400, 40, 480, 160],
        "redacted": false,
        "whitelisted": true,
        "similarity": 0.71
      }
    ],
    "redaction": { "style": "blur", "strength": 25, "padding": 0.1 },
    "model": "yolov8n-oiv7",
    "processingTimeMs": 380
  },
  "timestamp": "2026-10-24T07:00:02Z"
}
```

### 5.3. Sự kiện Thất bại (`status: "FAILED"`)
```json
{
  "jobId": "a1b2c3d4-5678-40ab-8def-112233445566",
  "batchId": "0f1e2d3c-4b5a-4697-8877-665544332211",
  "status": "FAILED",
  "progress": 0,
  "stage": "DETECTING",
  "error": {
    "code": "INVALID_INPUT_FILE",
    "message": "cannot identify image file"
  },
  "timestamp": "2026-10-24T07:00:02Z"
}
```

---

## 6. Cơ chế Xử lý Bộ ảnh (Batch Processing)

* Khi người dùng upload một bộ gồm $N$ bức ảnh, **Backend tự động phân tách thành $N$ job riêng biệt**, mỗi job có 1 `jobId` độc lập và chung `batchId`.
* Backend bắn $N$ message riêng vào `jobs.image`.
* KEDA trên Kubernetes nhìn thấy $N$ message đang chờ trong hàng đợi và tự động scale pod để xử lý song song.
* Nếu có 1 bức ảnh bị lỗi (`FAILED`), chỉ duy nhất job đó bị ảnh hưởng và người dùng có thể bấm thử lại (Retry) mà không cần xử lý lại toàn bộ bộ ảnh.
