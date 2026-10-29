---
name: privacy-service-report-writer
description: >-
  Chuyên gia soạn thảo, biên tập và kiểm định báo cáo kỹ thuật, slide thuyết trình
  và kịch bản phản biện cho đồ án môn học "Cloud-Native Privacy Service" (Vấn đề hiện đại trong CNTT - UET).
  Đảm bảo văn phong học thuật chuẩn mực, loại bỏ lối viết LLM sáo rỗng, tự động đối chiếu
  ngân hàng số liệu định lượng (chi phí API, benchmark, throughput, RAM) và cấu trúc lập luận bảo vệ trước hội đồng.
---

# Privacy Service Report Writer Skill

Kỹ năng chuyên biệt phục vụ viết báo cáo khoa học, slide thuyết trình giữa kỳ/cuối kỳ và tài liệu kỹ thuật cho đề tài **Cloud-Native Privacy Service** (Môn: *Vấn đề hiện đại trong CNTT* - ĐH Công nghệ, ĐHQGHN).

Kỹ năng này giải quyết triệt để các nhận xét khắt khe của giảng viên: **loại bỏ văn phong cảm thán/phổ thông của LLM, bổ sung số liệu chứng minh định lượng, làm rõ tính tất yếu của kiến trúc Cloud-Native, và bảo đảm an toàn dữ liệu nhạy cảm trên Cloud**.

---

## 1. Năm Nguyên Tắc Vàng (The 5 Golden Rules)

Khi soạn thảo bất kỳ nội dung nào (slide, báo cáo, tài liệu thiết kế), Agent **BẮT BUỘC** tuân thủ 5 nguyên tắc sau:

### 1.1. Không dùng văn phong LLM sáo rỗng (Anti-LLM Technical Tone)
* **Tuyệt đối cấm:** Các cụm từ văn xuôi cảm thán, báo chí như: *"Trong kỷ nguyên số...", "Vô tình...", "Một lượng khổng lồ...", "Mang lại trải nghiệm tuyệt vời...", "Nhu cầu của người dùng là vô cùng cấp thiết..."*.
* **Bắt buộc dùng:** Mệnh đề ngắn gọn, khách quan, mang tính kỹ thuật:
  * *Thay vì:* "Trong kỷ nguyên số, việc quay phim vô tình làm lộ mặt..."
  * *Viết:* "Sự phổ biến của camera hành trình và video ngắn đặt ra nghĩa vụ pháp lý về ẩn danh hóa dữ liệu nhận dạng cá nhân (PII) theo Nghị định 356/2025/NĐ-CP và GDPR."

### 1.2. Định lượng hóa mọi nhận định (Quantitative Evidence First)
* Không dùng từ định tính chung chung: *"rất đắt đỏ"*, *"rất nhanh"*, *"tốn nhiều tài nguyên"*.
* Phải dẫn chứng bằng **con số cụ thể** từ [Ngân hàng số liệu](./references/quantitative-data-bank.md):
  * Chi phí AWS Rekognition: **$0.10 - $0.12 / phút video**; 10 giờ video = **$60 - $72**.
  * Độ trễ xử lý hệ thống: **< 400ms / ảnh 1080p** trên môi trường thuần CPU.
  * Mức tiêu thụ bộ nhớ: Giới hạn nghiêm ngặt **350MB – 500MB RAM / Pod**.

### 1.3. Cây cầu logic: "Tại sao giải pháp bắt buộc phải là Cloud-Native?"
Luôn xây dựng lập luận nối liền từ Bối cảnh $\rightarrow$ Thách thức $\rightarrow$ Kiến trúc:
1. **Dữ liệu phát sinh dồn dập (Bursty Workload):** Hàng trăm ảnh sự kiện hoặc hàng chục video dashcam đổ về cùng lúc.
2. **Nghẽn phần cứng máy cá nhân:** Không có GPU, render AI làm treo máy, không chạy mẻ được.
3. **Giải pháp Cloud-Native là tất yếu:**
   * **Hàng đợi NATS JetStream:** Bộ đệm chống sốc tải, phân tán tác vụ bất đồng bộ.
   * **KEDA on Kubernetes:** Co giãn worker tự động từ 0 lên $N$ pods khi có việc, thu hồi về 0 pod khi nhàn rỗi $\rightarrow$ Tiết kiệm 100% tài nguyên lúc rảnh.

### 1.4. Thiết kế bảo vệ dữ liệu trên Cloud (Privacy by Design)
Khi đề cập đến việc upload media lên Cloud, luôn chủ động giải thích **4 tầng phòng thủ**:
1. **Vòng đời dữ liệu (MinIO TTL):** Toàn bộ file gốc và kết quả tự động xóa sạch sau **24 giờ**.
2. **Zero-Trust Storage:** Bucket `uploads` (file gốc) là Private 100%, chỉ worker nội bộ K8s đọc được qua Secret.
3. **Metadata Sanitization:** Tự động loại bỏ hoàn toàn metadata EXIF, tọa độ GPS trước khi xuất file.
4. **On-Premise Ready:** Đóng gói Kubernetes cho phép triển khai mạng nội bộ doanh nghiệp, dữ liệu không bao giờ rời khỏi cơ quan.

### 1.5. Trọng tâm bài toán Privacy: Ưu tiên Recall hơn Precision thuần túy
* Khi trình bày về model AI, luôn giải thích rõ: Với bài toán bảo vệ quyền riêng tư, **bỏ sót 1 khuôn mặt hay biển số (False Negative) nguy hiểm hơn nhiều so với việc che nhầm (False Positive)**. Do đó tiêu chí đánh giá bên cạnh **mAP@50 $\ge$ 85%** phải là **Recall cao**.

---

## 2. Quy trình Soạn thảo & Thẩm định Báo cáo

```text
[Nhận yêu cầu báo cáo/slide]
           │
           ▼
[Bước 1: Tra cứu Ngân hàng Số liệu & Hợp đồng]
   ├── references/quantitative-data-bank.md
   └── docs/integration-contracts.md
           │
           ▼
[Bước 2: Soạn thảo theo Cấu trúc Kỹ thuật UET]
   └── templates/technical-report-template.md
           │
           ▼
[Bước 3: Rà soát bằng Checklist của Thầy giáo]
   └── references/teacher-review-checklist.md
           │
           ▼
[Xuất bản phẩm: Báo cáo / Slide / Kịch bản phản biện]
```

---

## 3. Danh mục Tài liệu Tham chiếu (Sub-documents)

Khi thực hiện nhiệm vụ, tham khảo các tài liệu chuyên sâu đính kèm:
* 📊 [Ngân hàng số liệu định lượng (Data Bank)](./references/quantitative-data-bank.md)
* ✅ [Bảng Checklist rà soát theo nhận xét của Giảng viên](./references/teacher-review-checklist.md)
* 📝 [Mẫu Báo cáo & Cấu trúc Slide chuẩn UET](./templates/technical-report-template.md)
