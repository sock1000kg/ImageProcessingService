# Kế hoạch Web (Frontend + Backend): Cloud-Native Privacy Service

Đề tài: `docs/report-material/de-tai.md`. Contract (nguồn sự thật): `docs/integration-contracts.md`. Tiến độ chung: `docs/milestones.md`.
Ký hiệu trong task:
- **[Cần Engine]**: phải thống nhất với Huy Đức trước.
- **[Cần Infra]**: nhờ Đạt.
- **[Đổi contract]**: thay đổi `docs/integration-contracts.md`, phải báo cả nhóm.

## Hiện trạng (29/10)
Backend đã theo contract mới (Task 14, 16): batch + job `image-redact` trên `jobs.image`, event theo §3/§8, xoá dữ liệu theo §5, Prisma (schema + migration,
`npm run db:studio`), ErrorDTO `{ error: { code, message, details? } }`, layout `domain/` + `dto/` + `routes/controllers/services/repositories`, test ở
`backend/tests/{unit,service}` và `frontend/tests`. Frontend mới chỉ nối tối thiểu với API batch (chưa có UI M3).
Còn lại Phase 1: báo cáo nâng cao + thử lại ảnh lỗi (M2), toàn bộ UI M3, demo M4.

---

# Phase 1: Ẩn danh hoá bộ ảnh (24/10 → 15/11)
**Hoàn thành khi:** trên `https://imgproc.sock1000kg.io.vn`, người dùng tải lên một bộ ảnh + ảnh chân dung whitelist, chọn cách che (thấy trước hiệu ứng trên ảnh mẫu) → xem trạng thái từng ảnh → xem before/after → tải ảnh và báo cáo JSON.

## Milestone 1: Mô hình dữ liệu batch (24/10 → 30/10)
* **Tasks:**
    - [x] **[Bug, làm trước]** Backend ngừng nhận event sau batch đầu tiên. Trong `consumeEvents` (`backend/src/messaging.ts`), `pull()` chỉ được gọi một lần: `for await (const message of subscription)` không bao giờ thoát sau khi batch hết/expire, nên không tới được lần `pull()` tiếp theo. Trên lab (25/10): consumer `backend-job-events` có `last_active` = lúc pod khởi động, event `COMPLETED` nằm lại trong `JOB_EVENTS`, UI không cập nhật. Sửa bằng API consumer của nats.js (`jetStream.consumers.get("JOB_EVENTS", "backend-job-events")` → `consumer.consume()`, thư viện tự pull liên tục), hoặc gọi `pull()` theo timer ngoài vòng lặp. **Kiểm chứng:** chạy backend, đợi > 30s, rồi publish tay vài event → tất cả đều được áp dụng. Lặp lại sau vài phút. (Task 14)
    - [x] Migration mới: bảng `batches` (id, trạng thái tổng, cấu hình che mặc định, danh sách key ảnh whitelist, created_at) và `jobs` thêm `batch_id`, `params` (JSONB), `detections` (lấy từ `resultSummary`). Bỏ các loại job cũ khỏi validate. → Prisma: `batches` (config JSONB, whitelist_keys, whitelist_deleted_at) + `jobs` (batch_id, `result_summary` JSONB chứa `detections`).
    - [x] Đường dẫn object theo contract §5: `uploads/<batchId>/<jobId>/input.<ext>`, `uploads/<batchId>/whitelist/face-<n>.<ext>`, `results/<batchId>/<jobId>/result.<ext>`.
    - [x] Command `image-redact` đúng contract §2 (zod schema cho `params.redaction`, `whitelist`). Event `COMPLETED` lưu `resultSummary` (`counts`, `detections`, `model`).
    - [x] Trạng thái batch suy ra từ các job: `PROCESSING` khi còn job chưa xong, `COMPLETED` khi tất cả xong, `PARTIAL` khi có job `FAILED`. Không lưu trùng logic ở hai nơi.
    - [x] Giữ idempotency (contract §8). Event `PROCESSING` đến sau trạng thái kết thúc thì bỏ qua. Viết vài unit test cho trường hợp trùng/đến trễ. Hiển thị `WORKER_CRASHED` như lỗi thường (có nút thử lại). Backend **không** tự đặt timeout cho job (contract §4). (backend xong; nút thử lại thuộc M2/M3)
* **Kiểm chứng:** tạo batch 3 ảnh bằng API → 3 message trên `jobs.image` (xem bằng `nats sub` hoặc `nats stream view IMAGE_JOBS`). Publish tay 3 event `COMPLETED` → batch chuyển `COMPLETED`.

