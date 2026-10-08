# Integration Contracts

This document defines the interfaces between the Web, Engine, and Infrastructure components.

NATS subjects are used instead of Redis lists for the queue.

A simple design is:

```text
NATS JetStream
│
├── Stream: AI_JOBS
│   └── Subject: jobs.ai
│       └── Durable Consumer: ai-workers
│
├── Stream: IMAGE_JOBS
│   └── Subject: jobs.image
│       └── Durable Consumer: image-workers
│
└── Stream: JOB_EVENTS
    ├── Subject: jobs.progress
    └── Subject: jobs.completed / jobs.failed
        └── Durable Consumer: backend-job-events
```


## 1. Message Subjects (Danh sách các kênh giao tiếp)

Hệ thống sử dụng **NATS JetStream** để vận chuyển các thông điệp JSON giữa Backend và Worker qua 3 kênh chính:

| Kênh (Subject) | Người gửi (Publisher) | Người nhận (Subscriber) | Mục đích |
| :--- | :--- | :--- | :--- |
| **`jobs.ai`** | **Backend** | **AI Worker Pool** | Giao các tác vụ AI: Nhận diện vật thể, OCR, Tách nền. |
| **`jobs.image`** | **Backend** | **Image Worker Pool** | Giao các tác vụ xử lý thông thường: Đổi đuôi ảnh, resize, nén. |
| **`jobs.events`** | **Worker Pool** | **Backend** | Báo cáo tiến trình (`PROCESSING`), hoàn thành (`COMPLETED`), hoặc thất bại (`FAILED`). |

---

## 2. Cấu trúc JSON theo từng kênh giao việc (Job Commands)

### A. Kênh `jobs.ai` (Backend gửi sang Worker AI)

#### ① Job Nhận diện vật thể (`type: "object-detection"`)
Dùng để phát hiện các đối tượng (người, xe, động vật...), vẽ bounding box và thống kê.
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

#### ② Job Trích xuất chữ trong ảnh / OCR (`type: "text-recognition"`)
Dùng để nhận diện và đọc văn bản (biển hiệu, hóa đơn, tài liệu...) trong ảnh.
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

#### ③ Job Tách nền ảnh (`type: "background-removal"`)
Dùng để xóa phông nền và xuất ảnh PNG trong suốt.
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

---

### B. Kênh `jobs.image` (Backend gửi sang Worker Xử lý ảnh thường)

#### ① Job Đổi đuôi & Resize ảnh (`type: "image-convert"`)
Dùng để chuyển đổi định dạng ảnh (JPEG, PNG, WEBP), co giãn kích thước hoặc nén dung lượng.
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

### Các trường quy chuẩn trong Job Command:
* `jobId` *(string, UUID v4)*: Định danh duy nhất của tác vụ.
* `type` *(string)*: Tên loại tác vụ xử lý (`object-detection`, `image-convert`, `text-recognition`, `background-removal`).
* `input.bucket` *(string)*: Tên bucket MinIO chứa tệp nguồn (mặc định: `"uploads"`).
* `input.key` *(string)*: Đường dẫn tệp nguồn trên MinIO (`<jobId>/input.<ext>`).
* `output.bucket` *(string)*: Tên bucket MinIO lưu kết quả (mặc định: `"results"`).
* `output.key` *(string)*: Đường dẫn tệp kết quả trên MinIO (`<jobId>/result.<ext>`).
* `params` *(object)*: Tham số cấu hình đặc thù của từng loại job.

---

## 3. Cấu trúc JSON kênh báo cáo sự kiện: `jobs.events` (Worker gửi sang Backend)

Worker phát các thông điệp JSON này lên kênh **`jobs.events`**. Backend tiêu thụ để cập nhật trạng thái vào cơ sở dữ liệu PostgreSQL.

### A. Sự kiện Đang xử lý (`status: "PROCESSING"`)
Phát ra khi Worker bắt đầu nhận việc và tải dữ liệu từ MinIO:
```json
{
  "jobId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
  "status": "PROCESSING",
  "progress": 30,
  "stage": "PROCESSING",
  "timestamp": "2026-10-08T07:00:01Z"
}
```
*Các stage chuẩn:* `DOWNLOADING_INPUT`, `PROCESSING`, `UPLOADING_OUTPUT`.

---

### B. Sự kiện Hoàn thành (`status: "COMPLETED"`)
Phát ra sau khi file kết quả đã được upload an toàn lên bucket `results` trên MinIO.

