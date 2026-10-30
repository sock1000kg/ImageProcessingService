# Integration Contracts

Tài liệu này định nghĩa giao tiếp giữa Web, Engine và Infrastructure của **Cloud-Native Privacy Service**: dịch vụ tự động phát hiện và che khuôn mặt, biển số trong ảnh/video (đề tài: `docs/report-material/de-tai.md`).

```text
NATS JetStream
│
├── Stream: IMAGE_JOBS
│   └── Subject: jobs.image
│       └── Durable Consumer: image-workers     (ẩn danh hoá ảnh — Phase 1)
│
├── Stream: VIDEO_JOBS
│   └── Subject: jobs.video
│       └── Durable Consumer: video-workers     (ẩn danh hoá video — Phase 2)
│
└── Stream: JOB_EVENTS
    └── Subject: jobs.events
        └── Durable Consumer: backend-job-events
```

Tất cả stream, consumer và bucket do **Infra tạo sẵn** (xem mục 4). App chỉ bind vào, không tự tạo.

## 1. Message Subjects

| Subject | Publisher | Subscriber | Mục đích |
| :--- | :--- | :--- | :--- |
| **`jobs.image`** | Backend | Image Worker Pool | Ẩn danh hoá **ảnh**: `image-redact`. Nhanh, nhiều job nhỏ. |
| **`jobs.video`** | Backend | Video Worker Pool | Ẩn danh hoá **video**: `video-redact` (Phase 2). Nặng, chạy lâu (YOLO + ByteTrack + FFmpeg). |
| **`jobs.events`** | Worker Pool | Backend | Tiến trình (`PROCESSING`), hoàn thành (`COMPLETED`), thất bại (`FAILED`). |

**Batch (bộ ảnh):** người dùng tải lên một bộ ảnh → Backend tạo một `batch` và **mỗi ảnh là một job riêng** (một message). Nhờ vậy KEDA thấy N message để scale, ảnh lỗi chỉ hỏng riêng nó và thử lại riêng. Batch chỉ tồn tại ở Backend (PostgreSQL). Worker không cần biết batch, chỉ trả `batchId` lại trong event nếu có.

---

## 2. Job Commands

### Các trường chung
* `jobId` *(UUID v4)*: định danh job.
* `batchId` *(UUID v4, tuỳ chọn)*: batch chứa job. Worker không dùng, chỉ trả lại trong event.
* `type` *(string)*: `image-redact`, `video-redact`.
* `input` / `output`: `{bucket, key}` trên MinIO (đường dẫn xem mục 5).
* `params` *(object)*: cấu hình theo từng loại job (bên dưới).

### Cấu hình che (`params.redaction`, dùng chung cho mọi loại)
| Trường | Kiểu | Mặc định | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `targets` | `["face","plate"]` | cả hai | Loại đối tượng cần che. |
| `style` | `"blur"` \| `"pixelate"` \| `"blackout"` | `"blur"` | Gaussian blur / mosaic / băng đen. |
| `strength` | số nguyên | blur: 25, pixelate: 12 | Bán kính blur hoặc kích thước ô pixel. Bỏ qua với `blackout`. |
| `padding` | số thực 0–0.5 | 0.1 | Nới rộng box theo tỉ lệ để che kín mép. |

### Chất lượng đầu ra (`params.output`, dùng chung cho mọi loại)
| Trường | Kiểu | Mặc định | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `quality` | `"standard"` \| `"high"` \| `"max"` | `"high"` | Mức chất lượng nén. Mỗi encoder có thang riêng, nên contract chỉ chốt **mức**, Engine map sang tham số thật (bảng dưới). |

| Mức | JPEG (Pillow) | WEBP (Pillow) | PNG | Video H.264 (Phase 2) |
| :--- | :--- | :--- | :--- | :--- |
| `standard` | quality 80 | quality 75 | lossless | CRF 28 |
| `high` | quality 90 | quality 85 | lossless | CRF 23 |
| `max` | quality 95, chroma 4:4:4 | lossless | lossless | CRF 18 |

