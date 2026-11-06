# Kế hoạch Web (Frontend + Backend): Cloud-Native Privacy Service

Contract (nguồn sự thật): `docs/integration-contracts.md`. Tiến độ chung: `docs/milestones.md`.
Ký hiệu trong task:

- **[Cần Engine]**: phải thống nhất với Huy Đức trước.
- **[Cần Infra]**: nhờ Đạt.
- **[Đổi contract]**: thay đổi `docs/integration-contracts.md`, phải báo cả nhóm.

## Quy tắc để không giẫm chân nhau:

- **Prisma:** mỗi tính năng tự thêm field/model và migration của mình. `git pull` **trước** khi chạy `prisma migrate dev`; không sửa migration của người
  khác. Hai migration cùng ngày thì người merge sau tạo lại migration của mình.
- **Backend:** mỗi tính năng có `routes/<x>.routes.ts` + controller + service + repository riêng. `app.ts` chỉ thêm một dòng đăng ký router.
- **Frontend:** mỗi tính năng có component/trang riêng. `main.tsx` chỉ thêm một dòng gắn trang. Hàm gọi API tách theo tính năng (`api/batches.ts`,
  `api/reports.ts`...), không cùng sửa một file.
- Mỗi tính năng một branch, PR nhỏ. Endpoint mới hoặc đổi ghi vào `web/README.md` trong cùng PR.
- Phase 2: **tài khoản làm đầu tiên** (thêm `userId` cho batch, chặn API). Mọi tính năng merge sau đó phải chỉ trả/xoá dữ liệu của chính user. Đức Huy
  bắt đầu video trong lúc Đạt làm tài khoản.

---

# Phase 1: Ẩn danh hoá bộ ảnh (24/10 → 15/11)

**Hoàn thành khi:** trên `https://imgproc.sock1000kg.io.vn`, người dùng tải lên một bộ ảnh + ảnh chân dung whitelist, chọn cách che (thấy trước hiệu ứng trên ảnh mẫu) → xem trạng thái từng ảnh → xem before/after → tải ảnh và báo cáo JSON.

## Milestone 1: Mô hình dữ liệu batch (24/10 → 30/10)

- **Tasks:**
  - [x] **[Bug, làm trước]** Backend ngừng nhận event sau batch đầu tiên. Trong `consumeEvents` (`backend/src/messaging.ts`), `pull()` chỉ được gọi một lần: `for await (const message of subscription)` không bao giờ thoát sau khi batch hết/expire, nên không tới được lần `pull()` tiếp theo. Trên lab (25/10): consumer `backend-job-events` có `last_active` = lúc pod khởi động, event `COMPLETED` nằm lại trong `JOB_EVENTS`, UI không cập nhật. Sửa bằng API consumer của nats.js (`jetStream.consumers.get("JOB_EVENTS", "backend-job-events")` → `consumer.consume()`, thư viện tự pull liên tục), hoặc gọi `pull()` theo timer ngoài vòng lặp. **Kiểm chứng:** chạy backend, đợi > 30s, rồi publish tay vài event → tất cả đều được áp dụng. Lặp lại sau vài phút. (Task 14)
  - [x] Migration mới: bảng `batches` (id, trạng thái tổng, cấu hình che mặc định, danh sách key ảnh whitelist, created_at) và `jobs` thêm `batch_id`, `params` (JSONB), `detections` (lấy từ `resultSummary`). Bỏ các loại job cũ khỏi validate. → Prisma: `batches` (config JSONB, whitelist_keys, whitelist_deleted_at) + `jobs` (batch_id, `result_summary` JSONB chứa `detections`).
  - [x] Đường dẫn object theo contract §5: `uploads/<batchId>/<jobId>/input.<ext>`, `uploads/<batchId>/whitelist/face-<n>.<ext>`, `results/<batchId>/<jobId>/result.<ext>`.
  - [x] Command `image-redact` đúng contract §2 (zod schema cho `params.redaction`, `whitelist`). Event `COMPLETED` lưu `resultSummary` (`counts`, `detections`, `model`).
  - [x] Trạng thái batch suy ra từ các job: `PROCESSING` khi còn job chưa xong, `COMPLETED` khi tất cả xong, `PARTIAL` khi có job `FAILED`. Không lưu trùng logic ở hai nơi.
  - [x] Giữ idempotency (contract §8). Event `PROCESSING` đến sau trạng thái kết thúc thì bỏ qua. Viết vài unit test cho trường hợp trùng/đến trễ. Hiển thị `WORKER_CRASHED` như lỗi thường (có nút thử lại). Backend **không** tự đặt timeout cho job (contract §4). (backend xong; nút thử lại thuộc M2/M3)
