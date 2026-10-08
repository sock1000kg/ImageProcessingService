# Engine Worker Service — Master Context & Guidelines

> **Tài liệu ngữ cảnh cốt lõi dành cho module Engine (Worker)**  
> Dùng làm tài liệu tham chiếu chính để bất kỳ AI Agent hay lập trình viên nào khi bắt đầu phiên làm việc mới cũng nắm bắt được 100% ngữ cảnh kỹ thuật.

---

## 1. Bối cảnh dự án & Vai trò của Engine

* **Dự án:** Cloud-Native Elastic Image Processing Service (Đồ án môn *Vấn đề hiện đại trong CNTT* - UET, kéo dài 10 tuần).
* **Phân công trách nhiệm:**
  * **Huy Đức (Engine):** Chịu trách nhiệm toàn quyền phát triển thư mục `engine/` bao gồm: worker tiêu thụ job từ hàng đợi, tải model AI, xử lý ảnh/video, tương tác với MinIO và báo cáo tiến trình về NATS JetStream.
  * **Anh Đức Huy (Web):** Phụ trách `web/` (Frontend & Backend REST API, lưu trạng thái PostgreSQL).
  * **Đạt (Infra):** Phụ trách `infra/` (Kubernetes, KEDA autoscaling, NATS, MinIO, PostgreSQL deployments).
* **Quy tắc làm việc:** Độc lập module. Không tự ý sửa đổi Hợp đồng tích hợp chung ([integration-contracts.md](../../docs/integration-contracts.md)) làm gãy kết nối với Web và Infra.

---

## 2. Ràng buộc phần cứng & Nguyên tắc chi phí 0đ

1. **Phần cứng thử nghiệm:**
   * Hệ thống chạy trên 1 Kubernetes Node bị giới hạn: **4 Cores CPU / 12GB RAM**.
   * **Không có GPU rời** (suy luận AI 100% bằng CPU).
   * Node này phải chia sẻ RAM/CPU cho cả PostgreSQL, MinIO, NATS, Web API và KEDA.
   * Khi KEDA scale worker lên 2–3 Pods, mỗi Pod worker chỉ được phép tiêu thụ khoảng **500MB – 1.5GB RAM** để tránh kích hoạt cơ chế `OOMKilled` (Out Of Memory) của Kubernetes.
2. **Chi phí:** **0 ĐỒNG (Hoàn toàn miễn phí)**.
   * Không dùng các dịch vụ API trả phí (OpenAI API, Replicate, AWS Rekognition,...).
   * Sử dụng 100% thư viện và mô hình mã nguồn mở (Open-Source: MIT/Apache 2.0). Model weights tự tải về một lần và đóng gói/cache trong Docker image để chạy offline.

---

## 3. Danh mục các Engine / Loại Job lựa chọn

Để đảm bảo vừa ấn tượng khi demo, vừa hoàn thành đúng hạn 10 tuần mà không làm sập server, các job được chia làm 2 giai đoạn:

### Pha 1: Trọng tâm MVP (Hoàn thành trong 2–3 tuần đầu)
1. **`object-detection` (AI Job cốt lõi):**
   * Mô hình: **YOLOv8n (Nano)** của `ultralytics`.
   * Dung lượng model: ~6 MB.
   * Tài nguyên: ~300MB RAM, CPU chạy mất ~150–250ms/ảnh.
   * Đầu ra: Vẽ bounding box + nhãn vào ảnh kết quả; trả về metadata danh sách vật thể và độ tin cậy.
2. **`image-convert` (Non-AI Job cơ bản):**
   * Thư viện: `Pillow` (PIL).
   * Tác vụ: Chuyển đổi định dạng (PNG $\leftrightarrow$ JPG $\leftrightarrow$ WEBP), thay đổi kích thước (Resize), nén ảnh.
   * Tài nguyên: < 50MB RAM, xử lý vài mili-giây. Giúp đảm bảo có job thường chạy ổn định 100% cho MVP.

### Pha 2: Mở rộng tính năng (Tuần 5–8)
3. **`background-removal` (Tách nền ảnh):**
   * Thư viện: `rembg` (dùng model nhẹ `u2netp`).
   * Đầu ra: File ảnh PNG nền trong suốt (transparent). Rất trực quan khi demo giao diện.
4. **`image-sharpening` (Làm nét & nâng chất lượng ảnh):**
   * Thư viện: `cv2.dnn_superres` (OpenCV với model FSRCNN/ESPCN) hoặc thuật toán Unsharp Masking / CLAHE. Tránh dùng Real-ESRGAN lớn vì quá nặng CPU.
5. **`text-recognition` (Trích xuất văn bản / OCR):**
   * Thư viện: `easyocr` hoặc `pytesseract`.
   * Đầu ra: Trích xuất toàn bộ chữ trong ảnh kèm độ tin cậy và tọa độ; vẽ bounding box quanh các khối chữ lên ảnh kết quả. Rất thực tế cho biển báo, hóa đơn, tài liệu.
6. **`video-transcribe` (Tùy chọn phụ - Tạo phụ đề video ngắn):**
   * Thư viện: `openai-whisper` (bản mã nguồn mở `whisper-tiny` ~75MB). Chỉ áp dụng cho clip ngắn dưới 20s nếu server còn tải được CPU.

> 📖 *Chi tiết input, output, tham số params và mã lỗi của từng job xem tại [jobs-spec.md](jobs-spec.md).*

---

## 4. Kiến trúc Worker & Quy trình xử lý

