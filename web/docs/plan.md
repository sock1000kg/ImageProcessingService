# Kế hoạch Web (Frontend + Backend): Cloud-Native Privacy Service

Đề tài: `docs/report-material/de-tai.md`. Contract (nguồn sự thật): `docs/integration-contracts.md`. Tiến độ chung: `docs/milestones.md`.
Ký hiệu trong task:
- **[Cần Engine]**: phải thống nhất với Huy Đức trước.
- **[Cần Infra]**: nhờ Đạt.
- **[Đổi contract]**: thay đổi `docs/integration-contracts.md`, phải báo cả nhóm.

## Hiện trạng (24/10)
Đã có từ MVP cũ: Express + React. Backend tách lớp (`routes/`, `controllers/`, `services/`, `repositories/`, `schemas/`), migration SQL, consumer `jobs.events` validate bằng zod, `/health` + `/ready`,
backend serve frontend, `web/Dockerfile`. Frontend có `UploadForm`, `JobList`, `JobCard`, `api.ts`.
→ Phần "đường ống" (upload → MinIO → PG → NATS → event → UI) đã chạy. Việc còn lại là **đổi nghiệp vụ** từ `object-detection`/`image-convert` sang **ẩn danh hoá bộ ảnh**.

---

# Phase 1: Ẩn danh hoá bộ ảnh (24/10 → 15/11)
**Hoàn thành khi:** trên `https://imgproc.sock1000kg.io.vn`, người dùng tải lên một bộ ảnh + ảnh chân dung whitelist, chọn cách che (thấy trước hiệu ứng trên ảnh mẫu) → xem trạng thái từng ảnh → xem before/after → tải ảnh và báo cáo JSON.

## Milestone 1: Mô hình dữ liệu batch (24/10 → 30/10)
* **Tasks:**
    - [ ] Migration mới: bảng `batches` (id, trạng thái tổng, cấu hình che mặc định, danh sách key ảnh whitelist, created_at) và `jobs` thêm `batch_id`, `params` (JSONB), `detections` (lấy từ `resultSummary`). Bỏ các loại job cũ khỏi validate.
    - [ ] Đường dẫn object theo contract §5: `uploads/<batchId>/<jobId>/input.<ext>`, `uploads/<batchId>/whitelist/face-<n>.<ext>`, `results/<batchId>/<jobId>/result.<ext>`.
    - [ ] Command `image-redact` đúng contract §2 (zod schema cho `params.redaction`, `whitelist`). Event `COMPLETED` lưu `resultSummary` (`counts`, `detections`, `model`).
    - [ ] Trạng thái batch suy ra từ các job: `PROCESSING` khi còn job chưa xong, `COMPLETED` khi tất cả xong, `PARTIAL` khi có job `FAILED`. Không lưu trùng logic ở hai nơi.
    - [ ] Giữ idempotency (contract §8). Event `PROCESSING` đến sau trạng thái kết thúc thì bỏ qua. Viết vài unit test cho trường hợp trùng/đến trễ.
* **Kiểm chứng:** tạo batch 3 ảnh bằng API → 3 message trên `jobs.image` (xem bằng `nats sub` hoặc `nats stream view IMAGE_JOBS`). Publish tay 3 event `COMPLETED` → batch chuyển `COMPLETED`.

## Milestone 2: API (28/10 → 04/11)
Đường dẫn cụ thể do Web quyết định. Contract §9 chỉ liệt kê khả năng cần có.
* **Tasks:**
    - [ ] Tạo batch: multipart nhiều `files` (JPG/PNG/WEBP, giới hạn số lượng + dung lượng mỗi file), 0..n `whitelist` (ảnh chân dung), `config` (targets, style, strength, padding, confidenceThreshold, reviewThreshold, similarityThreshold). Validate rõ ràng, lỗi 4xx kèm message.
    - [ ] Xem batch: thông tin batch + danh sách job (trạng thái, `counts`, `resultUrl`).
    - [ ] Ảnh gốc cho thanh trượt: endpoint trả ảnh gốc từ `uploads` (stream qua backend, hoặc presigned URL ngắn hạn). Bucket `uploads` là private.
    - [ ] Thử lại ảnh `FAILED`: tạo job `image-redact` mới cho đúng ảnh đó. Input vẫn còn trong TTL 24h, hết hạn thì trả 410.
    - [ ] Báo cáo batch (JSON): tổng số ảnh, số khuôn mặt/biển số, đã che, được whitelist, danh sách phát hiện `lowConfidence` (ảnh nào, box nào, confidence), model đã dùng, thời gian xử lý. Format do Web đặt và ghi vào `web/README.md`.
* **Kiểm chứng:** gọi API bằng curl/HTTP client cho từng trường hợp. Sai định dạng/quá dung lượng → 4xx có message.

