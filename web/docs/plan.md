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
    - `POST /api/batches/:id/files`: một ảnh mỗi request (≤ `IMAGE_UPLOAD_MAX_BYTES`), tạo job `PENDING`. Tối đa `BATCH_MAX_FILES` (mặc định 1000). Sau `start` → 409.
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
  - [x] Giới hạn upload dưới giới hạn body của Cloudflare (100MB/request ở gói free): mỗi request một ảnh ≤ `IMAGE_UPLOAD_MAX_BYTES` (50MB), `BATCH_MAX_FILES` ảnh mỗi batch. Traefik không giới hạn thêm.
  - [x] **[Đạt + Đức Huy]** **[Cần Engine]** Chạy luồng thật với worker engine trên lab. Ghi lại chỗ lệch contract và sửa ở phía chịu trách nhiệm (contract §6).
- **Kiểm chứng:** demo trọn luồng trên hostname public với bộ ảnh mẫu 20 ảnh. Không ảnh nào kẹt ở `QUEUED`/`PROCESSING`.

---

# Phase 2: Video, PDF và hoàn thiện (16/11 → 29/11)

Tier: **[Must]** tính năng cốt lõi, thiếu thì app hỏng hoặc quá phức tạp; **[Should]** không làm hỏng app nhưng có rủi ro; **[Could]** có thì tốt.

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
- [x] **[Đạt]** **[Should]** Danh sách khuôn mặt đã lưu (**opt-in**, chỉ allowList, blockList đã bỏ): lưu ảnh mẫu theo tài khoản (`uploads/lists/<userId>/<listId>/`, private), đặt tên, dùng lại khi tạo batch hoặc chạy lại batch. Giữ tới khi user xoá danh sách; xoá danh sách thì xoá object MinIO ngay. Không bấm lưu thì như hiện tại: ảnh mẫu thuộc batch, xoá khi batch kết thúc. **[Đổi contract]** §5 (nơi lưu + quy tắc giữ dữ liệu sinh trắc).
- [x] **[Đạt]** **[Should]** **`whitelistDeletedAt` che mất lỗi xoá, ảnh sinh trắc có thể còn lại trong storage.** Trong `checkAndCleanBatchWhitelist`, xoá storage lỗi chỉ được ghi log mà batch vẫn bị đánh dấu đã xoá, nên các event sau bỏ qua. Chỉ đặt timestamp khi xoá storage thành công, để event job tiếp theo của batch đó thử lại. Nếu batch không còn event nào thì vẫn cần tác vụ định kỳ thử lại.
- [~] **[Đạt]** **[Should]** **Bỏ** (không đáng công, chưa có use case) Chế độ **blockList**: chỉ che những khuôn mặt khớp danh sách, người khác giữ nguyên. Mỗi batch chọn allow **hoặc** block. Nguy cơ: khớp trượt (góc nghiêng, thiếu sáng) thì người cần che bị **lộ** (fail-open, ngược với allowList). Bắt buộc: ngưỡng thấp hơn ở chế độ block, khuôn mặt sát ngưỡng vào `needsReview`, cảnh báo rõ trên UI. **[Cần Engine]** **[Đổi contract]** thêm chế độ cho `params.whitelist`.
- [x] **[Đạt]** **[Should]** Tải cả batch dạng zip: `GET /api/batches/:id/download.zip` (chỉ chủ batch). Backend đọc từng kết quả `COMPLETED` từ MinIO và **stream** thẳng vào zip (`archiver`/`yazl`): không giữ trong RAM, không lưu file zip. Tên file trong zip theo tên ảnh gốc (trùng tên thì thêm hậu tố). Dùng chung cho trang batch và thư viện media. Giới hạn 100MB của Cloudflare chỉ áp cho body request nên tải về không bị ảnh hưởng.
- [x] **[Đạt]** **[Must]** **Đồng bộ công thức `strength` với Engine** (Engine đã đổi sang tương đối theo kích thước box, commit `4fb426a`): preview (`PreviewCanvas`) dùng cùng công thức (blur: bán kính = `strength`% chiều rộng box sau `padding`; pixelate: `strength` ô theo chiều rộng box), slider đổi khoảng (blur 1–50, pixelate 3–32) và default (blur 15, pixelate 8) ở form, `batchConfigToFormConfig` và `parseBatchConfig` của backend. Đã hoàn thành đồng bộ với Engine Contract §2: blur 1–50 (default 15, radius = strength% ROI width) và pixelate 3–32 (default 8, mosaic cells across ROI width).
- [x] **[Đức Huy]** **[Should]** **Dọn theo hạn có thể xoá batch đang chạy.** `getExpiredBatches` chỉ xét tuổi của batch, nên khi đặt `RETENTION_DAYS` có thể xoá batch còn đang xử lý. Thêm điều kiện loại batch còn job chưa kết thúc.
- [x] **[Đạt]** **[Should]** **Xoá khuôn mặt trong danh sách theo vị trí có thể xoá nhầm ảnh.** `DELETE /api/face-lists/:id/faces/:n` tính `n` theo danh sách lúc request tới, nên request lặp lại hoặc tab cũ sẽ xoá khuôn mặt khác. Cách sửa đề xuất, không cần migration:
  - Dùng tên file của storage key, bỏ phần mở rộng, làm ID (`face-1`, `face-<uuid>`). Giá trị này đã duy nhất trong một danh sách.
  - Thêm `faceIds` vào `FaceListItemDTO`, cùng thứ tự với `faceNames`.
  - Đổi route thành `GET` và `DELETE /api/face-lists/:id/faces/:faceId`. So khớp với keys của chính danh sách, không bao giờ dựng đường dẫn storage từ input. ID không tồn tại trả 404.
  - Frontend: `api.ts`, `SavedFaceListsPanel`, `FaceListThumbnails`, `FaceListViewer` truyền ID khi gọi API; `n` chỉ còn để hiển thị.
  - Thêm test: xoá cùng một ID hai lần chỉ mất một khuôn mặt, lần hai trả 404.
  - `/api/batches/:id/whitelist/:n` giữ nguyên `n` vì danh sách tham chiếu của batch không đổi sau khi tạo.