### Triết lý: Long-Running Worker
Không sử dụng mô hình Pod-per-job (tạo Pod mới cho mỗi ảnh) vì chi phí khởi động Python và nạp model AI vào RAM sẽ gây nghẽn CPU và giật lag hệ thống.
* Worker Pod chạy dưới dạng **Kubernetes Deployment**.
* **Nạp mô hình AI vào RAM đúng 1 lần duy nhất khi container khởi động.**
* Sử dụng vòng lặp (hoặc NATS push/pull consumer) để liên tục nhận và xử lý nhiều job kế tiếp nhau.

### Vòng đời xử lý 1 Job (End-to-End Worker Lifecycle)
```text
1. Worker nhận thông điệp từ NATS JetStream (subject: jobs.ai hoặc jobs.image)
      │
      ▼
2. Gửi ngay event PROCESSING về NATS (subject: jobs.events)
      │
      ▼
3. Tải tệp nguồn từ MinIO (input.bucket, input.key)
      │
      ▼
4. Thực thi xử lý (Inference YOLO / Pillow / Rembg...)
      │
      ├─► [Nếu Thất bại] ──► Gửi event FAILED về NATS ──► NACK hoặc Retry
      │
      ▼ [Nếu Thành công]
5. Tải tệp kết quả lên MinIO (output.bucket, output.key)
      │
      ▼
6. Gửi event COMPLETED về NATS (kèm result metadata)
      │
      ▼
7. GỬI TÍN HIỆU ACK cho NATS JetStream để hoàn tất việc nhận message an toàn
```

> **Nguyên tắc an toàn (Acknowledgement Safety):**  
> Chỉ gửi `ACK` cho NATS JetStream **sau khi** kết quả đã được upload thành công lên MinIO và event `COMPLETED` đã được phát. Nếu worker bị tắt đột ngột giữa chừng, NATS sẽ giao lại job cho pod khác.

---

## 5. Hợp đồng tích hợp (Integration Contracts) cho Engine

Worker **không** kết nối trực tiếp vào PostgreSQL. Mọi giao tiếp với thế giới bên ngoài chỉ qua **NATS JetStream** và **MinIO**.

### Lệnh nhận việc (Backend $\rightarrow$ Worker)
* **Subject:** `jobs.ai` (cho AI job) hoặc `jobs.image` (cho image/video job thông thường).
* **Stream:** `AI_JOBS` / `IMAGE_JOBS`.
* **Consumer Durable Name:** `ai-workers` / `image-workers`.
* **Format:**
```json
{
  "jobId": "uuid-1234-5678",
  "type": "object-detection",
  "input": {
    "bucket": "uploads",
    "key": "uuid-1234-5678/input.jpg"
  },
  "output": {
    "bucket": "results",
    "key": "uuid-1234-5678/result.jpg"
  },
  "params": {
    "confidenceThreshold": 0.45
  }
}
```

### Sự kiện gửi về (Worker $\rightarrow$ Backend)
* **Subject:** `jobs.events`
* **Trạng thái hợp lệ từ Worker:** `PROCESSING`, `COMPLETED`, `FAILED`.
* **Mẫu Completed Event:**
```json
{
  "jobId": "uuid-1234-5678",
  "status": "COMPLETED",
  "progress": 100,
  "stage": "DONE",
  "result": {
    "bucket": "results",
    "key": "uuid-1234-5678/result.jpg"
  },
  "resultSummary": {
    "objectsDetected": 3,
    "labels": ["person", "dog", "car"],
    "processingTimeMs": 210
  },
  "timestamp": "2026-09-21T07:00:00Z"
}
```

---

## 6. Cấu trúc thư mục dự kiến của `engine/`

```text
engine/
├── docs/                        # Tài liệu hướng dẫn & ngữ cảnh cho Engine
│   ├── README.md                # File master này
│   ├── jobs-spec.md             # Đặc tả chi tiết từng loại job
│   └── local-dev.md             # Hướng dẫn test cục bộ bằng Docker Compose
├── src/
│   ├── __init__.py
│   ├── config.py                # Đọc biến môi trường (NATS_URL, MINIO_ENDPOINT,...)
│   ├── storage.py               # MinIO client (download_file, upload_file)
│   ├── messaging.py             # NATS JetStream client (listen jobs, emit events, ACK)
│   ├── processors/              # Các engine xử lý nghiệp vụ
│   │   ├── __init__.py
│   │   ├── base.py              # BaseProcessor interface
│   │   ├── yolo_detector.py     # YOLOv8 Object Detection
│   │   ├── image_converter.py   # Pillow format convert & resize
│   │   ├── background_remover.py# Rembg background removal
│   │   └── super_resolution.py  # OpenCV image sharpening
│   └── main.py                  # Entrypoint khởi động worker pod
├── models/                      # Chứa weights đã tải sẵn (yolov8n.pt, u2netp.onnx)
├── Dockerfile                   # Build worker container image
└── requirements.txt             # Thư viện: ultralytics, nats-py, minio, pillow, opencv-python-headless
```

---

## 7. Tài liệu bổ trợ liên kết

1. [jobs-spec.md](jobs-spec.md): Đặc tả chi tiết thông số, thư viện và output JSON cho từng loại tác vụ.
2. [local-dev.md](local-dev.md): Hướng dẫn thiết lập môi trường Docker Compose để lập trình và kiểm thử độc lập mà không cần Web hay Kubernetes.
3. [docs/architecture.md](../../docs/architecture.md): Toàn văn tài liệu thiết kế hệ thống tổng thể.
4. [docs/integration-contracts.md](../../docs/integration-contracts.md): Quy ước tích hợp liên module giữa Web, Engine và Infra.
