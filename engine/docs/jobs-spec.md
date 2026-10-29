# Job Specifications & Processing Engines
## Cloud-Native Privacy Service

> **Đặc tả chi tiết các tác vụ xử lý (Jobs) của Engine**  
> Định nghĩa chi tiết cấu trúc dữ liệu đầu vào (`input`), đầu ra (`output`), tham số cấu hình (`params`), định dạng kết quả (`resultSummary`) và danh mục mã lỗi chuẩn hóa cho dịch vụ ẩn danh hóa.

---

## 1. Bảng tổng hợp các loại Job

| Job `type` | Subject NATS | Consumer NATS | Thư viện / Model | Giai đoạn | Thời gian xử lý (CPU) | Mục đích |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **`image-redact`** | `jobs.image` | `image-workers` | `ultralytics` (`yolov8n-oiv7.pt`), OpenCV, Pillow | **Phase 1 (MVP)** | 200ms – 450ms / ảnh 1080p | Phát hiện và che khuôn mặt, biển số trên ảnh tĩnh; hỗ trợ Whitelist người quen. |
| **`video-redact`** | `jobs.video` | `video-workers` | `ultralytics` + ByteTrack, OpenCV, FFmpeg | **Phase 2** | 15s – 40s / video 30s | Ẩn danh hóa video MP4, chống nhấp nháy, giữ nguyên 100% âm thanh gốc. |

---

## 2. Đặc tả chi tiết: `image-redact` (Ẩn danh hóa hình ảnh)

Tác vụ nhận một file ảnh từ MinIO, sử dụng YOLOv8 để nhận diện khuôn mặt và biển số xe, áp dụng Whitelist (nếu có), thực hiện che mờ/che đen theo cấu hình, xóa thông tin vị trí EXIF và lưu ảnh kết quả vào MinIO.

* **NATS Subject:** `jobs.image`
* **NATS Stream:** `IMAGE_JOBS` (Consumer: `image-workers`)
* **Định dạng hỗ trợ:** JPG, JPEG, PNG, WEBP.
* **Mô hình AI sử dụng:**
  * *Phase 1:* `yolov8n-oiv7.pt` (sử dụng 2 lớp: `Human face` $\rightarrow$ `face`, `Vehicle registration plate` $\rightarrow$ `plate`).
  * *Phase 2 / Sau fine-tune:* `yolov8n-privacy.pt` (model 2 lớp chuyên biệt cho bối cảnh Việt Nam).

### 2.1. Cấu hình tham số (`params`)

| Tham số | Kiểu dữ liệu | Mặc định | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| **`redaction.targets`** | `list[str]` | `["face", "plate"]` | Danh sách đối tượng cần che (`face`, `plate` hoặc cả hai). |
| **`redaction.style`** | `str` | `"blur"` | Phong cách che: `"blur"` (Gaussian), `"pixelate"` (Mosaic), hoặc `"blackout"` (Tô đen). |
| **`redaction.strength`** | `int` | `25` (blur), `12` (pixelate) | Bán kính làm mờ hoặc kích thước khối pixel. Bỏ qua nếu chọn `blackout`. |
| **`redaction.padding`** | `float` (0.0 – 0.5) | `0.1` | Tỷ lệ nới rộng khung bao (`box`) để đảm bảo che kín viền mặt/biển số (cắt trong biên ảnh). |
| **`confidenceThreshold`** | `float` (0.0 – 1.0) | `0.35` | Ngưỡng tin cậy tối thiểu; đối tượng dưới ngưỡng này sẽ bị bỏ qua. |
| **`reviewThreshold`** | `float` (0.0 – 1.0) | `0.50` | Ngưỡng đánh giá rủi ro; phát hiện có confidence < `reviewThreshold` vẫn được che nhưng đánh dấu `lowConfidence: true`. |
| **`whitelist.faces`** | `list[object]` | `[]` *(tuỳ chọn)* | Danh sách các ảnh chân dung mẫu `{bucket, key}` của chủ thể/người quen cần giữ lại. |
| **`whitelist.similarityThreshold`**| `float` (0.0 – 1.0) | `0.60` | Ngưỡng tương đồng Cosine tối thiểu để xem là cùng 1 người. Ưu tiên tránh nhận nhầm người lạ (phân vân thì che). |

### 2.2. Mẫu Job Command nhận từ NATS (`jobs.image`)
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
      "style": "pixelate",
      "strength": 12,
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

