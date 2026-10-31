# Engine Worker Service — Master Context & Guidelines
## Cloud-Native Privacy Service

> **Tài liệu ngữ cảnh cốt lõi dành cho phân hệ Engine (Worker)**  
> Dùng làm tài liệu tham chiếu chính để bất kỳ AI Agent hay lập trình viên nào khi bắt đầu phiên làm việc mới cũng nắm bắt được 100% ngữ cảnh kỹ thuật, kiến trúc và tiến độ hiện tại.

---

## 1. Bối cảnh dự án & Vai trò của Engine

* **Dự án:** **Cloud-Native Privacy Service** (Đồ án môn *Vấn đề hiện đại trong CNTT* - Đại học Công nghệ, ĐHQGHN).
* **Bài toán nghiệp vụ:** Hệ thống dịch vụ đám mây tự động phát hiện và làm mờ/che giấu **khuôn mặt người** (`face`) và **biển số phương tiện** (`plate`) trong hình ảnh và video nhằm bảo vệ quyền riêng tư số:
  * **Căn cứ pháp lý:** Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, Nghị định 356/2025/NĐ-CP (hiệu lực 01/01/2026 tại Việt Nam) và quy định quốc tế GDPR.
  * **Đối tượng phục vụ:** Vloggers/Content Creators (che mặt người qua đường), phóng viên/báo chí, tài xế/doanh nghiệp có camera hành trình (dashcam), và các đơn vị cần làm sạch dữ liệu media trước khi công khai.
* **Phân công trách nhiệm:**
  * **Huy Đức (Engine):** Chịu trách nhiệm toàn quyền phát triển thư mục `engine/` bao gồm: worker tiêu thụ job từ hàng đợi NATS JetStream, quản lý model AI (YOLOv8, Face Embedding), xử lý ảnh/video (OpenCV, FFmpeg), tương tác MinIO I/O và báo cáo sự kiện về `jobs.events`.
  * **Anh Đức Huy (Web):** Phụ trách `web/` (Giao diện người dùng, Backend REST API, lưu trạng thái PostgreSQL, điều phối batch).
  * **Phạm Tất Đạt (Infra):** Phụ trách `infra/` (Kubernetes, KEDA autoscaling, NATS JetStream, MinIO S3, PostgreSQL, CI/CD).
* **Nguồn sự thật chung (Single Source of Truth):**
  * Hợp đồng tích hợp toàn hệ thống: `docs/integration-contracts.md`
  * Bản mô tả đề tài & bối cảnh chi tiết: `engine/Cloud-Native Privacy Service.pdf`
  * Tiến độ và kế hoạch của Engine: `engine/docs/plan.md`

---

## 2. Ràng buộc phần cứng & Nguyên tắc chi phí 0đ

1. **Môi trường thực thi CPU (Constrained Node):**
   * Hệ thống chạy trên 1 Kubernetes Node bị giới hạn: **4 Cores CPU / 12GB RAM**.
   * **Không có GPU rời** (mọi suy luận AI chạy 100% bằng CPU).
   * Node chia sẻ tài nguyên cho PostgreSQL, MinIO, NATS, Web API và KEDA.
   * Khi KEDA scale worker lên 2–4 Pods, mỗi Pod worker chỉ được phép tiêu thụ khoảng **350MB – 600MB RAM** để tránh kích hoạt cơ chế `OOMKilled` (Out Of Memory) của Kubernetes.
2. **Nguyên tắc chi phí:** **0 ĐỒNG (Hoàn toàn mã nguồn mở)**.
   * Không dùng các API dịch vụ trả phí bên thứ ba (AWS Rekognition, Google Vision, OpenAI...).
   * Sử dụng 100% thư viện và mô hình mã nguồn mở (YOLOv8, InsightFace/ArcFace, OpenCV, FFmpeg). Model weights được đóng gói (bake) sẵn vào Docker image để chạy offline, không tải lúc pod khởi động.

---

## 3. Kiến trúc Luồng Dữ liệu & Quy chuẩn Hàng đợi (NATS + MinIO)

Hệ thống hoạt động theo mô hình **hướng sự kiện (Event-Driven)**:

```text
[ Web Backend ] ──(Upload file gốc)──► [ MinIO Storage: bucket uploads ]
       │
       ▼ (Bắn Job Command JSON)
[ NATS JetStream ]
   ├── Stream: IMAGE_JOBS  (Subject: jobs.image)  ──► Durable Consumer: image-workers (Phase 1)
   ├── Stream: VIDEO_JOBS  (Subject: jobs.video)  ──► Durable Consumer: video-workers (Phase 2)
   │
   ▼ (Kéo message xử lý)
[ Engine Worker Pod ]
   ├── 1. Gửi event PROCESSING về jobs.events (kèm progress, stage)
   ├── 2. Tải file từ MinIO (input.bucket, input.key)
   ├── 3. Chạy suy luận YOLOv8 (phát hiện face, plate)
   ├── 4. So khớp Whitelist (nếu có ảnh selfie mẫu)
   ├── 5. Áp dụng che (Blur / Pixelate / Blackout) + nới padding
   ├── 6. Upload file kết quả lên MinIO (output.bucket, output.key)
   ├── 7. Gửi event COMPLETED về jobs.events (kèm resultSummary, detections)
   └── 8. Gửi tín hiệu ACK an toàn cho NATS JetStream
```

