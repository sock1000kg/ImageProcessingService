# Khung Mẫu Báo Cáo Kỹ Thuật Chuẩn UET (Technical Report Template)
## Đề tài: Cloud-Native Privacy Service
### Môn học: Vấn đề hiện đại trong Công nghệ Thông tin — ĐH Công nghệ, ĐHQGHN

Tài liệu này cung cấp khung cấu trúc chuẩn mực cùng văn phong mẫu cho bài báo cáo và slide thuyết trình giữa kỳ / cuối kỳ.

---

## CẤU TRÚC BÁO CÁO CHUẨN (7 PHẦN)

### 1. Đặt vấn đề & Bối cảnh kỹ thuật (Problem Statement)
* **Khung pháp lý & Nhu cầu thực tế:**
  * Việc chia sẻ dữ liệu hình ảnh/video công cộng (vlog, camera hành trình) đặt ra nghĩa vụ tuân thủ các quy định bảo vệ dữ liệu cá nhân (Nghị định 356/2025/NĐ-CP của Việt Nam và GDPR của EU).
  * Khuôn mặt và biển số xe là thông tin nhận dạng cá nhân (PII - Personally Identifiable Information) bắt buộc phải được che giấu trước khi công khai hoặc chuyển giao cho bên thứ ba.
* **Khoảng trống của các giải pháp hiện tại (Gap Analysis):**
  * *Chỉnh sửa thủ công (Manual Editing):* Tốn 30–60 phút/phút video, không đáp ứng được khối lượng lớn.
  * *Dịch vụ AI Cloud thương mại (AWS Rekognition / Google Vision):* Chi phí cao ($0.10 - $0.12/phút video), dữ liệu nhạy cảm bị chuyển ra máy chủ nước ngoài.
  * *Công cụ mã nguồn mở chạy local (deface):* Đòi hỏi cấu hình máy cao (GPU), cài đặt phức tạp, render chiếm 100% tài nguyên máy cá nhân và không có khả năng xử lý mẻ (batch processing).

### 2. Định vị Giải pháp: "Tại sao phải là Cloud-Native?" (The "Why Cloud-Native?")
* **Bản chất của tải công việc (Workload Characteristics):**
  * Tác vụ xử lý media phát sinh theo đợt dồn dập (**Bursty Traffic**) — ví dụ một lô 500 ảnh sự kiện hoặc hàng chục video camera hành trình đổ về cùng lúc.
* **Kiến trúc hướng sự kiện (Event-Driven Architecture):**
  * Phân tách hoàn toàn tầng tiếp nhận (Web API) và tầng xử lý (AI Engine Worker) qua hàng đợi phân tán **NATS JetStream**.
  * Chống sốc tải (Backpressure protection), bảo đảm tính toàn vẹn thông điệp và hỗ trợ cơ chế xác nhận xử lý an toàn (At-least-once with Explicit ACK).
* **Tự động co giãn theo tải (Serverless/Elastic Autoscaling với KEDA):**
  * Khi hàng đợi tăng, KEDA tự động scale-out số lượng Worker Pods từ 0 lên $N$ pods để xử lý song song.
  * Khi hàng đợi rỗng, KEDA tự động scale-in về 0 pod, giải phóng hoàn toàn tài nguyên CPU/RAM trên hạ tầng máy chủ hạn chế (4 Cores / 12GB RAM).

### 3. Mô hình AI & Chiến lược Bản địa hóa (Computer Vision & Localization)
* **Lựa chọn mô hình:**
  * Sử dụng kiến trúc gọn nhẹ **YOLOv8n** (3.2M tham số, ~6.9MB), tối ưu hóa cho suy luận thuần CPU.
  * Tích hợp bảng ánh xạ nhãn chuyên biệt: `Human face` $\rightarrow$ `face`, `Vehicle registration plate` $\rightarrow$ `plate`.
* **Bản địa hóa dữ liệu giao thông Việt Nam:**
  * Huấn luyện bổ sung (Fine-tuning) trên tập dữ liệu biển số xe Việt Nam (biển vuông 2 dòng của xe máy, biển vàng thương mại, biển góc nghiêng/ngược sáng).
* **Tính năng Whitelist thông minh (Smart Whitelisting):**
  * Sử dụng Face Embedding (vector 512 chiều) và Cosine Similarity ($\ge 0.60$) để nhận diện chủ thể/người quen, giữ nguyên độ nét cho người được phép và tự động che người lạ xung quanh.