- **Kiểm chứng:** tạo batch 3 ảnh bằng API → 3 message trên `jobs.image` (xem bằng `nats sub` hoặc `nats stream view IMAGE_JOBS`). Publish tay 3 event `COMPLETED` → batch chuyển `COMPLETED`.

## Milestone 2: API (28/10 → 04/11)

Đường dẫn cụ thể do Web quyết định. Contract §9 chỉ liệt kê khả năng cần có.

- **Tasks:**
  - [x] Tạo batch (nay theo 3 bước ở task upload từng ảnh bên dưới): ảnh JPG/PNG/WEBP (giới hạn số lượng + dung lượng mỗi file), 0..5 `whitelist` (ảnh chân dung), `config` (targets, style, strength, padding, `quality` (`standard`/`high`/`max`) → `params.output.quality`, `format` (`original`/`jpg`/`png`/`webp`) → đuôi của `output.key`, confidenceThreshold, reviewThreshold, similarityThreshold). Validate rõ ràng, lỗi 4xx kèm message.
  - [x] Xem batch: thông tin batch + danh sách job (trạng thái, `counts`, `resultUrl`).
  - [x] **[Đạt]** **Upload từng ảnh một request** (thay cho một multipart cả batch, trước đây bị giới hạn 20 ảnh/90MB và dồn hết vào RAM pod). 3 bước:
    - `POST /api/batches` (`config` + 0..5 ảnh whitelist + `name` tuỳ chọn) → batch ở trạng thái `DRAFT`.
    - `POST /api/batches/:id/files`: một ảnh mỗi request (≤ `UPLOAD_MAX_BYTES`), tạo job `PENDING`. Tối đa `BATCH_MAX_FILES` (ví dụ 100). Sau `start` → 409.
    - `POST /api/batches/:id/start`: publish các job `PENDING` lên `jobs.image`. Gọi lại không publish trùng; publish lỗi thì gọi lại để gửi phần còn thiếu.
    - Bỏ `BATCH_MAX_BYTES`. UI tải lần lượt từng ảnh, có tiến độ từng file và thử lại file lỗi. Batch `DRAFT` quá 24h bị dọn như batch thường. Việc xử lý vẫn là **một job mỗi ảnh** (contract §1), không đổi.
    - Là nền cho upload video chia nhỏ (chunked, S3 multipart) ở Phase 2.
  - [x] **[Đạt]** **Tên batch** (sau khi có upload từng ảnh): cột `name` (≤ 100 ký tự, tuỳ chọn). Bỏ trống thì đặt mặc định: tên thư mục nếu upload thư mục, không thì `Batch <ngày giờ>`. Trả `name` trong response batch, hiện trên trang batch. Đổi tên bằng `PATCH /api/batches/:id` (`{ name }`).
  - [x] **[Đạt]** **Upload cả thư mục** (sau khi có upload từng ảnh): thêm nút "Chọn thư mục" (`<input type="file" webkitdirectory>`, lấy cả thư mục con). Lọc ở client chỉ giữ JPG/PNG/WEBP (input thư mục bỏ qua `accept`), báo số file bị bỏ qua. Một thư mục = một batch, tên batch mặc định = tên thư mục. Vẫn theo giới hạn `BATCH_MAX_FILES`: vượt thì báo trước khi tải, không cắt âm thầm. Kéo-thả thư mục (`webkitGetAsEntry()`) là [Could].
  - [x] Ảnh gốc cho thanh trượt: endpoint trả ảnh gốc từ `uploads` (stream qua backend, hoặc presigned URL ngắn hạn). Bucket `uploads` là private. (`GET /api/jobs/:id/original`)
  - [x] **[Đức Huy]** Thử lại ảnh `FAILED`: tạo job `image-redact` mới cho đúng ảnh đó. Phase 1: input còn trong TTL 24h thì thử lại được, hết hạn thì trả 410 (từ Phase 2 không còn giới hạn này, xem thư viện media). Batch có whitelist mà ảnh mẫu đã bị xoá cũng trả 410 (contract §5).
  - [x] **Xoá dữ liệu** (contract §5): `DELETE` batch xoá prefix `uploads/<batchId>/` + `results/<batchId>/` trên MinIO rồi xoá dòng PG. Xoá `uploads/<batchId>/whitelist/` ngay khi mọi job trong batch kết thúc. Tác vụ định kỳ xoá (hoặc đánh dấu `EXPIRED`) batch quá 24h. Xem batch đã xoá/hết hạn → 404/410 kèm message.
  - [x] Báo cáo batch (JSON) cơ bản: tổng số ảnh, số khuôn mặt/biển số, đã che, được whitelist, `lowConfidence`, số liệu từng ảnh, lỗi (`GET /api/batches/:id/report`, format trong `web/README.md`).
  - [x] **[Đạt]** Báo cáo nâng cao: danh sách phát hiện `lowConfidence` (ảnh nào, box nào, confidence), model đã dùng, thời gian xử lý, và:
    - **Điểm tin cậy mỗi ảnh** = confidence thấp nhất trong các box đã che (ảnh không có phát hiện thì để trống, không phải 100%).
    - **Cần kiểm tra** (`needsReview`) khi ảnh có phát hiện `lowConfidence`, **hoặc** có khuôn mặt sát ngưỡng whitelist (`similarity` trong khoảng ±0.05 quanh `similarityThreshold`). Khuôn mặt được giữ nguyên mà chỉ vừa qua ngưỡng là rủi ro lớn nhất (có thể để lộ người lạ), nên ghi rõ lý do.
    - **Theo từng người trong whitelist** (`whitelistRef`): xuất hiện trong bao nhiêu ảnh, ảnh nào.
    - Ảnh `FAILED` kèm mã lỗi.