- [x] **[Đạt]** **[Must, làm trước task Video]** **Presigned URL cho mọi object trong MinIO.** Một đường duy nhất cho kết quả, ảnh gốc, video gốc và ảnh mẫu whitelist/danh sách. Backend kiểm tra chủ sở hữu rồi mới cấp URL. Sau khi xong thì xoá `streamPrivateObject` và `usePrivateImage`. **Zip vẫn stream qua backend** vì zip được tạo theo yêu cầu, không có object để ký. **[Đổi contract]** §5, gồm cả dòng danh sách khuôn mặt "không bao giờ public". **[Cần Infra]**
  - _Tiến độ:_ Hoàn thành (Task 87: backend endpoints; Task 88: chuyển frontend dùng hook `usePresignedUrl`, dọn dẹp các đường stream cũ và loại bỏ `resultUrl` khỏi job DTO). Đánh đổi đã chấp nhận: quyền chỉ được kiểm tra lúc cấp URL, URL ký hết hạn sau TTL và đăng xuất không huỷ được URL đã cấp.
  - **Lý do:** tua video cần HTTP Range, MinIO hỗ trợ sẵn, còn stream qua backend thì phải tự cài. Khi video gốc đã dùng URL ký thì để ảnh gốc stream riêng không còn đem lại nhiều an toàn hơn, chỉ thêm một đường phải duy trì. Link `/results/<key>` hiện không cần đăng nhập và không hết hạn, mà kết quả vẫn có thể lộ khuôn mặt được giữ lại hoặc bị model bỏ sót.
  - **Thời hạn mặc định:** kết quả khoảng 1 giờ; ảnh gốc, video gốc và ảnh mẫu khoảng 5 phút.
  - **Đánh đổi đã chấp nhận:** quyền chỉ được kiểm tra lúc cấp URL. Đăng xuất không huỷ được URL đã cấp (xoá object thì URL hết tác dụng), và URL ký có thể xuất hiện trong log của proxy.
  - **Không ký trên đường polling (đề xuất):** bỏ `resultUrl` khỏi `GET /api/batches/:id`, thêm `GET /api/jobs/:id/result-url` trả `{ url, expiresAt }` và có tuỳ chọn URL tải về. Endpoint ảnh gốc và ảnh mẫu cũng trả URL thay vì stream. `GET /api/batches` không bị polling nên có thể ký luôn trang thumbnail.
  - **Frontend:** hook lấy URL và dùng lại theo ID của object đến khi gần hết hạn hoặc tải lỗi. Nút tải về lấy URL lúc bấm. Retry tạo job ID và output key mới nên kết quả của một job không đổi, không cần tín hiệu làm mới khác.
  - **Cache của Cloudflare:** Cloudflare có thể cache `.jpg`, `.png`, `.webp`, `.mp4` theo mặc định (chưa kiểm chứng), nên ảnh/video gốc chưa che có thể nằm ở edge. Ký `response-cache-control: private, no-store` cho ảnh gốc, video gốc và ảnh mẫu, rồi xem header `cf-cache-status` để xác nhận.
  - **Hết hạn khi đang xem video:** trình duyệt gửi Range request mới khi tua, nên URL có thể hết hạn giữa chừng, kể cả khi clip đang tạm dừng. Khi player báo lỗi thì lấy URL mới và khôi phục `currentTime`. Ảnh không gặp vấn đề này vì đã tải xong là vẫn hiển thị.
  - **Kiểm tra:** thử tua video qua tunnel bằng clip thật, vì Range qua tunnel chưa được xác nhận.
  - **Env cho mỗi deployment:** endpoint public của MinIO (tên tạm `S3_PUBLIC_ENDPOINT`, là URL đầy đủ), có thể thay `PUBLIC_RESULTS_BASE_URL`. Chỉ trình duyệt dùng địa chỉ này; backend ký cho nó nhưng vẫn gọi MinIO nội bộ.
    - Lab: `https://blob-imgproc.sock1000kg.io.vn`, cần hostname trên tunnel và HTTPRoute. Xác nhận zone Cloudflare trước, vì Universal SSL miễn phí chỉ phủ một cấp dưới zone.
    - Compose: mặc định `http://localhost:9000`. Truy cập qua LAN thì đổi sang địa chỉ máy; app chạy HTTPS thì MinIO cũng cần HTTPS để tránh mixed content.
  - **Tài liệu self-host:** chữ ký gồm cả host và path nên proxy trước MinIO không được sửa hai phần này. Nếu MinIO ở hostname khác thì thuộc tính `download` bị bỏ qua, nên đặt tên file bằng `response-content-disposition` có ký.
    - Sản phẩm: không làm gì riêng cho Cloudflare, chỉ nêu rủi ro trong tài liệu self-host. Lab: giữ route Tailscale làm phương án dự phòng; URL chỉ ký cho một hostname nên phải trỏ endpoint sang route đó. Tránh Stream và R2 vì sẽ đưa ảnh/video gốc chưa che lên bên thứ ba.
  - **Thứ tự deploy:** backend trước, sau đó mới bỏ anonymous policy của bucket `results`. Sửa `infra/smoke-test.sh` vì script đang kiểm tra truy cập ẩn danh.