## Milestone 2: API (28/10 → 04/11)
Đường dẫn cụ thể do Web quyết định. Contract §9 chỉ liệt kê khả năng cần có.
* **Tasks:**
    - [x] Tạo batch: multipart nhiều `files` (JPG/PNG/WEBP, giới hạn số lượng + dung lượng mỗi file), 0..n `whitelist` (ảnh chân dung), `config` (targets, style, strength, padding, `quality` (`standard`/`high`/`max`) → `params.output.quality`, `format` (`original`/`jpg`/`png`/`webp`) → đuôi của `output.key`, confidenceThreshold, reviewThreshold, similarityThreshold). Validate rõ ràng, lỗi 4xx kèm message.
    - [x] Xem batch: thông tin batch + danh sách job (trạng thái, `counts`, `resultUrl`).
    - [ ] **Upload từng ảnh một request** (thay cho một request cả batch). Hiện tại `POST /api/batches` gửi mọi ảnh + whitelist trong **một** multipart: multer đọc hết vào RAM rồi mới kiểm tra tổng `BATCH_MAX_BYTES` (90MB), nên batch chỉ được 20 ảnh/90MB, giới hạn 50MB mỗi file gần như vô nghĩa, và local (không có Cloudflare chặn 100MB) có thể dồn tới 20×50MB vào RAM pod 512Mi. Đổi thành 3 bước:
        - `POST /api/batches` (`config` + 0..5 ảnh whitelist + `name` tuỳ chọn) → batch ở trạng thái `DRAFT`.
        - `POST /api/batches/:id/files`: một ảnh mỗi request (≤ `UPLOAD_MAX_BYTES`), tạo job `PENDING`. Tối đa `BATCH_MAX_FILES` (ví dụ 100). Sau `start` → 409.
        - `POST /api/batches/:id/start`: publish các job `PENDING` lên `jobs.image`. Gọi lại không publish trùng; publish lỗi thì gọi lại để gửi phần còn thiếu.
        - Bỏ `BATCH_MAX_BYTES`. UI tải lần lượt từng ảnh, có tiến độ từng file và thử lại file lỗi. Batch `DRAFT` quá 24h bị dọn như batch thường. Việc xử lý vẫn là **một job mỗi ảnh** (contract §1), không đổi.
        - Là nền cho upload video chia nhỏ (chunked, S3 multipart) ở Phase 2.
    - [ ] **Tên batch** (sau khi có upload từng ảnh): cột `name` (≤ 100 ký tự, tuỳ chọn). Bỏ trống thì đặt mặc định: tên thư mục nếu upload thư mục, không thì `Batch <ngày giờ>`. Trả `name` trong response batch, hiện trên trang batch. Đổi tên bằng `PATCH /api/batches/:id` (`{ name }`).
    - [ ] **Upload cả thư mục** (sau khi có upload từng ảnh): thêm nút "Chọn thư mục" (`<input type="file" webkitdirectory>`, lấy cả thư mục con). Lọc ở client chỉ giữ JPG/PNG/WEBP (input thư mục bỏ qua `accept`), báo số file bị bỏ qua. Một thư mục = một batch, tên batch mặc định = tên thư mục. Vẫn theo giới hạn `BATCH_MAX_FILES`: vượt thì báo trước khi tải, không cắt âm thầm. Kéo-thả thư mục (`webkitGetAsEntry()`) là [Could].
    - [x] Ảnh gốc cho thanh trượt: endpoint trả ảnh gốc từ `uploads` (stream qua backend, hoặc presigned URL ngắn hạn). Bucket `uploads` là private. (`GET /api/jobs/:id/original`)
    - [ ] Thử lại ảnh `FAILED`: tạo job `image-redact` mới cho đúng ảnh đó. Input vẫn còn trong TTL 24h, hết hạn thì trả 410. Batch có whitelist mà ảnh mẫu đã bị xoá cũng trả 410 (contract §5).
    - [x] **Xoá dữ liệu** (contract §5): `DELETE` batch xoá prefix `uploads/<batchId>/` + `results/<batchId>/` trên MinIO rồi xoá dòng PG. Xoá `uploads/<batchId>/whitelist/` ngay khi mọi job trong batch kết thúc. Tác vụ định kỳ xoá (hoặc đánh dấu `EXPIRED`) batch quá 24h. Xem batch đã xoá/hết hạn → 404/410 kèm message.
    - [x] Báo cáo batch (JSON) cơ bản: tổng số ảnh, số khuôn mặt/biển số, đã che, được whitelist, `lowConfidence`, số liệu từng ảnh, lỗi (`GET /api/batches/:id/report`, format trong `web/README.md`).
    - [ ] Báo cáo nâng cao (chưa làm): danh sách phát hiện `lowConfidence` (ảnh nào, box nào, confidence), model đã dùng, thời gian xử lý, và:
        - **Điểm tin cậy mỗi ảnh** = confidence thấp nhất trong các box đã che (ảnh không có phát hiện thì để trống, không phải 100%).
        - **Cần kiểm tra** (`needsReview`) khi ảnh có phát hiện `lowConfidence`, **hoặc** có khuôn mặt sát ngưỡng whitelist (`similarity` trong khoảng ±0.05 quanh `similarityThreshold`). Khuôn mặt được giữ nguyên mà chỉ vừa qua ngưỡng là rủi ro lớn nhất (có thể để lộ người lạ), nên ghi rõ lý do.
        - **Theo từng người trong whitelist** (`whitelistRef`): xuất hiện trong bao nhiêu ảnh, ảnh nào.
        - Ảnh `FAILED` kèm mã lỗi.
