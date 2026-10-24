# Đề tài: Cloud-Native Privacy Service

Dịch vụ ẩn danh hoá thông minh trên nền tảng Kubernetes: tự động phát hiện và che **khuôn mặt** và **biển số xe** trong ảnh/video.
File này tóm tắt bản mô tả đề tài để làm báo cáo/slide. Contract kỹ thuật nằm ở `docs/integration-contracts.md`, tiến độ ở `docs/milestones.md`.

## 1. Bối cảnh (tóm tắt)
- **Nội dung đa phương tiện bùng nổ:** vlog, video ngắn, dashcam, camera giám sát vô tình ghi lại khuôn mặt người qua đường và biển số xe, rồi lan truyền công khai.
- **Nhu cầu:**
  - giảm thời gian hậu kỳ (che tay rất tốn công)
  - tạo bản công khai đã che, giữ bản gốc riêng
  - chia sẻ dữ liệu cho bên thứ ba mà giảm dữ liệu cá nhân
  - bảo vệ người không liên quan trong nội dung công khai
- **Pháp lý:**
  - Việt Nam: Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP, hiệu lực từ 01/01/2026. Khuôn mặt và biển số *có thể* là dữ liệu cá nhân khi giúp xác định một người.
  - Quốc tế: GDPR (hợp pháp, minh bạch, giới hạn mục đích, tối thiểu hoá dữ liệu).
  - Không phải mọi ghi hình nơi công cộng đều bị cấm. Dịch vụ là công cụ giảm rủi ro, không phải tư vấn pháp lý.

## 2. Giải pháp
Nền tảng cloud cho phép tải lên ảnh/video. YOLOv8 phát hiện khuôn mặt và biển số, rồi che tự động. Kiến trúc **Cloud-Native, event-driven**:
NATS JetStream (hàng đợi), MinIO (object storage), PostgreSQL (trạng thái job), KEDA (co giãn worker theo hàng đợi) trên Kubernetes.

## 3. Chức năng
| Nhóm | Nội dung | Phase |
| :--- | :--- | :--- |
| **Ẩn danh hoá ảnh** | JPG/PNG/WEBP. Che mặt và/hoặc biển số. Blur, Pixelate (mosaic), Blackout. Thanh trượt Before/After | **1** |
| **Xử lý hàng loạt** | Tải lên bộ ảnh (batch), theo dõi trạng thái từng ảnh, thử lại ảnh lỗi mà không làm lại cả bộ | **1** |
| **Cấu hình theo job** | Chọn đối tượng che, style, độ mạnh blur/kích thước ô pixel. Form cấu hình có **ảnh mẫu** đổi ngay theo lựa chọn để người dùng thấy trước hiệu ứng | **1** |
| **Whitelist khuôn mặt** | Tải ảnh chân dung mẫu. Face embedding + cosine similarity giữ nguyên người quen, che người lạ | **1** |
| **Báo cáo** | Số khuôn mặt/biển số, danh sách phát hiện confidence thấp để tự kiểm tra lại. Xuất JSON và xem trên web | **1** (PDF: **2**) |
| **Ẩn danh hoá video** | MP4 H.264, 15–60s. Tách khung hình, che, ByteTrack để vết che không nhấp nháy, FFmpeg giữ nguyên âm thanh | **2** |
| **Whitelist biển số** | Đăng ký biển số của mình để không bị che (cần OCR biển VN 2 dòng) | **2** |
| **Bản địa hoá VN** | Biển xe máy vuông 2 dòng, biển ô tô, biển vàng, biển công vụ. Góc nghiêng, ngược sáng | Fine-tune (song song) |

## 4. So sánh với giải pháp hiện có
| Giải pháp | Ưu điểm | Hạn chế |
| :--- | :--- | :--- |
| Chỉnh sửa thủ công (Premiere, DaVinci, CapCut) | Chính xác theo ý người dựng | 1 phút video mất 30–60 phút. Không tự động hoá hàng loạt |
| Auto-blur phổ thông (YouTube Studio, script OpenCV) | Tự động, nhanh hơn làm tay | Phải tự cấu hình/vận hành script, xử lý từng video, không có batch |
| AI Cloud thương mại (Rekognition, Google Vision) | Hạ tầng mạnh, nhận diện tổng quát tốt | Trả tiền theo lượt, phải tự ghép pipeline che, dữ liệu gửi ra server nước ngoài |
| Mã nguồn mở (deface, video-privacy-blur) | Miễn phí, chạy local | Chỉ xử lý từng file. Thiếu quản lý, batch, tích hợp và khả năng mở rộng |

