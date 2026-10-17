# Kế hoạch Web (Frontend + Backend)

Tài liệu này chia việc của team Web theo thứ tự thời gian, cùng format milestone → task → kiểm chứng như `infra/AGENTS.md`.
Tác vụ nào cần hỏi/phối hợp team khác thì được ghi rõ ngay trong task:

- **[Cần Engine]**: phải thống nhất với Huy Đức (engine/worker) trước khi làm.
- **[Cần Infra]**: phải nhờ Đạt (infra/cluster).
- **[Đổi contract]**: thay đổi `docs/integration-contracts.md`, phải báo cả nhóm, không để AI tự ý sửa.

Nguồn tham chiếu chính xác: `docs/integration-contracts.md` (contract message), `infra/docs/endpoints.md` (DNS, stream, secret, URL public — nếu mâu thuẫn với contract thì file này đúng).

---

## Hiện trạng (17/10)

Đã có: skeleton Express + React. `POST /api/jobs` (multipart → MinIO `uploads` → PG `PENDING` → publish NATS → `QUEUED`),
`GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/system/stats`, consumer `backend-job-events` cập nhật trạng thái, UI một trang polling 3s.

Lỗ hổng cần xử lý trong Phase 1:

| # | Vấn đề | Ở đâu |
|---|---|---|
| G1 | Backend tự tạo stream NATS (`ensureStream`) và bucket MinIO (`ensureBuckets`), trong khi Infra mới là chủ sở hữu (stream/consumer có `ack_wait`, `max_deliver` riêng). Backend tạo trước có thể ra cấu hình sai. | `messaging.ts`, `storage.ts` |
| G2 | Event không hợp lệ không bao giờ được ack → bị giao lại tới `max_deliver` (10 lần) và chặn log. Event chưa được validate bằng schema. | `messaging.ts`, `db.ts` |
| G3 | `.env.example` (`postgres/image_processing`, `minioadmin`) không khớp `infra/docker-compose.yaml` (db/user `imgproc`). | `web/.env.example` |
| G4 | Chưa có `web/Dockerfile`; `npm start` chỉ chạy API, không serve frontend đã build. | — |
| G5 | Chưa có mock worker và chưa có test, nên Web không tự test E2E được khi chưa có engine. | — |
| G6 | Schema PG được tạo trong code (`CREATE TABLE IF NOT EXISTS`), `CHECK` cứng 2 loại job, không có migration. | `db.ts` |
| G7 | ~~Đường dẫn kết quả không thống nhất giữa các docs~~ (đã xử lý, xem bên dưới) | docs |

**Quyết định cho G7 (đã ghi vào docs):** dùng `<jobId>/result.<ext>`, xem `docs/integration-contracts.md` §5 (`docs/milestones.md` đã khớp). Prefix theo user được xem lại ở Phase 2 (M7) khi có auth.

---

# Phase 1: PoC tối thiểu (17/10 → 31/10)

**Định nghĩa hoàn thành Phase 1:** Web chạy trong `imgproc` trên lab, truy cập public tại `https://imgproc.sock1000kg.io.vn`.
Người dùng upload ảnh → worker **thật** của engine xử lý → xem và tải được kết quả, với **1 loại job AI + 1 loại job xử lý ảnh thường**.