> **Quy tắc an toàn (Acknowledgement & Idempotency):**
> * Worker chỉ gửi `ACK` cho NATS JetStream **sau khi** kết quả đã upload an toàn lên MinIO và event `COMPLETED` đã được phát.
> * Các job xử lý lâu phải gọi định kỳ `await msg.in_progress()` (heartbeat) để NATS không giao lại việc cho pod khác trước thời hạn `ack_wait`.
> * Backend và Worker **không bao giờ tự tạo/sửa stream, consumer hoặc bucket**. Mọi tài nguyên được hạ tầng khởi tạo sẵn thông qua `infra/app/nats/setup-streams.sh` và `infra/app/minio/setup-buckets.sh`.

---

## 4. Các Loại Job Đảm Nhiệm (Job Specifications)

Hệ thống tập trung vào 2 tác vụ chính, bám sát `docs/integration-contracts.md`:

### 4.1. `image-redact` (Trọng tâm Phase 1 — Subject `jobs.image`)
* **Mục tiêu:** Ẩn danh hóa ảnh tĩnh (JPG, PNG, WEBP), xử lý nhanh (< 400ms trên CPU).
* **Model Phase 1:** `yolov8n-oiv7.pt` (600 lớp của Open Images v7, ánh xạ 2 nhãn: `Human face` $\rightarrow$ `face`, `Vehicle registration plate` $\rightarrow$ `plate`).
* **Model Phase 2 / Tương lai:** `yolov8n-privacy.pt` (fine-tune chuyên biệt 2 nhãn `face`, `plate` cho bối cảnh Việt Nam).
* **Các phong cách che (`params.redaction.style`):**
  * `blur`: Gaussian blur theo bán kính `strength`.
  * `pixelate`: Mosaic thu nhỏ rồi phóng to theo kích thước ô `strength`.
  * `blackout`: Băng đen tuyệt đối.
* **Tính năng Whitelist (`params.whitelist.faces`):** So khớp vector đặc trưng khuôn mặt (Face Embeddings + Cosine Similarity). Khuôn mặt mẫu trong whitelist được giữ nguyên, chỉ che người lạ.
* **Xử lý metadata:** Xóa sạch EXIF / GPS khỏi ảnh đầu ra để đảm bảo quyền riêng tư.

### 4.2. `video-redact` (Trọng tâm Phase 2 — Subject `jobs.video`)
* **Mục tiêu:** Ẩn danh hóa video MP4 (H.264), độ dài 15s – 60s.
* **Điểm nhấn kỹ thuật:**
  * Tích hợp **ByteTrack** cùng YOLO: Giữ ID đối tượng qua các khung hình, loại bỏ hiện tượng nhấp nháy (flickering).
  * So khớp Whitelist theo **Track ID** (chỉ cần so khớp 1 lần cho mỗi chuỗi track).
  * Dùng **FFmpeg** để sao chép luồng âm thanh gốc (copy audio stream), đảm bảo video xuất xưởng giữ nguyên 100% tiếng.

---

## 5. Hiện trạng Codebase & Lộ trình thực hiện (Roadmap)

### 5.1. Hiện trạng (Tính đến 24/10)
* Bộ khung worker Python đã ổn định: kết nối NATS JetStream đúng consumer có sẵn, heartbeat `in_progress()`, tắt êm (graceful shutdown) khi nhận `SIGTERM`, chạy non-root trong container, lazy-load model YOLOv8n-OIV7.
* **Nhiệm vụ trước mắt:** Chuyển đổi processor từ `object-detection`/`image-convert` cũ sang **`image-redact`** chuẩn mới.

### 5.2. Các mốc thực hiện (Xem chi tiết tại [plan.md](plan.md))
1. **Milestone 1 (24/10 → 01/11): `image-redact` không whitelist**
   * Triển khai processor `image-redact` dùng `yolov8n-oiv7` lọc 2 lớp `face` và `plate`.
   * Triển khai 3 style: `blur`, `pixelate`, `blackout` kèm `padding`.
   * Trả về `resultSummary` chuẩn contract §3B (bao gồm danh sách detections, counts, model, processingTimeMs).
   * Viết unit test & mock test.
2. **Milestone 2 (01/11 → 08/11): Whitelist khuôn mặt**
   * Tích hợp model trích xuất Face Embedding nhẹ cho CPU (InsightFace / ArcFace ONNX).
   * Tính Cosine Similarity, so khớp với danh sách ảnh mẫu `whitelist.faces`, cache vector đặc trưng.
3. **Milestone 3 (08/11 → 15/11): Đo tài nguyên & Chạy trên Lab**
   * Đo đạc RAM/CPU của worker khi load cả YOLO + Embedding model.
   * Cập nhật `Dockerfile` bake sẵn trọng số model.
   * Phối hợp với Infra chạy test co giãn KEDA (`scaling-demo.sh`).
4. **Song song (Mục tiêu A): Model Fine-tuning**
   * Gộp dataset WIDER FACE + Vietnamese License Plate Dataset.
   * Fine-tune YOLOv8n đạt mục tiêu mAP@50 $\ge$ 85% và Recall cao.
5. **Phase 2 (16/11 → 29/11): Video Redaction & Tối ưu hóa**
   * `video-redact` với ByteTrack và FFmpeg audio passthrough.
   * Tối ưu hóa suy luận CPU với ONNX Runtime và OpenVINO INT8.

---

## 6. Hướng dẫn tham khảo nhanh

* **Kế hoạch chi tiết của Engine:** [`engine/docs/plan.md`](plan.md)
* **Đặc tả chi tiết Job commands & Kết quả:** [`engine/docs/jobs-spec.md`](jobs-spec.md)
* **Quy ước bắt tay Backend — Engine:** [`engine/docs/backend-handshake.md`](backend-handshake.md)
* **Hướng dẫn chạy & test trên máy local:** [`engine/docs/local-dev.md`](local-dev.md)