* **Kiểm chứng:** gọi API bằng curl/HTTP client cho từng trường hợp. Sai định dạng/quá dung lượng → 4xx có message.

## Milestone 3: Giao diện (01/11 → 12/11)
* **Tasks:**
    - [ ] **Trang tạo batch:** kéo-thả nhiều ảnh (preview thumbnail, bỏ từng ảnh), khu vực "Người cần giữ nguyên" để thêm ảnh chân dung whitelist, chọn đối tượng che bằng **checkbox** mặt/biển số (chọn một hoặc cả hai, bắt buộc ít nhất một; gửi `targets` tương ứng, contract đã hỗ trợ, hiện UI gửi cứng cả hai), style (Blur/Pixelate/Blackout), độ mạnh. Chọn định dạng xuất (Giữ nguyên/JPG/PNG/WEBP) và chất lượng (Tiêu chuẩn/Cao/Tối đa, mặc định Cao). Có "Nâng cao" cho các ngưỡng. Kiểm tra định dạng/dung lượng ngay trên trình duyệt.
    - [ ] **Trang batch:** dropdown (hoặc danh sách thu gọn) liệt kê các ảnh trong batch, mỗi ảnh hiện trạng thái hiện tại (`QUEUED`/`PROCESSING`/`COMPLETED`/`FAILED`). Chọn một ảnh để mở phần xem kết quả bên dưới. Không cần lưới ảnh hay thanh progress. Kèm số ảnh đã xong (x/N), nút thử lại ảnh lỗi, nút tải báo cáo JSON, "Tải tất cả" (link từng ảnh, zip để Phase 2), nút **"Xoá dữ liệu"** (có xác nhận) và dòng "tự xoá lúc <giờ>". Trạng thái tự cập nhật (polling vài giây là đủ).
    - [ ] **Xem một ảnh:** thanh trượt before/after (ảnh gốc ↔ kết quả). Danh sách phát hiện (mặt/biển số, confidence, cảnh báo `lowConfidence`, nhãn "whitelist").
    - [ ] **Ảnh mẫu xem trước:** cạnh form cấu hình có một ảnh mẫu cố định (ví dụ cảnh đường phố có người và xe) với các vùng mặt/biển số đánh dấu sẵn trong code. Khi người dùng đổi style, độ mạnh hoặc bỏ chọn mặt/biển số, ảnh mẫu vẽ lại ngay trên `<canvas>` (blur: `ctx.filter = "blur(Npx)"` trong vùng box; pixelate: vẽ thu nhỏ rồi phóng lại với `imageSmoothingEnabled = false`; blackout: `fillRect`). Không gọi server, không chạy AI. Kết quả thật của từng ảnh trả về đã đúng style đã chọn.
    - [ ] **Báo cáo trên web:** bảng tổng hợp (mặt/biển số tìm thấy, đã che, giữ nguyên theo whitelist, từng người whitelist xuất hiện mấy ảnh). Danh sách ảnh **sắp xếp ảnh `needsReview` lên đầu, tô đỏ**, kèm lý do ("confidence 0.41", "khuôn mặt giữ nguyên sát ngưỡng 0.62"), sau đó theo điểm tin cậy tăng dần. Dropdown ảnh ở trang batch dùng cùng thứ tự và màu.
    - [ ] Lỗi API và job `FAILED` (`error.code` + message) hiện rõ trên UI, không chỉ log console.