## Milestone 1: Căn chỉnh với Infra và Contract (17/10 → 20/10)
**Mục tiêu:** Backend chạy được trên `infra/docker-compose.yaml` mà không tự tạo tài nguyên của Infra, và chỉ chấp nhận đúng các message trong contract.
* **Tasks:**
    - [ ] Bỏ `ensureStream` / `ensureBuckets`. Thay bằng **kiểm tra lúc khởi động**: stream `AI_JOBS`, `IMAGE_JOBS`, `JOB_EVENTS`, consumer `backend-job-events` và bucket `uploads`, `results` phải tồn tại. Nếu thiếu thì log lỗi rõ ràng và thoát (fail fast). Log chỉ nêu cái gì thiếu và ở đâu (ví dụ `stream JOB_EVENTS not found on nats://...`), không chứa hướng dẫn sửa riêng cho môi trường nào. (G1)
    - [ ] `web/README.md` link tới mục "Dev hằng ngày" trong `docs/phân-công-và-guideline.md` (cách dựng môi trường local và chạy lại setup), không chép lại nội dung. Trên cluster mà thiếu stream/bucket thì báo Infra.
    - [ ] Validate mọi event `jobs.events` bằng `zod` theo đúng contract mục 3 (`status`, `progress`, `stage`, `result`, `resultSummary`, `error.code`). Event sai schema hoặc `jobId` không tồn tại thì log + `term()` (không giao lại). Lỗi tạm thời (mất kết nối PG) thì `nak()` có delay. (G2)
    - [ ] Giữ idempotency theo contract mục 8: progress chỉ tăng, trạng thái kết thúc (`COMPLETED`/`FAILED`) không bị ghi đè, event `PROCESSING` cũ bị bỏ qua. Viết unit test cho `applyJobEvent`.
    - [ ] Sửa `.env.example` theo `infra/.env.example` + `infra/docs/endpoints.md`. Cập nhật `web/README.md`: dev local dùng `infra/docker-compose.yaml` (không còn `engine/docker-compose.local.yml` + PG riêng). (G3)
    - [ ] Tách schema sang file migration (ví dụ `backend/migrations/001_init.sql`, chạy lúc khởi động hoặc bằng `npm run migrate`). Bỏ `CHECK` cứng trên `type`, validate loại job ở tầng API. (G6)
    - [ ] Chốt danh sách loại job Phase 1. **[Cần Engine]**: hỏi Huy Đức loại AI nào (`object-detection`?) và loại ảnh thường nào (`image-convert`?) sẽ chạy được trước 28/10, và `params` nào worker thực sự đọc.
* **Kiểm chứng:**
    - [ ] `docker compose -f infra/docker-compose.yaml up -d` + setup jobs → `npm run dev:backend` khởi động OK. Xoá một stream thì backend thoát với thông báo rõ ràng.
    - [ ] Publish tay một event sai schema bằng `nats pub jobs.events '{...}'` → bị `term`, không lặp lại trong log.
    - [ ] Unit test `applyJobEvent` pass (trùng `COMPLETED`, `PROCESSING` đến sau `COMPLETED`, progress giảm).

## Milestone 2: E2E local với mock worker (20/10 → 24/10)
**Mục tiêu:** Web tự chứng minh toàn bộ luồng chạy đúng mà không cần engine (contract mục 12).
* **Tasks:**
    - [ ] Viết `web/scripts/mock-worker.ts`: pull từ `ai-workers` và `image-workers`, gửi `PROCESSING` (stage `DOWNLOADING_INPUT` → `PROCESSING` → `UPLOADING_OUTPUT`), copy input sang `output.key` trong `results`, gửi `COMPLETED` kèm `resultSummary` mẫu theo đúng contract. Có cờ để giả lập `FAILED` và độ trễ, rồi ack sau khi upload xong.
    - [ ] Script E2E `npm run test:e2e`: upload file → poll `GET /api/jobs/:id` tới `COMPLETED` → `GET` được `resultUrl`. Chạy với compose + mock worker.
    - [ ] Phục vụ `/results/...` khi dev local: thêm proxy trong Vite (`/results` → `localhost:9000`), để URL kết quả giống hệt môi trường lab (same-origin).
    - [ ] UI tối thiểu: form upload (chọn loại job + params tương ứng), danh sách job với trạng thái/progress/stage, hiển thị lỗi (`error.code` + message), ảnh kết quả + nút tải. Đóng gói lại `main.tsx` thành vài component.
    - [ ] Validate upload: giới hạn MIME ảnh (`image/jpeg`, `image/png`, `image/webp`), kích thước tối đa (`UPLOAD_MAX_BYTES`). Trả lỗi 4xx với message rõ ràng.
* **Kiểm chứng:**
    - [ ] `npm run test:e2e` pass cho cả 2 loại job và cho kịch bản `FAILED`.
    - [ ] Tắt backend giữa chừng rồi bật lại → event vẫn được xử lý (durable consumer), UI hiển thị đúng sau khi refresh.