**Điểm khác biệt:** nhóm không làm lại thuật toán nhận diện, mà giải bài toán **tổ chức và vận hành xử lý media ở quy mô lớn**: dịch vụ mã nguồn mở, tự động hoàn toàn, chuyên cho quyền riêng tư, chi phí hạ tầng thấp, mở rộng được.

## 5. Mục tiêu
### A. AI & thị giác máy tính
- **Dataset & fine-tune:** WIDER FACE + Vietnamese License Plate Dataset → YOLOv8n 2 nhãn (face, plate). Mục tiêu **mAP@50 ≥ 85%** trên tập test cho cả 2 nhãn.
  Trong lúc chờ model fine-tune, Phase 1 chạy model pretrained `yolov8n-oiv7` (các lớp `Human face`, `Vehicle registration plate`). Model được thay bằng biến môi trường khi đạt ngưỡng.
- **Whitelist:** face embedding + cosine similarity. Mục tiêu nhận đúng người quen **≥ 90%**. Ngưỡng phải ưu tiên **không nhận nhầm người lạ** (nhận nhầm thì lộ mặt người lạ).
- **Tối ưu suy luận (Phase 2):** ONNX + OpenVINO trên CPU Intel. INT8 chỉ dùng nếu benchmark chứng minh nhanh hơn (mục tiêu 2–3 lần) mà độ chính xác vẫn đạt. So sánh với PyTorch CPU theo throughput, latency, RAM, mAP.

### B. Hệ thống Cloud-Native (trọng tâm môn học)
- **Event-driven:** NATS JetStream tách hoàn toàn tầng Web và tầng Worker. Không nghẽn khi nhiều request đồng thời. NATS mã nguồn mở, nhẹ, đơn giản hơn Kafka nhiều (benchmark độ trễ p50/p99/p99.9 tại 3,000 req/s, 1 KB payload, theo Brave New Geek & Synadia 2024).
- **KEDA:** `ScaledObject` theo số message chờ trong NATS. Hai pool độc lập: **ảnh** (nhiều job nhỏ) và **video** (job nặng, lâu). Scale-out khi nhiều tác vụ/video dài, scale-in về 0 khi rảnh.
- **Đo đạc (Phase 2):** thời gian xử lý video đơn luồng (monolith) vs phân tán trên K8s. Hiệu năng suy luận so với tool mã nguồn mở. Thử các chiến thuật scale khác nhau. Benchmark chạy trên môi trường đã deploy.

### C. Giới hạn phạm vi
- Video 15–60 giây (cụm thực nghiệm chỉ có CPU, không GPU).
- Ảnh JPG/PNG/WEBP. Video MP4 H.264.
- Dữ liệu tự xoá sau 24 giờ. Phase 1 không có tài khoản người dùng.

## 6. Ghi chú hỏi đáp (không đưa vào slide)
- **Vì sao YOLOv8n?** Bản nhỏ nhất của YOLOv8, ít tham số, hợp server CPU hạn chế. Một model 2 nhãn cho cả mặt và biển số, đơn giản hoá triển khai, hợp với chạy nhiều worker song song. Tốc độ/độ chính xác vẫn phải đo trên dữ liệu đề tài.
- **mAP@50?** mean Average Precision tại IoU = 0.5 (dự đoán đúng khi chồng lấp với nhãn ≥ 50%), xét cả precision và recall theo các ngưỡng confidence. 85% là ngưỡng nhóm tự đặt, **không** bảo đảm chất lượng ẩn danh hoá. Phải xem thêm recall theo từng lớp, vì bỏ sót một khuôn mặt là lộ thông tin.
- **Vì sao face embedding + cosine?** Biến khuôn mặt thành vector đặc trưng, nên so sánh được dù khác góc/ánh sáng. Không so pixel. Ngưỡng hiệu chỉnh trên dữ liệu riêng, ưu tiên tránh nhận nhầm người lạ.
- **ONNX / OpenVINO / INT8?** ONNX là định dạng trao đổi model (tách framework huấn luyện khỏi runtime). OpenVINO là runtime tối ưu cho CPU Intel (hạ tầng của nhóm), nhập trực tiếp ONNX. INT8 giảm RAM/tăng tốc nhưng có thể bỏ sót nhiều hơn, nên chỉ dùng có điều kiện.
- **Vì sao Cloud-Native?**
  - Co giãn tài nguyên theo nhu cầu (0 khi rảnh).
  - Triển khai trên hạ tầng riêng, nên đơn vị cần giữ dữ liệu trong nước kiểm soát được nơi lưu và xử lý.
  - Đo được thông lượng, thời gian xử lý, khả năng mở rộng, tài nguyên và khả năng phục hồi khi worker lỗi.