* **Kiểm chứng (thủ công):** chạy compose local + engine local (hoặc publish event tay theo contract §3), đi hết luồng trên với 5–10 ảnh có mặt người và xe.

## Milestone 4: Deploy và demo (10/11 → 15/11)
* **Tasks:**
    - [x] **[Cần Infra]** Deploy web lên `imgproc`: Deployment + Service + HTTPRoute `/` và `/api` (giữ `/results/` → MinIO), Secret (`DATABASE_URL`, MinIO credentials), memory limit. Image `socknot1000kg/imgproc-web` do CI build theo SHA. (Infra, 24/10)
    - [x] Toàn bộ cấu hình qua env. Liệt kê biến env trong `web/README.md`.
    - [x] Giới hạn upload dưới giới hạn body của Cloudflare (100MB/request ở gói free): `BATCH_MAX_BYTES` mặc định 90MB, `UPLOAD_MAX_BYTES` cho từng file. Traefik không giới hạn thêm.
    - [ ] **[Cần Engine]** Chạy luồng thật với worker engine trên lab. Ghi lại chỗ lệch contract và sửa ở phía chịu trách nhiệm (contract §6).
    - [ ] Kịch bản demo (`web/docs/demo.md`): bộ ảnh mẫu (đường phố, sự kiện có người quen), các bước thao tác, chỗ nên dừng giải thích (whitelist, chỉnh độ mạnh, báo cáo).
* **Kiểm chứng:** demo trọn luồng trên hostname public với bộ ảnh mẫu 20 ảnh. Không ảnh nào kẹt ở `QUEUED`/`PROCESSING`.

---

# Phase 2: Video, PDF và hoàn thiện (16/11 → 29/11)
Tier: **[Must]** phải có, **[Should]** nên có, **[Could]** nếu còn thời gian.

- [ ] **[Must, làm đầu tiên]** Xác thực cơ bản:
    - Đăng ký/đăng nhập. JWT access token ngắn hạn + refresh token (httpOnly cookie, xoay vòng khi refresh, thu hồi khi đăng xuất).
    - Đăng ký cần **mã đăng ký** (env `REGISTER_KEY`), nhập trên form đăng ký: chỉ người trong nhóm tạo được tài khoản. Thiếu env → tắt đăng ký.
    - Rate-limit: chặt cho đăng nhập/đăng ký (chống dò mật khẩu/mã), vừa phải cho tạo batch/upload.
    - Batch/job gắn với user. API chỉ trả và cho xoá dữ liệu của chính user đó. Link `/results/<key>` vẫn là UUID khó đoán như Phase 1.
    - **[Cần Infra]** Secret cho `JWT_SECRET` và `REGISTER_KEY`.
    - Bảng thống kê trang chủ ("Total jobs"...) chỉ đếm job của user đang đăng nhập (`GET /api/system/stats` thêm lọc `batch.userId`). Hiện tại nó đếm toàn bộ DB, không cần đăng nhập. Số liệu toàn hệ thống chỉ cho admin hoặc chuyển sang mục thống kê hệ thống bên dưới.
- [ ] **[Must]** Thư viện media (sau khi có tài khoản): liệt kê batch và ảnh/video của user (tên batch, thumbnail, trạng thái, còn bao lâu tự xoá), đổi tên batch ngay trong danh sách. Xoá từng ảnh hoặc cả batch (`DELETE /api/jobs/:id`, `DELETE /api/batches/:id`: xoá object MinIO + dòng PG). Vẫn giữ tự xoá 24h; người dùng xoá sớm được.
- [ ] **[Must]** Video: tải lên MP4 H.264 15–60s (kiểm tra thời lượng/codec), dùng chung cấu hình che + whitelist, publish `video-redact` lên `jobs.video`, theo dõi progress (worker gửi % theo khung hình), xem/tải video kết quả. **[Cần Engine]** chốt `resultSummary` của video (contract §2C).
    - Batch trộn ảnh + video (ví dụ upload cả thư mục): cùng một cấu hình, mỗi file một job, backend chọn pool theo loại file (`jobs.image`/`jobs.video`). Báo cáo và zip gộp cả hai.
    - Cần kiểm tra trong video: danh sách **thời điểm bị đánh dấu** (đối tượng theo track, khoảng thời gian, lý do). Bấm vào thì tua cả video gốc và kết quả tới đó (hai `<video>` đồng bộ `currentTime`, hoặc một player có nút bật/tắt bản gốc). **[Cần Engine]** `resultSummary` video có khoảng khung hình theo track.