#### Mẫu 1: Kết quả của Job `object-detection`
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
    "processingTimeMs": 215
  },
  "timestamp": "2026-10-08T07:00:03Z"
}
```

#### Mẫu 2: Kết quả của Job `text-recognition` (OCR)
```json
{
  "jobId": "d3e4f5a6-7890-12bc-defa-445566778899",
  "status": "COMPLETED",
  "progress": 100,
  "stage": "DONE",
  "result": {
    "bucket": "results",
    "key": "d3e4f5a6-7890-12bc-defa-445566778899/result.jpg"
  },
  "resultSummary": {
    "detectedBlockCount": 2,
    "fullText": "ĐẠI HỌC CÔNG NGHỆ - ĐHQGHN",
    "blocks": [
      {"text": "ĐẠI HỌC CÔNG NGHỆ", "confidence": 0.98, "box": [[45, 30], [350, 30], [350, 75], [45, 75]]},
      {"text": "- ĐHQGHN", "confidence": 0.94, "box": [[360, 30], [480, 30], [480, 75], [360, 75]]}
    ],
    "processingTimeMs": 580
  },
  "timestamp": "2026-10-08T07:00:04Z"
}
```

#### Mẫu 3: Kết quả của Job `image-convert`
```json
{
  "jobId": "a1b2c3d4-5678-90ab-cdef-112233445566",
  "status": "COMPLETED",
  "progress": 100,
  "stage": "DONE",
  "result": {
    "bucket": "results",
    "key": "a1b2c3d4-5678-90ab-cdef-112233445566/result.webp"
  },
  "resultSummary": {
    "originalFormat": "PNG",
    "targetFormat": "WEBP",
    "originalDimensions": [1920, 1080],
    "outputDimensions": [1280, 720],
    "originalSizeBytes": 2048500,
    "outputSizeBytes": 320140,
    "processingTimeMs": 35
  },
  "timestamp": "2026-10-08T07:00:02Z"
}
```

---

### C. Sự kiện Thất bại (`status: "FAILED"`)
Phát ra khi xảy ra lỗi trong quá trình xử lý (ảnh hỏng, không tìm thấy file...):
```json
{
  "jobId": "c9bf9e57-1685-4c89-bafb-ff5af830be8a",
  "status": "FAILED",
  "progress": 0,
  "stage": "PROCESSING",
  "error": {
    "code": "MODEL_INFERENCE_ERROR",
    "message": "Corrupted image file or unsupported image channels"
  },
  "timestamp": "2026-10-08T07:00:02Z"
}
```

#### Danh mục mã lỗi chuẩn (`error.code`):
* `STORAGE_DOWNLOAD_ERROR`: Lỗi không tải được file từ MinIO.
* `INVALID_INPUT_FILE`: File không phải ảnh hợp lệ hoặc bị hỏng.
* `UNSUPPORTED_JOB_TYPE`: Loại job không nằm trong danh sách hỗ trợ.
* `MODEL_INFERENCE_ERROR`: Lỗi trong quá trình chạy mô hình AI hoặc xử lý ảnh.
* `STORAGE_UPLOAD_ERROR`: Lỗi khi tải file kết quả lên MinIO.

---

## 6. Ownership Rules

### Backend owns

- Job creation
- Job lifecycle state
- PostgreSQL schema
- API response format
- Validation of worker events

### Worker owns

- Actual processing
- Model loading
- MinIO input/output
- Progress reporting
- Processing errors

### NATS owns

- Delivery of commands/events
- Durable message storage according to JetStream retention
- Consumer state
- Acknowledgement/redelivery

### PostgreSQL owns

- Current authoritative job state
- Job history/metadata required by the application

### MinIO owns

- Large binary objects

---

## 7. Database State Updates

The Backend consumes worker events:

```text
NATS event
    |
    v
Backend event consumer
    |
    v
Validate event
    |
    v
Update jobs row
    |
    v
PostgreSQL
```

The worker does **not** need a PostgreSQL connection.

This keeps the Engine independent from the Web application's persistence implementation.

---

## 8. Idempotency

Every event contains `jobId`.

The backend should safely handle duplicate events.

For example:

```text
COMPLETED(job-123)
COMPLETED(job-123)
```

must not corrupt the database.

A simple first implementation can use:

- `jobId` as the primary identifier
- monotonically increasing progress
- terminal-state protection

Example:

```text
PROCESSING 80%
     |
     v
COMPLETED 100%
     |
     X
PROCESSING 90%   <- ignore/reject stale event
```

For a more rigorous implementation, add an event sequence number:

```json
{
  "jobId": "uuid-1234",
  "sequence": 4,
  "status": "PROCESSING",
  "progress": 80
}
```

---

## 9. Frontend Contract

The frontend does not communicate with NATS.

It uses the Backend REST API:

```text
Frontend
   |
   +--> POST /api/jobs
   |
   +--> GET /api/jobs/:id
   |
   +--> GET /api/system/stats
```

The backend reads PostgreSQL and returns application state.

This means a browser refresh does not lose job progress.

---

## 10. Queue vs. Database Semantics

### NATS JetStream

Represents work/events that are being transported:

```text
"Here is a job to process."
"Job 123 is now 50% complete."
"Job 123 completed."
```

### PostgreSQL

Represents persistent application state:

```text
"Job 123 currently has status COMPLETED and progress 100."
```

Neither should replace the other.

---

## 11. KEDA Contract

Infrastructure creates the KEDA `ScaledObject`.

Example:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ai-worker
spec:
  scaleTargetRef:
    name: ai-worker
  minReplicaCount: 0
  maxReplicaCount: 3
  triggers:
    - type: nats-jetstream
      metadata:
        natsServerMonitoringEndpoint: "nats:8222"
        account: "$G"
        stream: "JOBS"
        consumer: "ai-workers"
        lagThreshold: "3"
        activationLagThreshold: "1"
        useHttps: "false"
```

The exact target and replica values must be tuned through testing on the project's hardware.

---

## 12. Development Independence

### Web can test without the real Engine

Use a mock event publisher:

```text
Backend
   |
   v
NATS
   ^
   |
Mock worker/event publisher
```

### Engine can test without the Web UI

Publish a test job directly:

```text
NATS -> Python Worker -> MinIO
```

The worker publishes progress events back to NATS.

### Infra can test without AI

Inject dummy jobs into JetStream:

```text
test message
    |
    v
NATS JetStream
    |
    v
KEDA
    |
    v
dummy worker Deployment
```

This isolates the autoscaling demonstration from AI inference time.