- [x] **[Đức Huy]** **[Must, làm trước task Video]** **Upload theo từng phần (chunked) và giới hạn dung lượng theo deployment.** Clip điện thoại 60 giây khoảng 100–130MB ở 1080p và vài trăm MB ở 4K, vượt giới hạn 100MB mỗi request của Cloudflare (gói Free/Pro), kể cả khi gửi thẳng tới hostname của MinIO. Vì vậy upload theo phần với S3 multipart: mỗi phần nhỏ hơn giới hạn, MinIO ghép lại, mất mạng thì chỉ gửi lại phần còn thiếu. Route upload từng file hiện có đã được làm để làm nền cho việc này.
  - **Cách làm (đã chọn):** trình duyệt gửi từng phần tới backend (cùng origin, không cần CORS, kiểm tra quyền như mọi API khác), backend stream phần đó vào multipart của MinIO. Dựa trên route upload từng file hiện có. Không gửi thẳng tới MinIO bằng URL ký, vì cách đó cần CORS trên MinIO và chỉ đáng khi nhiều người cùng upload video lớn.
  - `IMAGE_UPLOAD_MAX_BYTES` (env có sẵn, mặc định 50MB) là giới hạn mỗi file của từng deployment. Backend từ chối ngay khi bắt đầu nếu dung lượng khai báo vượt mức, và kiểm tra lại dung lượng thật khi hoàn tất.
  - Bỏ hard-code `MAX_FILE_BYTES` (50MB) trong `file-selection.ts` và `FileDropzone.tsx`, giống như đã bỏ giới hạn số file: frontend hiện lý do backend trả về.
  - Không buffer cả file bằng `multer.memoryStorage()`: `web` chỉ có 512Mi. Mỗi lúc chỉ giữ tối đa một phần trong bộ nhớ, nên kích thước phần cần nhỏ (ví dụ 8–16MB).
  - Thông báo lỗi nói rõ dung lượng tối đa và gợi ý cắt ngắn hoặc nén lại.