## Milestone 3: Đóng gói và deploy lên `imgproc` (24/10 → 28/10)
**Mục tiêu:** Image Web chạy trên lab, truy cập được qua hostname public.
* **Tasks:**
    - [ ] `web/Dockerfile` multi-stage: build backend + frontend, image runtime chạy non-root, chỉ chứa `node_modules` production. Backend serve `frontend/dist` bằng `express.static` + fallback SPA về `index.html`. (G4)
    - [ ] Endpoint `/health` (liveness) và `/ready` (readiness: PG, NATS, MinIO đều kết nối được).
    - [ ] Graceful shutdown: dừng nhận request, drain NATS, đóng pool PG khi nhận `SIGTERM`.
    - [ ] Toàn bộ cấu hình qua env, không hardcode. Liệt kê đầy đủ biến env trong `web/README.md` cho Infra.
    - [ ] **[Cần Infra]** Đạt: CI build/push `socknot1000kg/imgproc-web` (tag SHA + `main`). Tạo Deployment + Service `web` trong `imgproc`. Tạo Secret cho web (`DATABASE_URL` user `imgproc`, MinIO credentials — **nên là user MinIO riêng** chỉ có quyền `uploads` RW + `results` RW, không dùng root). HTTPRoute `/api` và `/` → `web`, giữ nguyên `/results/` → MinIO. Đặt memory limit cho web trong budget (gợi ý: 256Mi, Web đo thực tế rồi báo lại).
    - [ ] Đặt `UPLOAD_MAX_BYTES` khớp giới hạn body của Traefik/Cloudflare (Cloudflare free giới hạn 100MB). **[Cần Infra]**: xác nhận giới hạn trên Gateway.
* **Kiểm chứng:**
    - [ ] `docker build` + chạy container với compose local → `npm run test:e2e` pass trên image.
    - [ ] Trên lab: `https://imgproc.sock1000kg.io.vn` mở được UI, `/api/system/stats` trả JSON, pod `web` Ready.
    - [ ] Upload trên lab + mock worker chạy tay (`kubectl run` hoặc Job tạm, nhờ Đạt) → kết quả xem được qua `/results/...`.

## Milestone 4: Tích hợp engine thật và demo (28/10 → 31/10)
**Mục tiêu:** Luồng E2E với worker thật trên `imgproc`, sẵn sàng demo trên lớp.
* **Tasks:**
    - [ ] **[Cần Engine]** Chạy E2E với worker thật cho từng loại job Phase 1. Ghi lại mọi chỗ lệch contract (tên field, `resultSummary`, `error.code`) và sửa ở phía chịu trách nhiệm theo contract mục 6, không vá ở Web nếu lỗi nằm ở Engine.
    - [ ] Hiển thị `resultSummary` dạng dễ đọc: danh sách label + confidence cho `object-detection`, kích thước/dung lượng trước và sau cho `image-convert`.
    - [ ] Script `web/scripts/burst.ts` submit N job liên tiếp (chọn loại), để demo KEDA scale up/down. **[Cần Infra]**: thống nhất N và loại job với kịch bản scaling của Infra (M4 infra).
    - [ ] Viết checklist demo (`web/docs/demo.md`): thứ tự thao tác, job mẫu, ảnh mẫu, cách xử lý nếu worker đang scale từ 0 (cold start chậm → UI vẫn hiển thị `QUEUED`).
* **Kiểm chứng:**
    - [ ] Trên lab: 1 job AI + 1 job ảnh thường đi từ `QUEUED` → `PROCESSING` → `COMPLETED`, kết quả tải được qua hostname public.
    - [ ] Job lỗi (ảnh hỏng) hiển thị `FAILED` + mã lỗi trên UI.
    - [ ] Burst 20 job → tất cả hoàn tất, không job nào kẹt ở `QUEUED`/`PROCESSING`.

---

# Phase 2: Hoàn thiện và tính năng (tháng 11)

Mỗi mục được gắn tier để nhóm có thể dừng ở bất kỳ điểm nào: **[Must]** phải có, **[Should]** nên có, **[Could]** nếu còn thời gian.
Hướng tham khảo: các dịch vụ media trên cloud (Cloudinary, AWS Rekognition/S3/MediaConvert, imgix).