## Milestone 3: Giao diện (01/11 → 12/11)
* **Tasks:**
    - [ ] **Trang tạo batch:** kéo-thả nhiều ảnh (preview thumbnail, bỏ từng ảnh), khu vực "Người cần giữ nguyên" để thêm ảnh chân dung whitelist, chọn đối tượng che (mặt/biển số), style (Blur/Pixelate/Blackout), độ mạnh. Có "Nâng cao" cho các ngưỡng. Kiểm tra định dạng/dung lượng ngay trên trình duyệt.
    - [ ] **Trang batch:** dropdown (hoặc danh sách thu gọn) liệt kê các ảnh trong batch, mỗi ảnh hiện trạng thái hiện tại (`QUEUED`/`PROCESSING`/`COMPLETED`/`FAILED`). Chọn một ảnh để mở phần xem kết quả bên dưới. Không cần lưới ảnh hay thanh progress. Kèm số ảnh đã xong (x/N), nút thử lại ảnh lỗi, nút tải báo cáo JSON, "Tải tất cả" (link từng ảnh, zip để Phase 2). Trạng thái tự cập nhật (polling vài giây là đủ).
    - [ ] **Xem một ảnh:** thanh trượt before/after (ảnh gốc ↔ kết quả). Danh sách phát hiện (mặt/biển số, confidence, cảnh báo `lowConfidence`, nhãn "whitelist").
    - [ ] **Ảnh mẫu xem trước:** cạnh form cấu hình có một ảnh mẫu cố định (ví dụ cảnh đường phố có người và xe) với các vùng mặt/biển số đánh dấu sẵn trong code. Khi người dùng đổi style, độ mạnh hoặc bỏ chọn mặt/biển số, ảnh mẫu vẽ lại ngay trên `<canvas>` (blur: `ctx.filter = "blur(Npx)"` trong vùng box; pixelate: vẽ thu nhỏ rồi phóng lại với `imageSmoothingEnabled = false`; blackout: `fillRect`). Không gọi server, không chạy AI. Kết quả thật của từng ảnh trả về đã đúng style đã chọn.
    - [ ] **Báo cáo trên web:** bảng tổng hợp + danh sách ảnh có phát hiện confidence thấp để người dùng kiểm tra lại.
    - [ ] Lỗi API và job `FAILED` (`error.code` + message) hiện rõ trên UI, không chỉ log console.
* **Kiểm chứng (thủ công):** chạy compose local + engine local (hoặc publish event tay theo contract §3), đi hết luồng trên với 5–10 ảnh có mặt người và xe.

## Milestone 4: Deploy và demo (10/11 → 15/11)
* **Tasks:**
    - [ ] **[Cần Infra]** Deploy web lên `imgproc`: Deployment + Service + HTTPRoute `/` và `/api` (giữ `/results/` → MinIO), Secret (`DATABASE_URL`, MinIO credentials), memory limit. Image `socknot1000kg/imgproc-web` do CI build theo SHA.
    - [ ] Toàn bộ cấu hình qua env. Liệt kê biến env trong `web/README.md`.
    - [ ] `UPLOAD_MAX_BYTES` × số file tối đa phải nằm dưới giới hạn body của Cloudflare (100MB/request ở gói free). **[Cần Infra]** xác nhận giới hạn trên Gateway.
    - [ ] **[Cần Engine]** Chạy luồng thật với worker engine trên lab. Ghi lại chỗ lệch contract và sửa ở phía chịu trách nhiệm (contract §6).
    - [ ] Kịch bản demo (`web/docs/demo.md`): bộ ảnh mẫu (đường phố, sự kiện có người quen), các bước thao tác, chỗ nên dừng giải thích (whitelist, chỉnh độ mạnh, báo cáo).
* **Kiểm chứng:** demo trọn luồng trên hostname public với bộ ảnh mẫu 20 ảnh. Không ảnh nào kẹt ở `QUEUED`/`PROCESSING`.

---

# Phase 2: Video, PDF và hoàn thiện (16/11 → 29/11)
Tier: **[Must]** phải có, **[Should]** nên có, **[Could]** nếu còn thời gian.

- [ ] **[Must]** Video: tải lên MP4 H.264 15–60s (kiểm tra thời lượng/codec), dùng chung cấu hình che + whitelist, publish `video-redact` lên `jobs.video`, theo dõi progress (worker gửi % theo khung hình), xem/tải video kết quả. **[Cần Engine]** chốt `resultSummary` của video (contract §2C).
- [ ] **[Must]** Xuất báo cáo PDF từ báo cáo JSON (render phía server hoặc in từ trang báo cáo).
- [ ] **[Should]** Whitelist biển số: nhập danh sách biển số. **[Cần Engine]** cần OCR. **[Đổi contract]** thêm `whitelist.plates`.
- [ ] **[Could]** Chỉnh lại một ảnh đã xong (đổi style/độ mạnh, bật/tắt từng box) mà không chạy lại AI. **[Cần Engine]** **[Đổi contract]** cần thêm job chỉ render theo box có sẵn.
- [ ] **[Should]** Tải cả batch dạng zip. Xoá batch thủ công (xoá object MinIO + dòng PG).
- [ ] **[Should]** Cập nhật trạng thái real-time bằng SSE thay polling.
- [ ] **[Could]** Tài khoản người dùng + lưu "người cần giữ nguyên" để dùng lại (thay vì tải lại mỗi batch).
- [ ] **[Could]** Trang thống kê hệ thống cho buổi bảo vệ: số job theo trạng thái, độ dài hàng đợi từng pool, số worker. **[Cần Infra]** nguồn số liệu (NATS monitoring/KEDA).

---

## Tổng hợp việc cần phối hợp
| Khi nào | Với ai | Việc |
|---|---|---|
| M1 (28/10) | Engine | Xác nhận contract §2/§3 mới (`image-redact`, `detections`, `counts`) trước khi code |
| M2 (04/11) | Engine | Chốt ngưỡng mặc định (`confidenceThreshold`, `reviewThreshold`, `similarityThreshold`) sau khi engine thử |
| M4 (10/11) | Infra | Deploy web, Secret, HTTPRoute, giới hạn upload, CI image |
| M4 (12/11) | Engine + Infra | Chạy luồng thật trên lab |
| Phase 2 | Engine | `resultSummary` của video, OCR cho whitelist biển số |