- **Kiểm chứng:** gọi API bằng curl/HTTP client cho từng trường hợp. Sai định dạng/quá dung lượng → 4xx có message.

## Milestone 3: Giao diện (01/11 → 12/11)

- **Tasks:**
  - [x] **[Đức Huy]** **Trang tạo batch:** kéo-thả nhiều ảnh (preview thumbnail, bỏ từng ảnh), khu vực "Người cần giữ nguyên" để thêm ảnh chân dung whitelist, chọn đối tượng che bằng **checkbox** mặt/biển số (chọn một hoặc cả hai, bắt buộc ít nhất một; gửi `targets` tương ứng, contract đã hỗ trợ, hiện UI gửi cứng cả hai), style (Blur/Pixelate/Blackout), độ mạnh. Chọn định dạng xuất (Giữ nguyên/JPG/PNG/WEBP) và chất lượng (Tiêu chuẩn/Cao/Tối đa, mặc định Cao). Có "Nâng cao" cho các ngưỡng. Kiểm tra định dạng/dung lượng ngay trên trình duyệt.
  - [x] **[Đức Huy]** **Trang batch:** nút "Tải tất cả" (link từng ảnh, zip để Phase 2). Dòng "tự xoá lúc <giờ>" hiện giờ cụ thể thay cho "sau 24 giờ".
  - [x] **[Đức Huy]** **Xem một ảnh:** thanh trượt before/after (ảnh gốc ↔ kết quả). Danh sách phát hiện (mặt/biển số, confidence, cảnh báo `lowConfidence`, nhãn "whitelist").
  - [x] **[Đức Huy]** **Ảnh mẫu xem trước:** thay hình giả trong `PreviewCanvas` bằng một ảnh mẫu cố định (đường phố có người và xe) với box mặt/biển số viết sẵn trong code. Vẽ hiệu ứng thật trên `<canvas>` (blur: `ctx.filter = "blur(Npx)"`; pixelate: thu nhỏ rồi phóng lại với `imageSmoothingEnabled = false`; blackout: `fillRect`), theo checkbox mặt/biển số. Độ mạnh tính theo kích thước box giống engine (contract §2, chờ chốt `strength` tương đối với Engine).
  - [x] **[Đức Huy]** **Báo cáo trên web:** hiện từng người whitelist xuất hiện mấy ảnh, ảnh nào (`whitelistPeople`). Danh sách ảnh ở trang batch dùng cùng thứ tự với báo cáo (FAILED, needsReview, confidence thấp, thời gian tạo).
  - [x] **[Đức Huy]** Ảnh `FAILED` hiện `error.code` + message của job (hiện chỉ ghi "This image failed processing.").
