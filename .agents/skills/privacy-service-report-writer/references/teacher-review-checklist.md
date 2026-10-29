# Bảng Thẩm Định Phản Biện (Teacher Review Checklist)
## Bộ tiêu chí rà soát báo cáo & slide theo nhận xét của Giảng viên

Mỗi khi soạn thảo hoặc phản biện nội dung báo cáo/slide của đồ án **Cloud-Native Privacy Service**, Agent bắt buộc đối chiếu qua 7 câu hỏi sống còn sau:

---

### Checklist 7 Câu hỏi "Tử huyệt" của Giảng viên

| STT | Tiêu chí sát hạch | Lỗi thường gặp (Cần tránh) | Cách trả lời / Viết đúng chuẩn | Tình trạng kiểm tra |
| :---: | :--- | :--- | :--- | :---: |
| **1** | **Số liệu chứng minh chi phí đắt đỏ của API** | Ghi cảm tính: *"Chi phí rất đắt đỏ với sinh viên/người dùng cá nhân"*. | Đưa số liệu giá cụ thể: AWS Rekognition $0.10 - $0.12/phút video ($\approx \$60-\$72$ cho 10h video) vs. giải pháp tự host 0đ bản quyền. | [ ] |
| **2** | **So sánh với việc tự chạy trên máy cá nhân** | Không nhắc đến, hoặc chỉ nói *"tool mã nguồn mở thiếu tính năng"*. | Phân tích 3 lý do không thể chạy máy cá nhân: 1) Không có GPU, render AI làm đơ máy; 2) Cài đặt phức tạp (CUDA/Python); 3) Không xử lý batch phân tán được. | [ ] |
| **3** | **Rủi ro lộ dữ liệu nhạy cảm trên Cloud** | Không nhắc đến rủi ro rò rỉ dữ liệu khi người dùng upload ảnh/video gốc lên server. | Nêu đủ 4 tầng bảo mật: 1) MinIO TTL 24h tự hủy file; 2) Bucket uploads Private 100%; 3) Xóa sạch EXIF/GPS; 4) Khả năng deploy On-Premise/Private K8s. | [ ] |
| **4** | **Văn phong kỹ thuật (Anti-LLM)** | Viết văn xuôi cảm thán: *"Trong kỷ nguyên số...", "Vô tình...", "Một lượng khổng lồ..."*. | Loại bỏ 100% từ cảm thán. Dùng câu văn chủ động, định lượng, dùng thuật ngữ PII, GDPR, Nghị định 356/2025/NĐ-CP. | [ ] |
| **5** | **Cây cầu logic: "Tại sao cần Dịch vụ Cloud?"** | Bối cảnh nói về quay video, xong nhảy ngay sang giới thiệu K8s, NATS, KEDA mà không giải thích vì sao. | Xây dựng mạch: Dữ liệu phát sinh theo đợt (Bursty Traffic) $\rightarrow$ Cần hàng đợi NATS chống sốc tải $\rightarrow$ Cần KEDA co giãn worker tự động để tối ưu tài nguyên CPU. | [ ] |
| **6** | **Chỉ số đo lường AI & Privacy** | Chỉ ghi cộc lốc: *"Đo lường theo các benchmark (VD: mAP@50)"*. | Giải thích rõ: mAP@50 $\ge$ 85% đo vị trí box; **Ưu tiên Recall $\ge$ 92%** vì bài toán Privacy không được phép bỏ sót đối tượng; Cosine similarity 0.60. | [ ] |
| **7** | **Làm sạch các ghi chú nháp (Draft Notes)** | Để sót các dòng: *(ko cần trong slides. note để hiểu / thầy hỏi thì trả lời)*, *Notes ko cần cho vào slide:*. | Quét sạch 100% các câu ghi chú nội bộ, dấu hỏi chấm `???` trước khi xuất bản file PDF/Slide. | [ ] |

---

### Hướng dẫn xử lý khi phát hiện vi phạm:
1. **Nếu gặp văn phong LLM dài dòng:** Cắt bỏ 50% số chữ, chuyển các đoạn văn thành danh sách bullet points có in đậm từ khóa kỹ thuật.
2. **Nếu thiếu số liệu:** Bắt buộc tra cứu bảng dữ liệu tại [`quantitative-data-bank.md`](./quantitative-data-bank.md) để điền con số thực tế.
3. **Nếu phần kiến trúc bị rời rạc:** Bổ sung ngay câu kết nối: *"Để xử lý tính chất tải dồn dập (bursty traffic) của bài toán media mà không làm nghẽn hệ thống..."*.