## Milestone 5: Vòng đời job (1/11 → 7/11)
**Mục tiêu:** Người dùng kiểm soát được job của mình và API an toàn khi gọi lại.
* **Tasks:**
    - [ ] **[Must]** Xoá job đã kết thúc: xoá dòng PG (hoặc soft delete) + object trong `uploads` và `results`. `DELETE /api/jobs/:id`.
    - [ ] **[Must]** Huỷ job đang chờ/đang chạy: trạng thái mới `CANCELLED`. **[Đổi contract]** **[Cần Engine]**: cần thống nhất cơ chế. Gợi ý: backend publish `jobs.control.cancel` (hoặc worker kiểm tra trạng thái trước khi bắt đầu và trước khi upload), worker bỏ qua job và ack. Event `COMPLETED` đến sau `CANCELLED` phải bị bỏ qua (terminal-state protection) và backend dọn kết quả.
    - [ ] **[Must]** Retry job `FAILED`: `POST /api/jobs/:id/retry` tạo job mới tham chiếu input cũ (input còn trong TTL 24h). Nếu input đã hết hạn thì trả 410.
    - [ ] **[Should]** Header `Idempotency-Key` cho `POST /api/jobs` (giống Stripe/AWS): cùng key trong 24h trả lại cùng job, không tạo trùng.
    - [ ] **[Should]** Hiển thị thời gian hết hạn kết quả (TTL 24h của Infra) trên UI. Job có kết quả đã hết hạn hiển thị "Đã hết hạn".
* **Kiểm chứng:** huỷ job khi worker đang xử lý → trạng thái cuối `CANCELLED`, không có object trong `results`. Gửi 2 request cùng `Idempotency-Key` → 1 job.

## Milestone 6: Trải nghiệm kết quả và thư viện media (5/11 → 14/11)
**Mục tiêu:** Kết quả trông giống console của một dịch vụ cloud.
* **Tasks:**
    - [ ] **[Must]** Preview kết quả:
        - `image-convert`, `background-removal`: thanh trượt so sánh trước/sau (before/after slider). Cần URL xem ảnh input: thêm `GET /api/jobs/:id/input` (stream từ `uploads`, bucket private) hoặc presigned GET (M7).
        - `object-detection`, `text-recognition`: vẽ bounding box / khung OCR phía client từ `resultSummary` lên ảnh gốc, hover hiện label + confidence. Có bật/tắt overlay.
        - Loại không preview được: hiện cấu hình đã gửi (`params`) + `resultSummary` dạng bảng, kèm nút tải.
    - [ ] **[Must]** Tiến độ real-time bằng Server-Sent Events: `GET /api/jobs/:id/events` (và stream cho danh sách), thay polling 3s. Giữ polling làm fallback.
    - [ ] **[Should]** Thư viện media: lưới thumbnail, lọc theo trạng thái/loại job, tìm theo tên file, phân trang (cursor theo `created_at`). Trang chi tiết job riêng (`/jobs/:id`), có link chia sẻ được.
    - [ ] **[Could]** Thumbnail cho thư viện. **[Cần Engine]**: worker có thể tạo thêm `<jobId>/thumb.webp` không, hay Web tự dùng job `image-convert` sau khi xong?
    - [ ] **[Could]** Metadata/EXIF của ảnh input (kích thước, định dạng, EXIF cơ bản). **[Cần Engine]** nếu muốn worker trả về trong `resultSummary`. Nếu không thì backend tự đọc header ảnh lúc upload.
* **Kiểm chứng:** mở chi tiết một job `object-detection` → thấy box đúng vị trí. Tắt mạng 10s rồi bật lại → SSE tự kết nối lại, trạng thái đúng.