- **Kiểm chứng (thủ công):** chạy compose local + engine local (hoặc publish event tay theo contract §3), đi hết luồng trên với 5–10 ảnh có mặt người và xe.

## Milestone 4: Deploy và demo (10/11 → 15/11)

- **Tasks:**
  - [x] **[Cần Infra]** Deploy web lên `imgproc`: Deployment + Service + HTTPRoute `/` và `/api` (giữ `/results/` → MinIO), Secret (`DATABASE_URL`, MinIO credentials), memory limit. Image `socknot1000kg/imgproc-web` do CI build theo SHA. (Infra, 24/10)
  - [x] Toàn bộ cấu hình qua env. Liệt kê biến env trong `web/README.md`.
  - [x] Giới hạn upload dưới giới hạn body của Cloudflare (100MB/request ở gói free): mỗi request một ảnh ≤ `UPLOAD_MAX_BYTES` (50MB), `BATCH_MAX_FILES` ảnh mỗi batch. Traefik không giới hạn thêm.
  - [x] **[Đạt + Đức Huy]** **[Cần Engine]** Chạy luồng thật với worker engine trên lab. Ghi lại chỗ lệch contract và sửa ở phía chịu trách nhiệm (contract §6).
- **Kiểm chứng:** demo trọn luồng trên hostname public với bộ ảnh mẫu 20 ảnh. Không ảnh nào kẹt ở `QUEUED`/`PROCESSING`.

---

# Phase 2: Video, PDF và hoàn thiện (16/11 → 29/11)

Tier: **[Must]** phải có, **[Should]** nên có, **[Could]** nếu còn thời gian.

- [x] **[Đức Huy]** **[Must, làm đầu tiên]** Xác thực cơ bản:
  - Đăng ký/đăng nhập. JWT access token ngắn hạn + refresh token (httpOnly cookie, xoay vòng khi refresh, thu hồi khi đăng xuất).
  - Đăng ký cần **mã đăng ký** (env `REGISTER_KEY`), nhập trên form đăng ký: chỉ người trong nhóm tạo được tài khoản. Thiếu env → tắt đăng ký.
  - Rate-limit: chặt cho đăng nhập/đăng ký (chống dò mật khẩu/mã), vừa phải cho tạo batch/upload.
  - Batch/job gắn với user. API chỉ trả và cho xoá dữ liệu của chính user đó. Link `/results/<key>` vẫn là UUID khó đoán như Phase 1.
  - **[Cần Infra]** Secret cho `JWT_SECRET` và `REGISTER_KEY`.
  - Bảng thống kê trang chủ ("Total jobs"...) chỉ đếm job của user đang đăng nhập (`GET /api/system/stats` thêm lọc `batch.userId`). Hiện tại nó đếm toàn bộ DB, không cần đăng nhập. Số liệu toàn hệ thống chỉ cho admin hoặc chuyển sang mục thống kê hệ thống bên dưới.
