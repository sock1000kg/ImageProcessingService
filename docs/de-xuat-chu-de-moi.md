# ĐỀ CƯƠNG ĐỀ XUẤT ĐỀ TÀI ĐỒ ÁN
## Tên đề tài: Cloud-Native Privacy Engine — Hệ Thống Ẩn Danh Hóa Đa Phương Tiện Thông Minh Trên Nền Tảng Kubernetes & KEDA

---

## 1. Bối cảnh (Background)

* **Sự bùng nổ của nội dung đa phương tiện và dữ liệu công cộng:**  
  Trong kỷ nguyên số, việc quay phim, chụp ảnh và chia sẻ video ngắn (Vlog, TikTok, YouTube Shorts, Facebook Reels) diễn ra hàng ngày ở khắp mọi nơi. Cùng với đó là sự phổ cập của camera hành trình (dashcam) trên ô tô, xe máy và hệ thống camera giám sát đô thị. Vô tình, một lượng khổng lồ hình ảnh khuôn mặt của người qua đường và biển số phương tiện cá nhân bị ghi lại và lan truyền công khai trên Internet.

* **Sức ép pháp lý về quyền riêng tư và dữ liệu cá nhân:**  
  * **Tại Việt Nam:** **Nghị định số 13/2023/NĐ-CP** về Bảo vệ dữ liệu cá nhân đã có hiệu lực, quy định nghiêm ngặt: Hình ảnh khuôn mặt, biển số xe gắn với định danh cá nhân là dữ liệu cần được bảo vệ. Việc tự ý thu thập, đăng tải công khai mà không có sự đồng ý của chủ thể có thể dẫn đến xử phạt hành chính hoặc tranh chấp pháp lý.
  * **Trên thế giới:** Quy định chung về bảo vệ dữ liệu của Liên minh Châu Âu (**GDPR**) phạt rất nặng các hành vi công khai hình ảnh cá nhân khi chưa được ẩn danh hóa.

* **Nhu cầu cấp thiết của người dùng:**  
  Các nhà sáng tạo nội dung (vloggers, streamers), nhà báo, cơ quan truyền thông, cũng như các doanh nghiệp vận tải đang đối mặt với bài toán: **Làm thế nào để bảo vệ quyền riêng tư trong các sản phẩm media của mình một cách nhanh chóng, chi phí thấp mà không tốn hàng giờ chỉnh sửa thủ công?**

---

## 2. Giới thiệu chủ đề (Topic Introduction)

* **Tên đề tài:**  
  **"Xây dựng hệ thống ẩn danh hóa đa phương tiện (Face & License Plate Redaction) tự động dựa trên YOLOv8 tối ưu hóa và kiến trúc Cloud-Native đàn hồi trên Kubernetes"**  
  *(Tên tiếng Anh: Cloud-Native Privacy Engine for Automated Media Anonymization using Optimized YOLOv8 and Elastic Kubernetes Architecture)*

* **Khái quát giải pháp:**  
  Nhóm đề xuất xây dựng một nền tảng dịch vụ đám mây (Cloud Service) cho phép người dùng tải lên hình ảnh và video. Hệ thống ứng dụng mô hình thị giác máy tính **YOLOv8** được tinh chỉnh chuyên sâu để tự động phát hiện, làm mờ/che giấu khuôn mặt người và biển số phương tiện. 
  
  Toàn bộ hệ thống được thiết kế theo chuẩn **Cloud-Native**, vận hành dựa trên kiến trúc hướng sự kiện (**Event-Driven**) với hàng đợi phân tán **NATS JetStream**, lưu trữ đối tượng **MinIO (S3)**, và co giãn tải động (**Auto-scaling**) bằng **KEDA** trên cụm **Kubernetes**.

---

## 3. Các chức năng của hệ thống (Features)

Hệ thống được phát triển với 5 nhóm chức năng chính, kết hợp giữa tính ứng dụng thực tế và tính mới sáng tạo:

### 3.1. Ẩn danh hóa đa phương tiện tự động (Core Redaction)
* **Xử lý Ảnh tĩnh (Image):** Hỗ trợ các định dạng phổ biến (JPG, PNG, WEBP), xử lý tức thì, cung cấp thanh trượt so sánh trực quan *Before / After*.
* **Xử lý Video ngắn (Video):** Tự động bóc tách từng khung hình, áp dụng ẩn danh hóa, tích hợp thuật toán theo dõi đối tượng (**ByteTrack**) để vết mờ di chuyển mượt mà, không bị hiện tượng nhấp nháy (flickering). Sử dụng **FFmpeg** để bảo toàn nguyên vẹn 100% âm thanh gốc của video.
* **Đa dạng phong cách che:**
  * *Gaussian Blur:* Làm mờ mềm mại, tự nhiên (phù hợp vlog đời sống).
  * *Pixelate (Mosaic 8-bit):* Phong cách phóng sự truyền hình, tin tức.
  * *Blackout Tape:* Băng che đen tuyệt đối, phong cách hồ sơ pháp lý/tài liệu mật.

### 3.2. Ẩn danh có chọn lọc (Smart Whitelisting / Vlogger Mode) — *Tính năng mới đột phá*
* **Chế độ Vlogger:** Người dùng chỉ cần tải lên 1 ảnh chân dung mẫu (Selfie). Hệ thống sử dụng mô hình trích xuất đặc trưng khuôn mặt (Face Embeddings) để so khớp: **Giữ nguyên 100% độ nét khuôn mặt chủ kênh**, nhưng **tự động che mờ tất cả người lạ đi đường**.
* **Chế độ Chủ phương tiện:** Cho phép đăng ký biển số xe cá nhân để hệ thống không làm mờ biển số của mình mà chỉ làm mờ các xe xung quanh.

### 3.3. Bản địa hóa giao thông Việt Nam (Vietnam Context Specialization)
* Mô hình được tinh chỉnh đặc thù để nhận diện chính xác:
  * **Biển số xe máy Việt Nam** (dạng vuông, 2 dòng ký tự) ở các góc chụp nghiêng, ngược sáng.
  * Biển số ô tô, biển số xe kinh doanh (biển vàng), biển xe công vụ.
  * Hoạt động ổn định trong điều kiện mật độ phương tiện đông đúc đặc trưng của đô thị Việt Nam.

### 3.4. Kiểm toán rủi ro quyền riêng tư (Privacy Risk Audit & Scoring)
* Hệ thống đóng vai trò như một công cụ kiểm toán an toàn dữ liệu:
  * Phân tích và thống kê số lượng khuôn mặt, số lượng biển số xe xuất hiện trong media.
  * Chấm điểm rủi ro vi phạm quyền riêng tư (**Privacy Risk Score**, thang điểm 0–100) theo khuyến nghị của Nghị định 13/2023/NĐ-CP.
  * Cho phép xuất báo cáo kiểm toán (Audit Report dạng JSON/PDF).

### 3.5. Trải nghiệm người dùng & Giám sát thời gian thực
* Giao diện web trực quan, tải file kéo-thả đơn giản.
* Cơ chế cập nhật tiến trình xử lý thời gian thực (% Progress Bar) thông qua kết nối SSE/WebSocket từ Backend.

---

## 4. Các phương pháp hiện có và hạn chế (Existing Methods & Limitations)

| Phương pháp hiện có | Cách thức hoạt động | Ưu điểm | Hạn chế & Lý do chưa tối ưu |
| :--- | :--- | :--- | :--- |
| **1. Chỉnh sửa thủ công**<br>*(Adobe Premiere, DaVinci Resolve, CapCut)* | Người dựng phim tự tạo mask, chấm keyframe bằng tay qua từng giây video. | Độ chính xác cao theo ý muốn người dựng. | • Tốn cực kỳ nhiều thời gian và công sức (1 phút video có thể mất 30–60 phút cắt ghép).<br>• Không thể tự động hóa cho hàng loạt video. |
| **2. Công cụ Auto-blur phổ thông**<br>*(YouTube Studio Blur, OpenCV scripts mẫu)* | Dùng thuật toán Haar Cascade hoặc model có sẵn để che mọi khuôn mặt tìm thấy. | Tự động hóa, nhanh hơn làm tay. | • **Che mù quáng:** Làm mờ luôn cả mặt của Vlogger/chủ thể chính.<br>• Không nhận diện được biển số xe máy 2 dòng của Việt Nam.<br>• Xử lý tuần tự trên 1 máy, gây nóng máy và tràn RAM khi video dài. |
| **3. Dịch vụ AI Cloud thương mại**<br>*(Amazon Rekognition, Google Vision API)* | Doanh nghiệp gọi API trả tiền theo lượt từ các nhà cung cấp đám mây lớn. | Hạ tầng mạnh, độ chính xác nhận diện tổng quát tốt. | • Chi phí sử dụng rất đắt đỏ đối với người dùng cá nhân/sinh viên.<br>• Là "hộp đen" đóng, không thể tùy biến thuật toán Whitelist.<br>• Dữ liệu media bị gửi ra server nước ngoài, vi phạm quy định chủ quyền dữ liệu của một số đơn vị. |