## Milestone 7: Người dùng, quyền truy cập và lưu trữ an toàn (10/11 → 21/11)
**Mục tiêu:** Mỗi người chỉ thấy job của mình, kết quả không còn public vô điều kiện.
* **Tasks:**
    - [ ] **[Should]** Auth đơn giản (email + mật khẩu hoặc OAuth GitHub/Google), session cookie `HttpOnly`. Bảng `users`, cột `jobs.user_id`. Mọi API job lọc theo user. Lịch sử job theo user.
    - [ ] **[Should]** Quyết định có đổi key kết quả sang `<userId>/<jobId>/...` hay không (G7). Gợi ý: **giữ `<jobId>/...`** và kiểm tra quyền qua DB, để không phải đổi engine. **[Đổi contract]** **[Cần Engine]** nếu đổi.
    - [ ] **[Should]** Presigned URL:
        - Tải kết quả: backend cấp presigned GET ngắn hạn sau khi kiểm tra quyền. **[Cần Infra]**: chuyển bucket `results` sang private + bỏ/đổi HTTPRoute `/results/` (presigned URL ký theo host, nên cần thống nhất host public của MinIO hoặc giữ proxy qua backend).
        - Upload trực tiếp từ trình duyệt bằng presigned PUT, để file lớn không đi qua backend. **[Cần Infra]**: cần route public ghi được vào MinIO (hiện chỉ cho GET/HEAD) + CORS. Nếu Infra không muốn mở ghi thì giữ upload qua backend.
    - [ ] **[Could]** Quota + rate limiting theo user (ví dụ N job/giờ, tổng dung lượng/ngày), trả 429 kèm `Retry-After`. Cần auth trước.
* **Kiểm chứng:** user A không đọc/xoá được job của user B (test API). URL kết quả hết hạn sau thời gian cấu hình.

## Milestone 8: Batch, preset và công cụ benchmark (17/11 → 28/11)
**Mục tiêu:** API dùng được cho khối lượng lớn và phục vụ đánh giá scaling của Infra.
* **Tasks:**
    - [ ] **[Should]** Batch job: `POST /api/batches` nhận nhiều file và/hoặc nhiều cấu hình biến đổi cho một file. Bảng `batches`, tiến độ tổng hợp, UI hiển thị nhóm.
    - [ ] **[Should]** Preset biến đổi có tên (giống Cloudinary named transformations): ví dụ `thumbnail-webp-320`, `web-optimized-jpeg-85`. CRUD preset, chọn preset khi tạo job/batch.
    - [ ] **[Should]** Công cụ benchmark: nâng `burst.ts` thành CLI có tham số (số job, tỉ lệ AI/ảnh, tốc độ gửi). Xuất CSV thời gian chờ (`QUEUED` → `PROCESSING`) và thời gian xử lý mỗi job. **[Cần Infra]**: thống nhất kịch bản và chỉ số để Đạt so sánh các chiến thuật scaling.
    - [ ] **[Should]** Dashboard hệ thống: số job theo trạng thái, độ sâu hàng đợi mỗi pool, throughput, số worker đang chạy, để minh hoạ KEDA scale. **[Cần Infra]**: backend đọc lag qua NATS monitoring `nats:8222/jsz`. Số replica worker cần quyền đọc Kubernetes API (ServiceAccount + Role `get/list` deployments trong namespace), hoặc Infra cung cấp nguồn khác (VictoriaMetrics).
    - [ ] **[Could]** API key cho truy cập bằng chương trình + trang tài liệu OpenAPI/Swagger.
* **Kiểm chứng:** batch 50 ảnh × 1 preset hoàn tất trên `imgproc`, dashboard thấy queue tăng rồi về 0 và worker scale tương ứng. CSV benchmark được Infra dùng trong báo cáo.

---

## Tổng hợp việc cần phối hợp

| Khi nào | Với ai | Việc |
|---|---|---|
| M1 (trước 20/10) | Engine | Loại job Phase 1, `params` thực tế |
| M3 (trước 26/10) | Infra | CI image `imgproc-web`, Deployment/Service/HTTPRoute, Secret + MinIO user riêng cho web, memory limit, giới hạn body upload |
| M4 (28/10) | Engine + Infra | E2E worker thật, kịch bản burst cho demo KEDA |
| M5 | Engine | Cơ chế huỷ job + trạng thái `CANCELLED` (đổi contract) |
| M6 | Engine | Thumbnail / EXIF (tuỳ chọn) |
| M7 | Infra (+ Engine nếu đổi key) | Bucket `results` private, presigned URL, route/CORS cho upload trực tiếp |
| M8 | Infra | Kịch bản benchmark, quyền đọc replica/NATS monitoring cho dashboard |