* JPEG trên 95 gần như không đẹp hơn mà file to hơn nhiều, nên `max` dừng ở 95. Con số cụ thể là của Engine, đổi được mà không cần đổi contract, miễn thứ tự `standard` < `high` < `max` giữ nguyên.
* **Định dạng đầu ra** = đuôi của `output.key` (`.jpg`, `.png`, `.webp`), có thể khác định dạng ảnh gốc. Backend chọn đuôi theo lựa chọn của người dùng (mặc định: giữ như ảnh gốc). Ảnh có kênh alpha xuất ra JPG thì Engine ghép lên nền trắng.
* Kết quả **giữ nguyên độ phân giải** ảnh gốc (không có tuỳ chọn đổi kích thước: box trong `detections` luôn khớp với cả ảnh gốc lẫn kết quả).
* EXIF/GPS bị xoá khỏi kết quả (ảnh public không mang vị trí chụp).

### A. `image-redact` (subject `jobs.image`)
Phát hiện khuôn mặt/biển số, áp dụng whitelist, che, xuất ảnh kết quả + danh sách phát hiện.
```json
{
  "jobId": "a1b2c3d4-5678-40ab-8def-112233445566",
  "batchId": "0f1e2d3c-4b5a-4697-8877-665544332211",
  "type": "image-redact",
  "input":  { "bucket": "uploads", "key": "0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-5678-40ab-8def-112233445566/input.jpg" },
  "output": { "bucket": "results", "key": "0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-5678-40ab-8def-112233445566/result.jpg" },
  "params": {
    "redaction": { "targets": ["face", "plate"], "style": "pixelate", "strength": 12, "padding": 0.1 },
    "output": { "quality": "high" },
    "confidenceThreshold": 0.35,
    "reviewThreshold": 0.5,
    "whitelist": {
      "faces": [ { "bucket": "uploads", "key": "0f1e2d3c-4b5a-4697-8877-665544332211/whitelist/face-1.jpg" } ],
      "similarityThreshold": 0.6
    }
  }
}
```
* `confidenceThreshold`: dưới ngưỡng này thì bỏ qua phát hiện.
* `reviewThreshold`: phát hiện có confidence dưới ngưỡng này vẫn được che, nhưng bị đánh dấu `lowConfidence` để người dùng kiểm tra lại.
* `whitelist.faces`: ảnh chân dung mẫu (tuỳ chọn). Khuôn mặt có cosine similarity ≥ `similarityThreshold` với **bất kỳ** mẫu nào thì **không** bị che. Ưu tiên tránh nhận nhầm người lạ, nên khi phân vân thì che.
* Whitelist biển số cần OCR nên để **Phase 2**.

### B. `video-redact` (subject `jobs.video`, Phase 2)
Cùng `params` như `image-redact`, thêm theo dõi đối tượng (ByteTrack) để vết che không nhấp nháy. Giữ nguyên âm thanh gốc bằng FFmpeg. Đầu vào MP4 (H.264), 15–60 giây. Đầu ra MP4. Chi tiết `resultSummary` chốt khi bắt đầu Phase 2.

---

## 3. Sự kiện `jobs.events` (Worker → Backend)

Mọi event có `jobId`, `status`, `progress` (0–100), `stage`, `timestamp`, và `batchId` nếu command có.
`stage` là chuỗi tự do do worker đặt, chỉ để hiển thị. Backend lưu nguyên và **không** dựa vào nó cho logic (logic chỉ dựa vào `status` và `progress`).

### A. `PROCESSING`
```json
{ "jobId": "a1b2c3d4-5678-40ab-8def-112233445566", "batchId": "0f1e2d3c-4b5a-4697-8877-665544332211",
  "status": "PROCESSING", "progress": 40, "stage": "DETECTING", "timestamp": "2026-10-24T07:00:01Z" }
```