- [x] **[Đạt]** **[Must]** Thư viện media (sau khi có tài khoản): liệt kê batch và ảnh/video của user (tên batch, thumbnail, trạng thái), đổi tên batch ngay trong danh sách. Xoá từng ảnh hoặc cả batch (`DELETE /api/jobs/:id`, `DELETE /api/batches/:id`: xoá object MinIO + dòng PG).
  - Lưu trữ theo contract §5 bản Phase 2: ảnh gốc và kết quả **giữ tới khi user xoá** (xoá batch/ảnh là xoá cả hai). Tác vụ dọn định kỳ không xoá theo 24h nữa, chỉ theo env `RETENTION_DAYS` (trống = giữ mãi). Thử lại ảnh lỗi và "Sửa ảnh" không còn giới hạn 24h. Hiện dung lượng đã dùng của user trong thư viện. **[Cần Infra]** bỏ lifecycle của cả hai bucket cùng lúc với bản này.
  - [x] [Should] Chạy lại một batch với cấu hình khác (style, độ mạnh, đối tượng, whitelist) từ ảnh gốc đã lưu: tạo batch mới, không tải lên lại.
- [ ] **[Đức Huy]** **[Must]** Video: tải lên MP4 H.264 15–60s (kiểm tra thời lượng/codec), dùng chung cấu hình che + whitelist, publish `video-redact` lên `jobs.video`, theo dõi progress (worker gửi % theo khung hình), xem/tải video kết quả. **[Cần Engine]** chốt `resultSummary` của video (contract §2B, §3 B2).
  - Batch trộn ảnh + video (ví dụ upload cả thư mục): cùng một cấu hình, mỗi file một job, backend chọn pool theo loại file (`jobs.image`/`jobs.video`). Báo cáo và zip gộp cả hai.
  - Cần kiểm tra trong video: danh sách **thời điểm bị đánh dấu** (đối tượng theo track, khoảng thời gian, lý do). Bấm vào thì tua cả video gốc và kết quả tới đó (hai `<video>` đồng bộ `currentTime`, hoặc một player có nút bật/tắt bản gốc). **[Cần Engine]** `resultSummary` video có khoảng khung hình theo track.