* **Xử lý Video chống nhấp nháy (Phase 2):**
  * Tích hợp thuật toán theo dõi đối tượng **ByteTrack** để duy trì ID xuyên suốt các frame.
  * Sử dụng **FFmpeg Audio Passthrough** để bảo toàn nguyên vẹn 100% âm thanh gốc của video.

### 4. Thiết kế An toàn Dữ liệu & Quyền riêng tư (Privacy by Design)
Hệ thống giải quyết triệt để rủi ro rò rỉ dữ liệu khi lưu trữ trên Cloud qua 4 lớp bảo vệ:
1. **Chính sách tự hủy dữ liệu (MinIO Lifecycle TTL):** Tự động xóa vĩnh viễn dữ liệu gốc và kết quả sau **24 giờ**.
2. **Cô lập truy cập (Zero-Trust Object Storage):** Bucket `uploads` được thiết lập Private 100%, chỉ worker nội bộ có khóa truy cập. Bucket `results` chỉ truy cập qua UUID v4 ngẫu nhiên.
3. **Bóc tách siêu dữ liệu (Metadata Sanitization):** Xóa sạch 100% thông tin EXIF, tọa độ GPS khỏi file trước khi trả về.
4. **Khả năng triển khai tại chỗ (On-Premise Ready):** Đóng gói Docker/Kubernetes cho phép cơ quan, trường học tự host trong mạng LAN nội bộ, dữ liệu không rời khỏi tổ chức.

### 5. Đặc tả Hệ thống & Hợp đồng Tích hợp (Integration Contracts)
* **Quy chuẩn thông điệp (Job Specifications):**
  * Tác vụ `image-redact`: Nhận job command từ subject `jobs.image`, xử lý 3 style che (`blur`, `pixelate`, `blackout`) có nới `padding`.
  * Trả về sự kiện tiến trình qua `jobs.events`: `PROCESSING` $\rightarrow$ `COMPLETED` (kèm `resultSummary`) hoặc `FAILED` (kèm mã lỗi chuẩn: `INVALID_INPUT_FILE`, `STORAGE_DOWNLOAD_ERROR`, `MODEL_INFERENCE_ERROR`).
* **Tính bình đẳng & Độc lập module (Decoupling):**
  * Worker không kết nối trực tiếp đến Database của Web; giao tiếp 100% qua NATS Event và MinIO S3 Object Storage.

### 6. Kết quả Thực nghiệm & Đo lường (Experimental Benchmarks)
* **Độ chính xác AI:**
  * Mục tiêu $\text{mAP@50} \ge 85\%$.
  * **Chỉ số Recall:** Đạt mục tiêu $\ge 92\%$, ưu tiên không bỏ sót đối tượng nhạy cảm.
* **Hiệu năng hệ thống trên CPU:**
  * Thời gian xử lý: **~130ms / ảnh 1080p** (đáp ứng mục tiêu khắt khe $< 400\text{ms}$).
  * Chiếm dụng bộ nhớ: **~350MB – 480MB RAM / Pod** (đảm bảo scale 4 Pods an toàn không bị `OOMKilled`).
* **Đối chuẩn với Baseline mã nguồn mở (`deface`):**
  * So sánh tốc độ xử lý trên cùng tập 50 ảnh và 3 video thử nghiệm.
  * Khẳng định tính vượt trội về khả năng xử lý mẻ (batch throughput) và hỗ trợ biển số Việt Nam.

### 7. Phân chia Phạm vi & Lộ trình (Scope & Roadmap)
Bảng cam kết tiến độ giữa các mốc:
* **Milestone 1 (Hiện tại - Đã hoàn thành 100%):** Processor `image-redact`, 3 style che, padding, xóa EXIF, unit tests đạt chuẩn contract §3B.
* **Milestone 2 (Sắp tới):** Whitelist khuôn mặt (InsightFace / ArcFace ONNX, Cosine similarity).
* **Milestone 3:** Đo đạc tài nguyên trên K8s Lab Node, bake trọng số vào Docker, chạy thử KEDA autoscaling.
* **Phase 2:** Xử lý video (`video-redact`) với ByteTrack và FFmpeg audio passthrough.