- [ ] **[Must]** Xuất báo cáo PDF từ báo cáo JSON (render phía server hoặc in từ trang báo cáo).
- [ ] **[Should]** Danh sách khuôn mặt đã lưu (**opt-in**): nút "Tạo allowList/blockList" lưu ảnh mẫu theo tài khoản (`uploads/lists/<userId>/<listId>/`, private), đặt tên, dùng lại khi tạo batch. Giữ tới khi user xoá danh sách; xoá danh sách thì xoá object MinIO ngay. Không bấm lưu thì như hiện tại: ảnh mẫu thuộc batch, xoá khi batch kết thúc. **[Đổi contract]** §5 (nơi lưu + quy tắc giữ dữ liệu sinh trắc).
- [ ] **[Could]** Chế độ **blockList**: chỉ che những khuôn mặt khớp danh sách, người khác giữ nguyên. Mỗi batch chọn allow **hoặc** block. Nguy cơ: khớp trượt (góc nghiêng, thiếu sáng) thì người cần che bị **lộ** (fail-open, ngược với allowList). Bắt buộc: ngưỡng thấp hơn ở chế độ block, khuôn mặt sát ngưỡng vào `needsReview`, cảnh báo rõ trên UI. **[Cần Engine]** **[Đổi contract]** thêm chế độ cho `params.whitelist`.
- [ ] **[Should]** Whitelist biển số: nhập danh sách biển số (cả chế độ allow/block như khuôn mặt). **[Cần Engine]** cần OCR (không có OCR thì không biết biển nào là biển nào). **[Đổi contract]** thêm `whitelist.plates`.
- [ ] **[Could]** Nút **"Sửa ảnh"** trong danh sách kết quả: bật/tắt từng box, vẽ thêm box, đổi style/độ mạnh, rồi render lại ảnh đó mà không chạy lại AI. **[Cần Engine]** **[Đổi contract]** cần thêm job chỉ render theo box có sẵn. Demo không phụ thuộc lỗi của model: dùng ảnh có mặt người trên poster (bỏ che) và bảng tên/số nhà (vẽ thêm box).
- [ ] **[Should]** Tải cả batch dạng zip: `GET /api/batches/:id/download.zip` (chỉ chủ batch). Backend đọc từng kết quả `COMPLETED` từ MinIO và **stream** thẳng vào zip (`archiver`/`yazl`): không giữ trong RAM, không lưu file zip. Tên file trong zip theo tên ảnh gốc (trùng tên thì thêm hậu tố). Dùng chung cho trang batch và thư viện media. Giới hạn 100MB của Cloudflare chỉ áp cho body request nên tải về không bị ảnh hưởng.
- [ ] **[Should]** Cập nhật trạng thái real-time bằng SSE thay polling.
- [ ] **[Could]** Lưu "người cần giữ nguyên" theo tài khoản để dùng lại (thay vì tải lại mỗi batch).
- [ ] **[Could]** Trang thống kê hệ thống cho buổi bảo vệ: số job theo trạng thái, độ dài hàng đợi từng pool, số worker. **[Cần Infra]** nguồn số liệu (NATS monitoring/KEDA).

---

## Tổng hợp việc cần phối hợp
| Khi nào | Với ai | Việc |
|---|---|---|
| M1 (28/10) | Engine | Xác nhận contract §2/§3 mới (`image-redact`, `detections`, `counts`, `params.output.quality`) và cách xử lý worker chết (§4: worker luôn gửi event kết thúc, `WORKER_CRASHED`) trước khi code |
| M2 (04/11) | Engine | Chốt ngưỡng mặc định (`confidenceThreshold`, `reviewThreshold`, `similarityThreshold`) sau khi engine thử |
| M4 (10/11) | Infra | Deploy web, Secret, HTTPRoute, giới hạn upload, CI image |
| M4 (12/11) | Engine + Infra | Chạy luồng thật trên lab |
| Phase 2 (16/11) | Infra | Secret `JWT_SECRET`, `REGISTER_KEY` |
| Phase 2 | Engine | `resultSummary` của video, OCR cho whitelist biển số |