### B. `COMPLETED` (`image-redact`)
```json
{
  "jobId": "a1b2c3d4-5678-40ab-8def-112233445566",
  "batchId": "0f1e2d3c-4b5a-4697-8877-665544332211",
  "status": "COMPLETED", "progress": 100, "stage": "DONE",
  "result": { "bucket": "results", "key": "0f1e2d3c-4b5a-4697-8877-665544332211/a1b2c3d4-5678-40ab-8def-112233445566/result.jpg" },
  "resultSummary": {
    "imageSize": [1920, 1080],
    "counts": { "face": 3, "plate": 1, "whitelistedFace": 1, "redacted": 3, "lowConfidence": 1 },
    "detections": [
      { "label": "face",  "confidence": 0.92, "box": [34, 12, 120, 250],  "redacted": true,  "whitelisted": false, "lowConfidence": false, "similarity": 0.18 },
      { "label": "face",  "confidence": 0.88, "box": [400, 40, 480, 160], "redacted": false, "whitelisted": true,  "similarity": 0.71, "whitelistRef": 0 },
      { "label": "face",  "confidence": 0.41, "box": [600, 90, 640, 140], "redacted": true,  "whitelisted": false, "lowConfidence": true,  "similarity": 0.55 },
      { "label": "plate", "confidence": 0.81, "box": [220, 300, 310, 340], "redacted": true,  "whitelisted": false, "lowConfidence": false }
    ],
    "redaction": { "style": "pixelate", "strength": 12, "padding": 0.1 },
    "model": "yolov8n-oiv7",
    "processingTimeMs": 420
  },
  "timestamp": "2026-10-24T07:00:02Z"
}
```
* `box` = `[x1, y1, x2, y2]` theo pixel của ảnh gốc, **trước** khi nới `padding`. UI dùng các box này để liệt kê/đánh dấu phát hiện trên ảnh.
* `whitelistRef`: vị trí (từ 0) của ảnh mẫu trong `params.whitelist.faces` khớp với khuôn mặt này. Chỉ có khi `whitelisted: true`. Dùng để báo cáo "người X xuất hiện trong N ảnh". `similarity` (giá trị cao nhất so với các mẫu) có ở **mọi** khuôn mặt khi batch có whitelist, kể cả khuôn mặt không khớp, để Web biết khuôn mặt nào sát ngưỡng.
* `model` cho biết model nào đã chạy (pretrained `yolov8n-oiv7` ở Phase 1, model fine-tune sau này), để báo cáo ghi rõ.

### C. `FAILED`
```json
{ "jobId": "a1b2c3d4-5678-40ab-8def-112233445566", "status": "FAILED", "progress": 0, "stage": "DETECTING",
  "error": { "code": "INVALID_INPUT_FILE", "message": "cannot identify image file" }, "timestamp": "2026-10-24T07:00:02Z" }
```

#### Mã lỗi (`error.code`)
* `STORAGE_DOWNLOAD_ERROR`: không tải được file từ MinIO.
* `INVALID_INPUT_FILE`: file không phải ảnh/video hợp lệ hoặc bị hỏng.
* `UNSUPPORTED_JOB_TYPE`: loại job không thuộc pool này.
* `WHITELIST_REFERENCE_ERROR`: ảnh mẫu whitelist không đọc được hoặc không có khuôn mặt.
* `MODEL_INFERENCE_ERROR`: lỗi khi chạy model hoặc khi che.
* `STORAGE_UPLOAD_ERROR`: không tải được kết quả lên MinIO.
* `WORKER_CRASHED`: job đã làm worker chết (hoặc quá hạn xử lý) `MAX_ATTEMPTS` lần liên tiếp. Xem mục 4 "Khi worker chết giữa chừng".

---

## 4. Hạ tầng dùng chung: stream, consumer, bucket

Infra tạo và cấu hình toàn bộ tài nguyên dưới đây bằng `infra/app/nats/setup-streams.sh` và `infra/app/minio/setup-buckets.sh`.
Cùng hai script đó chạy ở **cả local lẫn cluster**, nên code chạy được local thì lên cluster cũng chạy được.

| Stream | Subjects | Durable consumer | Ai dùng | ack_wait | max_deliver |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `IMAGE_JOBS` | `jobs.image`, `jobs.image.>` | `image-workers` | Worker ảnh | 1m | 5 |
| `VIDEO_JOBS` | `jobs.video`, `jobs.video.>` | `video-workers` | Worker video (Phase 2) | 5m | 5 |
| `JOB_EVENTS` | `jobs.events`, `jobs.events.>` | `backend-job-events` | Backend | 30s | 10 |

- Stream dùng retention **workqueue**: mỗi message chỉ được một consumer nhận. Vì vậy **không được tạo thêm consumer** trên các stream này (NATS sẽ từ chối, và KEDA chỉ theo dõi lag của đúng các consumer trên).
- Mọi consumer dùng explicit ack. Worker ack sau khi upload kết quả xong. Job xử lý lâu hơn `ack_wait` phải gửi `in_progress()` định kỳ.
- Bucket MinIO: `uploads` (private), `results` (public chỉ đọc qua `/results/<key>`). Phase 1: cả hai tự xoá object sau **24 giờ**. Từ Phase 2: giữ tới khi người dùng xoá (mục 5).
- Mỗi worker Deployment chỉ phục vụ **một pool** (một stream + một consumer, cấu hình qua env), để KEDA scale từng pool độc lập.