### 2.3. Mẫu `resultSummary` trả về trong sự kiện `COMPLETED`
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
      },
      {
        "label": "face",
        "confidence": 0.41,
        "box": [600, 90, 640, 140],
        "redacted": true,
        "whitelisted": false,
        "lowConfidence": true
      },
      {
        "label": "plate",
        "confidence": 0.81,
        "box": [220, 300, 310, 340],
        "redacted": true,
        "whitelisted": false,
        "lowConfidence": false
      }
    ],
    "redaction": {
      "style": "pixelate",
      "strength": 12,
      "padding": 0.1
    },
    "model": "yolov8n-oiv7",
    "processingTimeMs": 420
  },
  "timestamp": "2026-10-24T07:00:02Z"
}
```
* **Lưu ý quan trọng về `box`:** Tọa độ `box = [x1, y1, x2, y2]` phải là tọa độ gốc của ảnh **trước khi nới padding**, để UI frontend hiển thị đúng khung nhận diện.

---

## 3. Đặc tả: `video-redact` (Ẩn danh hóa Video — Phase 2)

* **NATS Subject:** `jobs.video`
* **NATS Stream:** `VIDEO_JOBS` (Consumer: `video-workers`)
* **Định dạng:** MP4 (chuẩn H.264). Thời lượng hỗ trợ: 15s – 60s.
* **Nguyên tắc kỹ thuật:**
  * Giải mã và đọc từng frame qua OpenCV/FFmpeg.
  * Tích hợp **ByteTrack** để gán `track_id` cho từng đối tượng qua các frame, loại bỏ hiện tượng nhấp nháy (flickering).
  * So khớp Whitelist theo từng chuỗi track (chỉ cần so khớp 1 lần trên khuôn mặt rõ nhất của track đó).
  * Mã hóa lại video và dùng **FFmpeg copy nguyên luồng âm thanh gốc** (`-c:a copy`), không làm mất tiếng của video.
  * Worker định kỳ phát tín hiệu `in_progress()` (heartbeat) về NATS với `ack_wait` là 5 phút.

---

## 4. Chi tiết triển khai 3 phong cách che (Redaction Styles)

Mọi thao tác che được thực hiện trên ma trận ảnh NumPy / OpenCV:

1. **Gaussian Blur (`style: "blur"`):**
   * Bán kính làm mờ = `strength` (nếu là số chẵn thì cộng thêm 1 để đảm bảo số lẻ cho kernel size).
   * Thực hiện: `cv2.GaussianBlur(roi, (ksize, ksize), 0)`.
2. **Pixelate / Mosaic (`style: "pixelate"`):**
   * Kích thước khối = `strength` (ví dụ `12px`).
   * Thực hiện: Thu nhỏ vùng ROI về kích thước `(max(1, w // strength), max(1, h // strength))` bằng `cv2.INTER_LINEAR`, sau đó phóng to trở lại kích thước `(w, h)` bằng `cv2.INTER_NEAREST`.
3. **Blackout Box (`style: "blackout"`):**
   * Tô màu đen tuyệt đối: `roi[:] = (0, 0, 0)` hoặc `cv2.rectangle(...)`.

---

## 5. Quy chuẩn Mã Lỗi Chuẩn Hóa (Standardized Error Codes)

Khi xử lý gặp sự cố, Worker bắt buộc phải bắt ngoại lệ (`try...except`) và phát ra event `status: "FAILED"` kèm mã lỗi chuẩn:

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

| Mã lỗi (`error.code`) | Tình huống phát sinh |
| :--- | :--- |
| **`STORAGE_DOWNLOAD_ERROR`** | Không tải được tệp từ MinIO bucket `uploads` (sai key, mất kết nối MinIO). |
| **`INVALID_INPUT_FILE`** | Tệp tải về bị hỏng, rỗng 0 bytes, hoặc không đọc được dạng ảnh/video (Pillow/OpenCV raise exception). |
| **`UNSUPPORTED_JOB_TYPE`** | Loại job nhận được không được hỗ trợ bởi pool này (ví dụ nhận nhầm job cũ). |
| **`WHITELIST_REFERENCE_ERROR`** | Ảnh mẫu trong `whitelist.faces` bị lỗi hoặc không tìm thấy khuôn mặt nào để trích xuất embedding. |
| **`MODEL_INFERENCE_ERROR`** | Lỗi nội bộ khi chạy suy luận YOLOv8 hoặc khi xử lý thuật toán che. |
| **`STORAGE_UPLOAD_ERROR`** | Xử lý xong nhưng không tải được tệp kết quả lên MinIO bucket `results`. |