- [x] **[Đức Huy]** **[Must]** Video: tải lên MP4 H.264 15–60s (kiểm tra thời lượng/codec), dùng chung cấu hình che + whitelist, publish `video-redact` lên `jobs.video`, theo dõi progress (worker gửi % theo khung hình), xem/tải video kết quả. `resultSummary` của video Engine đã có (contract §3 B2). Làm sau task presigned URL và task upload theo phần.
  - _Đã chạy thật (14/11, Web + NATS + Engine + MinIO local):_ video 1080p/30fps dài 21s tải lên theo phần, tiến độ cập nhật từ 20% tới 100% (DETECTING → MATCHING_PLATE_WHITELIST → RENDERING), kết quả H.264 cùng độ phân giải/fps phát được, 84 track (70 mặt, 14 biển), 14 track vào danh sách "Needs review". `VideoResultViewer` có nút **Show original / Show redacted**: một player đổi nguồn giữa bản gốc và kết quả, giữ nguyên thời điểm và trạng thái phát; bấm một track thì tua tới `bestFrameMs` và vẽ box trên cả hai bản. Backend đã lọc track dưới 0,5s (trừ track có `gapRanges`) trong `report-video.dto.ts`.
  - Batch trộn ảnh + video (ví dụ upload cả thư mục): cùng một cấu hình, mỗi file một job, backend chọn pool theo loại file (`jobs.image`/`jobs.video`). Báo cáo và zip gộp cả hai.
  - Cần kiểm tra trong video: danh sách **thời điểm bị đánh dấu** (đối tượng theo track, khoảng thời gian, lý do). Bấm vào thì tua cả video gốc và kết quả tới đó (hai `<video>` đồng bộ `currentTime`, hoặc một player có nút bật/tắt bản gốc). Engine đã trả `tracks` có `startMs`/`endMs`, `lowConfidenceRanges`, `gapRanges`. Nhiều track rất ngắn (dưới 0,5 giây), nên chỉ liệt kê track đủ dài và track có `gapRanges`; mọi track vẫn được che.
- [x] **[Đức Huy]** **[Should]** **Đổi mật khẩu.** Hiện không có luồng đổi hay đặt lại, nên mật khẩu bị lộ thì user không tự xử lý được. Route mới kiểm tra mật khẩu hiện tại; thành công thì thu hồi các refresh token khác của user.
- [x] **[Đức Huy]** **[Should]** Whitelist biển số: Web có ô nhập và gửi `whitelist.plates`; Engine dùng RapidOCR cùng logic chuẩn hóa/so khớp cho cả ảnh và video.
  - _Đã chạy thật với ảnh (14/11):_ whitelist `30F-255.47`, biển đó giữ nguyên, 4 biển còn lại bị che (`whitelistedPlate: 1`); cả hai mode `fast` và `max_privacy`. Với video chưa kiểm chứng được: video mẫu không có biển nào nằm trong whitelist (`whitelistedPlateTracks: 0`), nên mới xác nhận pipeline OCR/whitelist chạy được trên video, chưa xác nhận biển được giữ nguyên. Cần một video có biển đã biết để đóng nốt.
- [x] **[Should, sau khi xong các tính năng chính]** **Chọn chế độ khi tạo batch**: Web/Backend/Engine đã truyền `params.detection.mode` với hai mức `fast` / `max_privacy` và ngưỡng mặc định tương ứng. Đã chạy thật với ảnh: `fast` dùng `yolo26n` (ngưỡng mặt 0,17, biển 0,11), `max_privacy` dùng `yolo26s` (0,06/0,05) và bắt được nhiều mặt hơn (6 so với 3). Phần Web xong; chọn model/`imgsz` riêng và benchmark từng chế độ là việc của Engine.
- [x] **[Đạt]** **[Should]** Nút **"Sửa ảnh"** trong danh sách kết quả: bật/tắt từng box, vẽ thêm box, đổi style/độ mạnh, rồi render lại ảnh đó mà không chạy lại AI. **[Cần Engine]** **[Đổi contract]** cần thêm job chỉ render theo box có sẵn. Demo không phụ thuộc lỗi của model: dùng ảnh có mặt người trên poster (bỏ che) và bảng tên/số nhà (vẽ thêm box).
  - _Backend half done (Task 91)_: endpoint `POST /api/jobs/:id/edit`, schema, `image-render` command publishing, in-place job replacement on success, retry guard, and tests.
  - _UI done (Task 93)_: Frontend editor in ImageResultViewer with box toggling, custom box drawing on ImageStage, style/strength adjustments, and tests. End-to-end processing waits for the Engine's `image-render` worker.