- [ ] **[Đức Huy]** **[Could]** Xuất báo cáo PDF từ báo cáo JSON (render phía server hoặc in từ trang báo cáo).
- [x] **[Đạt]** **[Should]** Danh sách khuôn mặt đã lưu (**opt-in**, chỉ allowList, blockList đã bỏ): lưu ảnh mẫu theo tài khoản (`uploads/lists/<userId>/<listId>/`, private), đặt tên, dùng lại khi tạo batch hoặc chạy lại batch. Giữ tới khi user xoá danh sách; xoá danh sách thì xoá object MinIO ngay. Không bấm lưu thì như hiện tại: ảnh mẫu thuộc batch, xoá khi batch kết thúc. **[Đổi contract]** §5 (nơi lưu + quy tắc giữ dữ liệu sinh trắc).
- [~] **[Đạt]** **[Should]** **Bỏ** (không đáng công, chưa có use case) Chế độ **blockList**: chỉ che những khuôn mặt khớp danh sách, người khác giữ nguyên. Mỗi batch chọn allow **hoặc** block. Nguy cơ: khớp trượt (góc nghiêng, thiếu sáng) thì người cần che bị **lộ** (fail-open, ngược với allowList). Bắt buộc: ngưỡng thấp hơn ở chế độ block, khuôn mặt sát ngưỡng vào `needsReview`, cảnh báo rõ trên UI. **[Cần Engine]** **[Đổi contract]** thêm chế độ cho `params.whitelist`.
- [ ] **[Đức Huy]** **[Should]** Whitelist biển số: nhập danh sách biển số được giữ nguyên (chỉ allowList, chế độ block đã bỏ). **[Cần Engine]** cần OCR (không có OCR thì không biết biển nào là biển nào). **[Đổi contract]** thêm `whitelist.plates`.
- [ ] **[Đức Huy]** **[Should]** Nút **"Sửa ảnh"** trong danh sách kết quả: bật/tắt từng box, vẽ thêm box, đổi style/độ mạnh, rồi render lại ảnh đó mà không chạy lại AI. **[Cần Engine]** **[Đổi contract]** cần thêm job chỉ render theo box có sẵn. Demo không phụ thuộc lỗi của model: dùng ảnh có mặt người trên poster (bỏ che) và bảng tên/số nhà (vẽ thêm box).
- [x] **[Đạt]** **[Should]** Tải cả batch dạng zip: `GET /api/batches/:id/download.zip` (chỉ chủ batch). Backend đọc từng kết quả `COMPLETED` từ MinIO và **stream** thẳng vào zip (`archiver`/`yazl`): không giữ trong RAM, không lưu file zip. Tên file trong zip theo tên ảnh gốc (trùng tên thì thêm hậu tố). Dùng chung cho trang batch và thư viện media. Giới hạn 100MB của Cloudflare chỉ áp cho body request nên tải về không bị ảnh hưởng.
- [ ] **[Đạt]** **[Must]** **Đồng bộ công thức `strength` với Engine** (sau khi Engine đổi sang tương đối theo kích thước box, xem `engine/docs/plan.md` Phase 2): preview (`PreviewCanvas`) dùng cùng công thức (blur: bán kính = `strength`% chiều rộng box sau `padding`; pixelate: `strength` ô theo chiều rộng box), slider đổi khoảng (blur 1–50, pixelate 3–32) và default (blur 15, pixelate 8) ở form và `batchConfigToFormConfig`.
- [ ] **[Đức Huy]** **[Could]** Trang thống kê hệ thống cho buổi bảo vệ: số job theo trạng thái, độ dài hàng đợi từng pool, số worker. **[Cần Infra]** nguồn số liệu (NATS monitoring/KEDA).
- [ ] **[Should, sau khi xong các tính năng chính]** **Chọn chế độ khi tạo batch** ("Nhanh" / "Chính xác" / "Riêng tư tối đa"): select trong form cấu hình, gửi theo cấu hình batch thành `params.detection.mode` (`fast` | `accurate` | `max_privacy`, mặc định `fast`). Mỗi chế độ là một cặp model + ngưỡng do Engine map ("Riêng tư tối đa" = ngưỡng thấp, che dư có chủ đích). Báo cáo ghi model và ngưỡng đã dùng (field `models` đã có). Model cho từng chế độ chưa chốt; số liệu: `engine/training/bench/comparison.md`, `infra/bench/results/comparison.md`. **[Cần Engine]** **[Đổi contract]** §2 thêm `params.detection.mode`.

---

## Tổng hợp việc cần phối hợp

| Khi nào         | Với ai         | Việc                                                                                                                                                                                          |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 (28/10)      | Engine         | Xác nhận contract §2/§3 mới (`image-redact`, `detections`, `counts`, `params.output.quality`) và cách xử lý worker chết (§4: worker luôn gửi event kết thúc, `WORKER_CRASHED`) trước khi code |
| M2 (04/11)      | Engine         | Chốt ngưỡng mặc định (`confidenceThreshold`, `reviewThreshold`, `similarityThreshold`) sau khi engine thử                                                                                     |
| M4 (10/11)      | Infra          | Deploy web, Secret, HTTPRoute, giới hạn upload, CI image                                                                                                                                      |
| M4 (12/11)      | Engine + Infra | Chạy luồng thật trên lab                                                                                                                                                                      |
| Phase 2 (16/11) | Infra          | Secret `JWT_SECRET`, `REGISTER_KEY`                                                                                                                                                           |
| Phase 2         | Engine         | `resultSummary` của video, OCR cho whitelist biển số                                                                                                                                          |
| Phase 2 (cuối)  | Engine         | Chọn chế độ theo job (`params.detection.mode`: model + ngưỡng)                                                                                                                                |
