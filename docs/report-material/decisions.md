# Quyết định hạ tầng (Infra)

Mỗi mục theo format **Vấn đề → Lựa chọn → Quyết định → Vì sao**.

## 1. Thuê (tenant) trên cụm Lab-sock sẵn có thay vì dựng cụm riêng
- **Vấn đề:** Cần NATS/PostgreSQL/MinIO/KEDA + Gateway + Tunnel + metrics.
- **Lựa chọn:** (a) kind/k3s riêng cho project; (b) làm tenant trên cụm
  Lab-sock (k3s, node `home-server`, Traefik Gateway API, cloudflared,
  sealed-secrets, prom-agent, StorageClass `local-path`).
- **Quyết định:** (b).
- **Vì sao:** Không tốn thêm tài nguyên cho control plane; dùng lại được
  Gateway/Tunnel/metrics đã có; phù hợp "làm infra, không làm DevOps".

## 2. NATS JetStream thay vì Redis / RabbitMQ
- **Vấn đề:** Cần hàng đợi bền vững + consumer lag để KEDA scale theo queue.
- **Lựa chọn:** Redis Streams/BullMQ, RabbitMQ, NATS JetStream.
- **Quyết định:** NATS JetStream (nats-server 2.x, file store trên PVC).
- **Vì sao:** Lag theo consumer là metric chuẩn của KEDA (`nats-jetstream`
  trigger); NATS nhẹ hơn RabbitMQ, không cần operator riêng; hệ thống đã
  chốt NATS trong hợp đồng tích hợp.

## 3. Tách stream theo pool + workqueue retention
- **Vấn đề:** AI (nặng, chậm) và Image (nhanh) cần scale độc lập; event trạng
  thái chỉ có một bên đọc (backend).
- **Lựa chọn:** (a) một stream `JOBS` cho mọi thứ; (b) `AI_JOBS`,
  `IMAGE_JOBS` (workqueue) + `JOB_EVENTS` (workqueue, ack nhanh).
- **Quyết định:** (b).
- **Vì sao:** Mỗi pool một stream/consume riêng → KEDA scale độc lập, không
  cạnh tranh message; workqueue đảm bảo 1 message chỉ 1 worker xử lý, không
  cần dedup ở tầng trên. Vì chỉ backend đọc event nên `JOB_EVENTS` cũng dùng
  workqueue với một consumer duy nhất (`backend-job-events`) — không cần
  fan-out nhiều consumer, và nếu sau này thêm consumer thứ hai thì phải đổi
  `JOB_EVENTS` sang retention `limits`.

## 4. Chọn `ack_wait` / `max_deliver`
- **Vấn đề:** Job AI có thể chạy vài phút; event backend xử lý rất nhanh.
- **Lựa chọn:** ack_wait chung 30s cho mọi stream, hay chỉnh theo từng pool.
- **Quyết định:** `ai-workers` 5m, `image-workers` 1m, `backend-job-events`
  30s; `max_deliver` lần lượt 5 / 5 / 10.
- **Vì sao:** `ack_wait` phải dài hơn thời gian xử lý thật để không redeliver
  giữa chừng; giới hạn `max_deliver` tránh job "poison" loop vô hạn trên node
  yếu; event cần fail-fast để backend không bị nghẽn.

## 5. Kết quả public: MinIO GetObject-only + `/results/` qua Gateway + CF Tunnel
- **Vấn đề:** User cần tải ảnh/video kết quả mà không qua backend.
- **Lựa chọn:** (a) bucket `results` public toàn bộ (`mc anonymous set
  download`); (b) chỉ `s3:GetObject` trên `results/*`, đường dẫn key là UUID
  không đoán được, expose qua HTTPRoute `/results/` → `minio:9000` (không
  rewrite) + Cloudflare Tunnel.
- **Quyết định:** (b).
- **Vì sao:** `download` còn cho phép ListBucket → ai cũng liệt kê được toàn
  bộ kết quả của user khác; chỉ GetObject giữ URL là "bí mật". Same-origin
  `/results/` giữ URL dạng `https://<host>/results/<key>` như hợp đồng tích hợp
  và không tốn RAM/Traefik như một service backend riêng.

## 6. TTL 24 giờ cho cả `uploads` và `results`
- **Vấn đề:** Lab chạy trên HDD với dung lượng hạn chế, còn kết quả video
  nặng và không cần giữ lâu.
- **Lựa chọn:** (a) không TTL; (b) lifecycle expire toàn bộ sau 24h trên cả hai
  bucket; (c) TTL dài hơn ở prod.
- **Quyết định:** (b), một rule `imgproc-expire-1d` import bằng `mc ilm import`
  (thay cả config nên chạy lại không sinh rule trùng).
- **Vì sao:** Đúng MVP "xóa dữ liệu sau 24 giờ"; một rule cho cả hai bucket
  giữ đơn giản và tự dọn disk giữa các lần demo.

## 7. SealedSecrets thay vì Secret plaintext hay external secret manager
- **Vấn đề:** Secret cần commit an toàn cho cả team nhưng không nên nằm trong
  git dạng plaintext.
- **Lựa chọn:** (a) commit Secret plaintext; (b) SealedSecrets; (c) Vault /
  External Secrets Operator.
- **Quyết định:** (b) — `infra/seal.sh <env>` seal theo namespace từ file
  `real-secret.yaml` bị gitignore.