---

## 5. Mục tiêu và mức độ giải quyết của nhóm (Objectives & Resolution Scope)

### 5.1. Mục tiêu tổng quát
Xây dựng một dịch vụ đám mây mã nguồn mở, hoạt động hoàn toàn tự động, giải quyết triệt để bài toán bảo vệ quyền riêng tư media tại Việt Nam với chi phí hạ tầng 0 đồng, đồng thời thể hiện xuất sắc các tiêu chuẩn kỹ thuật phân tán hiện đại của môn học.

### 5.2. Mức độ giải quyết cụ thể của nhóm

#### A. Về mặt Trí tuệ nhân tạo (AI & Thị giác máy tính):
* **Tự xây dựng Dataset & Fine-tuning:** Không dùng model có sẵn đơn thuần. Nhóm thu thập, tiền xử lý và gán nhãn tập dữ liệu kết hợp (WIDER FACE + Vietnamese License Plate Dataset) để huấn luyện mô hình **YOLOv8n** chuyên biệt.
* **Mục tiêu độ chính xác:** Đạt **mAP@50 $\ge$ 85%** trên tập kiểm thử cho cả 2 nhãn khuôn mặt và biển số xe Việt Nam.
* **Tính năng Whitelist:** Ứng dụng mô hình trích xuất đặc trưng khuôn mặt (Cosine Similarity trên không gian embedding) để lọc danh tính chủ thể với độ chính xác nhận diện người quen $\ge$ 90%.
* **Tối ưu hóa suy luận (Inference Optimization):** Chuyển đổi mô hình sang định dạng **ONNX Runtime / OpenVINO INT8** giúp giảm 60% mức tiêu thụ RAM và tăng tốc 2–3 lần khi chạy trên môi trường server chỉ có CPU.

#### B. Về mặt Hệ thống & Hạ tầng Cloud-Native (Trọng tâm môn học):
* **Kiến trúc hướng sự kiện (Event-Driven):** Sử dụng **NATS JetStream** để phân tách hoàn toàn tầng Web tiếp nhận và tầng Worker AI xử lý, loại bỏ tình trạng nghẽn kết nối khi có nhiều request đồng thời.
* **Tự động co giãn theo tải thực tế (KEDA on Kubernetes):**
  * Định nghĩa `ScaledObject` lắng nghe chỉ số độ trễ/số lượng tin nhắn chờ trong hàng đợi NATS.
  * Tự động co giãn số lượng Worker Pods: **Scale-out từ 1 pod lên 4–8 pods** khi có video dài hoặc nhiều tác vụ gửi đến, và **scale-in về 1 pod** khi hết việc để tiết kiệm tài nguyên.
* **Đo đạc & Thực nghiệm khoa học:** Có số liệu benchmark cụ thể so sánh:
  * Thời gian xử lý video: Đơn luồng (Monolith) vs Phân tán song song trên K8s.
  * Hiệu năng suy luận: PyTorch nguyên bản vs Mô hình ONNX/INT8 tối ưu hóa.

#### C. Giới hạn phạm vi (Scope Limitations) để đảm bảo tính khả thi đồ án:
* **Độ dài video:** Hỗ trợ xử lý video ngắn có thời lượng từ **15 giây đến 60 giây** (dung lượng tối đa 100MB) nhằm đảm bảo thời gian phản hồi hợp lý trên cụm server thực nghiệm CPU (không có GPU vật lý).
* **Định dạng hỗ trợ:** Hình ảnh (JPG, PNG, WEBP), Video (MP4 chuẩn H.264).