- [ ] **[Could]** Xuất báo cáo PDF từ báo cáo JSON (render phía server hoặc in từ trang báo cáo).
- [ ] **[Could]** Trang thống kê hệ thống cho buổi bảo vệ: số job theo trạng thái, độ dài hàng đợi từng pool, số worker. **[Cần Infra]** nguồn số liệu (NATS monitoring/KEDA).
- [ ] **[Could]** **Cho phép đổi thời hạn của presigned URL trong trang cài đặt,** nếu không quá phiền. Backend giới hạn mức tối đa, nhất là với ảnh gốc và ảnh mẫu. Làm sau task presigned.
- [ ] **[Could]** **Thời hạn lưu theo từng user.** User chỉ điều khiển việc xoá **batch thường** (đã chạy): bật/tắt và số ngày. Thêm cột trên user, giữ `RETENTION_DAYS` làm mức tối đa tuỳ chọn. Giảm giá trị sẽ xoá vĩnh viễn batch cũ ở lần dọn kế tiếp, nên API phải cho UI biết số batch sẽ mất để xác nhận. Làm sau task dọn theo hạn ở trên. **[Đổi contract]** §5: hiện đây là cấu hình của quản trị viên.
  - **User không được tắt:** batch nháp bị bỏ dở (xoá sau 24h, vì đó là lần upload bị gián đoạn và giữ ảnh gốc riêng tư không ai dùng được) và ảnh mẫu whitelist của batch (dữ liệu sinh trắc, xoá khi mọi job kết thúc). Muốn giữ khuôn mặt thì dùng danh sách đã lưu.
  - **Cách làm:** dùng lại timer dọn dẹp hiện có, chỉ đổi query chọn batch theo `userId`, không tạo job riêng cho từng user.
- [ ] **[Could]** **Đổi email thành username để đăng nhập,** vì email không được xác minh. Cách nhỏ nhất: bỏ kiểm tra định dạng email và đổi nhãn, giá trị cũ giữ nguyên. Ảnh hưởng `AuthUser` và claim `email` trong JWT.
- [ ] **[Could]** **Cấu hình che mặc định theo user.** Thêm cột trên user và route. `BatchCreateForm` khởi tạo từ đó thay cho `DEFAULT_FORM_CONFIG`; chạy lại batch vẫn dùng cấu hình của batch nguồn.
- [ ] **[Could]** **Xoá tài khoản,** có yêu cầu nhập mật khẩu. Xoá mọi batch của `userId` và mọi danh sách của user. Database không tự làm đủ: cascade chỉ xoá dòng, file vẫn nằm trong MinIO. Vì vậy xoá storage trước (`<batchId>/` ở cả hai bucket cho mọi batch, rồi `lists/<userId>/`), sau đó mới xoá user. Xoá storage lỗi thì giữ user để thử lại. (Lưu ý: `Batch.user` đã được đổi sang `Cascade`, `userId` thành required, và các batch vô chủ từ Phase 1 đã bị xoá bởi migration `20261109160000_batch_owner_required`).
- [ ] **[Could]** **Đăng xuất mọi thiết bị** và **xoá toàn bộ media của tôi,** đều dùng lại code có sẵn.
- [x] **[Could]** **Đổi chữ "whitelist" thành "allow list" trong thông báo của backend** có hiện lên UI (lỗi upload, review reason trong `backend/src/dto`, kèm type `ReviewReason` ở `frontend/src/types.ts`), và thống nhất "Allow list" với "Face list" trong `face-list.service.ts`, `face-list.dto.ts`. Tên field API, mã lỗi, route và contract giữ nguyên.
- [x] **[Could]** **Giới hạn upload không khớp:** multer ở `face-lists.routes.ts` nhận 10 file, còn validation chặn ở `MAX_FACE_LIST_FILES` (5). Cho multer dùng hằng số này.
- [ ] **[Could]** **[Cần Infra]** **Self-host bằng một lệnh:** `infra/docker-compose.yaml` hiện chỉ chạy NATS, Postgres, MinIO; cần thêm `web` và worker.