**Khi worker chết giữa chừng / lỗi tạm thời:**
- Worker chết (OOMKill, pod bị xoá, node restart) trước khi ack → heartbeat dừng → NATS giao lại message sau `ack_wait`, tối đa `max_deliver` lần. Key kết quả cố định nên chạy lại chỉ ghi đè cùng object. Backend đã chịu được event trùng (mục 8).
- Lỗi do **input** (`INVALID_INPUT_FILE`, `WHITELIST_REFERENCE_ERROR`, `UNSUPPORTED_JOB_TYPE`): worker gửi `FAILED` rồi **ack** (chạy lại cũng không khỏi).
- Lỗi **tạm thời** (`STORAGE_DOWNLOAD_ERROR`, `STORAGE_UPLOAD_ERROR`, mất kết nối): worker **`nak()` có delay** (vài giây) để NATS giao lại, **không** gửi `FAILED`. Ở lượt xử lý cuối (`num_delivered` = `MAX_ATTEMPTS`) thì gửi `FAILED` với mã lỗi thật + ack.
- **Mọi job đều kết thúc bằng một event `FAILED` hoặc `COMPLETED` do worker gửi.** Backend chỉ nghe event, không tự đặt timeout. Để chắc chắn có người báo `FAILED` kể cả khi worker chết ở lượt cuối:
  - Worker (env `MAX_ATTEMPTS`, mặc định **3**) chỉ **xử lý** khi `msg.metadata.num_delivered` ≤ `MAX_ATTEMPTS`. Stream để `max_deliver` = **5**, luôn lớn hơn `MAX_ATTEMPTS`, nên còn dư lượt giao.
  - Nhận message có `num_delivered` > `MAX_ATTEMPTS` nghĩa là các lượt trước đều chết giữa chừng. Worker **không xử lý** (không tải file, không chạy model), gửi ngay `FAILED` với `WORKER_CRASHED` rồi ack. Việc này nhẹ nên gần như không thể chết, và vẫn còn một lượt dự phòng.
  - Job dài vẫn an toàn: heartbeat `in_progress()` giữ message, nên không giới hạn thời gian tổng ở Backend.
  - Worker bị **treo** (heartbeat vẫn chạy nhưng xử lý không tiến triển) sẽ giữ message mãi. Vì vậy mỗi pool có hạn xử lý một job (env `JOB_DEADLINE_SECONDS`, gợi ý ảnh 300, video 3600). Quá hạn thì worker ngừng heartbeat và **tự thoát** (pod restart). Lượt đó được tính như một lần chết, và rơi vào luật trên.
- Nhận SIGTERM (KEDA scale down) khi đang xử lý mà không kịp xong trong grace period: worker `nak()` job đang chạy để worker khác nhận ngay, không phải chờ hết `ack_wait`. Lượt này cũng tính vào `num_delivered`.

**Quy tắc:**
- **Backend và Worker không được tự tạo, sửa hay xoá stream/consumer/bucket** (không `add_stream`, không `ensureStream`/`ensureBuckets`, không tạo durable mới). Chỉ bind vào consumer có sẵn (ví dụ Python: `js.pull_subscribe(subject="jobs.image", durable="image-workers", stream="IMAGE_JOBS")` với consumer đã có). Nếu thiếu thì log lỗi và thoát.
- Muốn đổi stream/consumer/bucket thì báo Infra và cập nhật bảng trên trước khi code.

**Dev local** (chi tiết: `docs/phân-công-và-guideline.md` §1):
```bash
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yaml up -d      # tự chạy nats-setup + minio-setup
# chạy lại setup nếu cần (an toàn khi chạy nhiều lần):
docker compose -f infra/docker-compose.yaml run --rm nats-setup
docker compose -f infra/docker-compose.yaml run --rm minio-setup
```
Không dùng file compose riêng của từng team cho NATS/MinIO, vì chúng không có stream/consumer đúng cấu hình.

---

## 5. Đường dẫn object