- **Vì sao:** Lab đã có sealed-secrets controller; không thêm operator mới,
  file mẫu `real-secret.example.yaml` commit được để teammate tự tạo secret
  của mình mà không cần admin.

## 8. Dev và prod trên cùng một node
- **Vấn đề:** Cần hai môi trường nhưng chỉ có 1 node 2C/4T, 12GB.
- **Lựa chọn:** (a) 2 cluster/nodes; (b) 2 namespace trên cùng node, mọi pod
  ghim `nodeSelector: kubernetes.io/hostname: home-server`.
- **Quyết định:** (b), namespace `imgproc-dev` / `imgproc-prod` (KEDA ở `keda`).
- **Vì sao:** Không tốn thêm phần cứng; overlay kustomize tách sạch giá trị
  (disk 2Gi/5Gi, memory limit) để khi có node thứ hai thì chỉ việc bỏ
  `nodeSelector`.

## 9. Ngân sách tài nguyên trên 2C/4T/12GB/HDD
- **Vấn đề:** Lab còn app khác; tổng **limits** dev + prod + KEDA phải ≤ ~2.5Gi.
- **Lựa chọn:** (a) giữ nguyên mức limit của chart (MinIO mặc định xin 16Gi
  RAM → không thể schedule); (b) đặt limit thủ công cho từng container và
  chạm ngưỡng 2.5Gi.
- **Quyết định:** (b) — cắt một số giá trị trong plan (Postgres 384→256Mi,
  prod 512→384Mi, exporter 64→32Mi; MinIO giữ **dev 256Mi / prod 512Mi**) và
  **tính ngân sách theo trạng thái chạy thật, không tính 2 setup Job** (Job là
  one-shot, `ttlSecondsAfterFinished: 600`): dev 864Mi + prod 1248Mi + KEDA
  448Mi = **2560Mi**. Tính cả Job thì tổng là 2816Mi — con số này chỉ để tham
  khảo, ngưỡng thật là 2560Mi.
- **Vì sao:** Muốn dev và prod chạy song song trên một node thì phải giới hạn
  tổng. Job setup chỉ tồn tại vài phút mỗi lần deploy nên không nên chiếm
  ngân sách của workload chạy lâu dài. Prod là môi trường nhận burst upload và
  chạy benchmark nên MinIO ở prod được nâng lên 512Mi, còn dev giữ 256Mi. HDD
  cũng cần disk cho cả `uploads` và `results` nên PVC giữ ở mức vừa.

## 10. Giữ chart PostgreSQL của Bitnami
- **Vấn đề:** Bitnami đã ngừng đẩy tag phiên bản lên Docker Hub
  (`bitnami/postgresql` chỉ còn `latest`; `bitnamilegacy` dừng ở 17.x).
- **Lựa chọn:** (a) đổi sang chart `postgres-ha`/operator khác; (b) giữ chart
  `postgresql` 18.11.5 và pin image theo digest.
- **Quyết định:** (b) — `image.repository: bitnami/postgresql` + digest của
  bản 18.6.0, exporter lấy `bitnamilegacy/postgres-exporter:0.17.1-debian-12-r16`.
- **Vì sao:** Không phải đổi chart (giữ nguyên convention của lab), vẫn có
  version tag/digest bất biến thay vì `latest` trôi theo thời gian.

## 11. Tự build image MinIO thay vì kéo từ registry của MinIO
- **Vấn đề:** MinIO đã đóng băng (archived, AGPL-3.0). `quay.io/minio/minio` trả **401**,
  `docker.io/minio/*` trả *"pull access denied"*, `dl.min.io` trả **410 Gone**. Các image mà
  Round 1 ghim không còn kéo được, nên cả MinIO Deployment lẫn `minio-setup` Job sẽ fail
  `ImagePullBackOff` trên lab.
- **Lựa chọn:** (a) `bitnamilegacy/minio` — đóng băng, entrypoint không tương thích với chart;
  (b) Chainguard — free tier chỉ có digest, rủi ro policy/giấy phép; (c) chuyển sang SeaweedFS/Garage —
  là cả một lần migrate; (d) tự build từ source + binary chính thức.
- **Quyết định:** (d) — `infra/images/minio/Dockerfile` build server từ source tại tag
  `RELEASE.2025-10-15T17-29-55Z` (có bản vá bảo mật GHSA-jjjj-jwhf-8rgr), đóng gói kèm client `mc`
  `RELEASE.2025-08-13T08-35-41Z` đã verify sha256 theo `.sha256sum` chính thức. Một image duy nhất
  `socknot1000kg/minio:RELEASE.2025-10-15T17-29-55Z` dùng cho Deployment, cả hai Job, compose
  và smoke test.
- **Vì sao:** Có bản vá bảo mật mới nhất, kiểm soát được hoàn toàn (tự build lại bất cứ lúc nào),
  và tuân thủ AGPL-3.0 — giữ nguyên `LICENSE`/`CREDITS` trong `/licenses/` cùng label OCI ghi rõ
  nguồn và license. Không phải migrate sang sản phẩm khác giữa chừng MVP.
- **Bổ sung (defence in depth):** HTTPRoute `/results/` chỉ nhận **GET và HEAD**. Bucket `results`
  vốn đã chỉ cho phép `s3:GetObject`, nhưng chặn thêm ngay ở Gateway để một object store không còn
  được bảo trì không bao giờ nhận được yêu cầu ghi.