- Job trong batch: input `uploads/<batchId>/<jobId>/input.<ext>`, kết quả `results/<batchId>/<jobId>/result.<ext>`.
- Job lẻ (không có batch): `uploads/<jobId>/input.<ext>`, `results/<jobId>/result.<ext>`.
- Ảnh mẫu whitelist: `uploads/<batchId>/whitelist/face-<n>.<ext>` (private, không bao giờ public).
- URL public của kết quả: `/results/<key trong bucket results>`. `batchId`/`jobId` là UUID v4, khó đoán, và đó là cơ chế bảo vệ link public duy nhất ở Phase 1.
- Ảnh gốc ở `uploads` là private. UI cần hiển thị ảnh gốc (thanh trượt before/after) thì Backend cung cấp qua API (stream hoặc presigned URL ngắn hạn).
- Thời gian giữ object: xem "Xoá dữ liệu" bên dưới.

**Xoá dữ liệu** (đề tài: "xoá dữ liệu sau khi xử lý theo hạn hoặc khi người dùng yêu cầu"):
- **Theo hạn:**
    - Phase 1 (chưa có tài khoản, không có chỗ tìm lại batch cũ): MinIO lifecycle xoá mọi object sau 24h. Backend xoá (hoặc đánh dấu `EXPIRED`) batch/job quá 24h trong PostgreSQL, để UI không trỏ tới object đã mất.
    - Từ Phase 2 (có thư viện media): ảnh gốc và kết quả **giữ tới khi người dùng xoá**. Infra bỏ lifecycle của cả hai bucket. Người quản trị instance có thể đặt env `RETENTION_DAYS` để Backend dọn batch cũ hơn N ngày (cả MinIO và PG); để trống = giữ mãi. Giữ ảnh gốc để người dùng sửa ảnh, thử lại ảnh lỗi, chạy lại batch với cấu hình khác mà không phải tải lên lại.
- **Khi người dùng yêu cầu:** Backend xoá prefix `uploads/<batchId>/` và `results/<batchId>/` trên MinIO, rồi xoá dòng PG. Phase 1 không có tài khoản, nên ai có link batch (UUID) thì được xoá.
- **Ảnh mẫu whitelist** là dữ liệu sinh trắc: Backend xoá `uploads/<batchId>/whitelist/` ngay khi mọi job trong batch đã kết thúc, không đợi 24h. Sau đó thử lại ảnh lỗi của batch có whitelist trả 410 (không được chạy lại mà thiếu whitelist, vì sẽ che cả người quen). Người dùng tạo batch mới. Ngoại lệ duy nhất (Phase 2, chưa chốt): danh sách khuôn mặt người dùng **chủ động** bấm lưu, giữ tới khi người dùng xoá danh sách.

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

### Infrastructure owns

- Streams, consumers, buckets and their settings (mục 4)
- MinIO lifecycle (TTL 24h on both buckets in Phase 1, removed in Phase 2, see §5) and the public `/results/` route
- KEDA ScaledObjects, worker Deployments, resource limits

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
   +--> POST /api/batches            (tải bộ ảnh + cấu hình + ảnh whitelist)
   +--> GET  /api/batches/:id        (trạng thái batch + các job)
   +--> GET  /api/batches/:id/report (báo cáo JSON)
   +--> DELETE /api/batches/:id      (xoá batch theo yêu cầu, mục 5)
   +--> (Phase 2) đăng ký/đăng nhập, thư viện media, DELETE /api/jobs/:id
   +--> GET  /api/jobs/:id
   +--> GET  /api/system/stats
```

The backend reads PostgreSQL and returns application state. Đường dẫn và format chi tiết của API do team Web quyết định (`web/docs/plan.md`). Danh sách trên chỉ là các khả năng cần có.

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

Infra tạo một `ScaledObject` cho mỗi worker Deployment (`nats-jetstream` trigger, endpoint `nats.imgproc.svc.cluster.local:8222`, account `$G`), theo dõi lag của đúng consumer ở mục 4:

| Deployment | Stream / consumer | min | max | lagThreshold | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `image-worker` | `IMAGE_JOBS` / `image-workers` | 0 | 3 | 5 | Nhiều job nhỏ, mỗi pod xử lý tuần tự |
| `video-worker` | `VIDEO_JOBS` / `video-workers` | 0 | 1 | 1 | Mỗi video một pod (Phase 2) |

Giá trị đang chạy thực tế nằm trong `infra/app/engine-workers/scaledobjects.yaml` và `infra/docs/endpoints.md`. Mọi giá trị phải đo trên phần cứng lab (2C/4T, 12GB).

A worker that consumes through any other durable is invisible to KEDA and is never scaled.

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

Infra tests scaling with the real engine workers via `infra/scaling-demo.sh`. KEDA activation can be checked without processing by publishing a single message to observe the pool scale from 0 to 1.

