# Overview
Project này giống 3 project gắn với nhau do nó tập trung vào cách triển khai trên hạ tầng, nên khối lượng công việc coi như chia thành 3 mini-projects:
- Web: bao gổm frontend và backend. Anh Đức Huy chịu trách nhiệm toàn bộ đầu cuối của thiết kế API, schema, database, lựa chọn framwork,... MVP chỉ yêu cầu tính năng tối thiểu (tải ảnh, tạo và theo dõi job, xem và tải kết quả), các tính năng kiểu authentication, rate-limiting, xoá job (logic phức tạp hơn)... thì không cần ngay. 
- Engine: bao gồm worker và các feature xử lý ảnh bằng ffmpeg/AI và đăng kết quả lên MinIO. Huy Đức sẽ chịu trách nhiệm phần này. MVP chỉ cần 1 loại job bằng AI và 1-2 loại job xử lý ảnh bthg để tiết kiệm tgian. 
- Infra: bao gồm KEDA auto-scaling và hạ tầng để chạy và expose demo ra public. Đạt chịu trách nhiệm phần này.

# Vài cái lưu ý
- Mỗi người chịu trách nhiệm hoàn toàn một trong 3 folder chính. Nếu cần giúp gì thì có thể kêu gọi trợ giúp (nên dùng ngôn ngữ/framework nhiều người biết và AI gen được tốt kiểu React/Node.js/Typescript/Python).
- Ưu tiên trước hết một cái demo tối thiểu rồi làm gì thì làm
- Những cái nào ảnh hưởng các thành phần khác như cấu trúc job, job status,... mà nếu có thay đổi gì thì phải báo với mọi người để còn thống nhất, ko để AI tự ý đổi docs/schemas. Cái gì không rõ về hướng giải quyết hiện tại thì hỏi chứ đừng tự ý làm hoặc để AI thay đổi. 
- Phần docs với prompt agent cụ thể cho từng phần thì cho vào folder tương ứng phần đấy kiểu web/docs để tránh conflict.
- **`docs/` là nguồn sự thật chung.** Cái gì cả nhóm đã thống nhất (contract message, stream/consumer/bucket, đường dẫn object, cách dev local) phải nằm trong `docs/`. Docs riêng của từng team (`web/docs`, `engine/docs`, `infra/docs`) chỉ được chi tiết hoá, không được mâu thuẫn. Nếu thấy mâu thuẫn thì `docs/` đúng, và báo team kia sửa.

# Docker Image để test khi dev
NATS: nats:2.14.6-alpine
MinIO: socknot1000kg/minio:RELEASE.2025-10-15T17-29-55Z (image tự build: MinIO bản cuối build từ source + `mc`; image chính thức `quay.io/minio/minio` không còn pull được)
PostgreSQL: postgres:18.1-alpine

# Quy trình dev và tích hợp
## 1. Dev hằng ngày: chạy local
- Mỗi người code và test trên máy mình bằng `infra/docker-compose.yaml`. File này dựng NATS (đã có sẵn stream/consumer), PostgreSQL và MinIO (đã có bucket `uploads`/`results`, link public và TTL 24h) giống hệt cấu hình trên cluster, nên code chạy được local thì lên cluster cũng chạy được.
- Cách chạy:
  - `cp infra/.env.example infra/.env`
  - `docker compose -f infra/docker-compose.yaml up -d`: lệnh này tự chạy `nats-setup` và `minio-setup` một lần (cùng script với Job trên cluster) để tạo stream/consumer và bucket. App không tự tạo stream/consumer/bucket (quy tắc và bảng cấu hình: `docs/integration-contracts.md` §4).
  - Nếu app báo thiếu stream/bucket (ví dụ sau khi xoá volume) thì chạy lại `docker compose -f infra/docker-compose.yaml run --rm nats-setup` hoặc `minio-setup`. Chạy lại nhiều lần không sao.
  - Endpoint: NATS `localhost:4222`, PostgreSQL `localhost:5432` (db/user `imgproc`), MinIO `localhost:9000` (console `localhost:9001`). Chi tiết xem `infra/docs/endpoints.md`.
  - Nếu cổng 5432 trên máy đã bị chiếm thì tắt PostgreSQL đang chạy sẵn hoặc đổi cổng trong một file override riêng. Không sửa file chung.
- Không cần quyền truy cập lab để dev.

## 2. Tích hợp: chạy trên môi trường dev của cluster
- Mỗi team giữ một `Dockerfile` chạy được trong folder của mình (`web/Dockerfile`, `engine/Dockerfile`).
- CI (GitHub Actions, Đạt sẽ set up) tự build và push image lên Docker Hub mỗi khi có commit lên `main` thay đổi `web/` hoặc `engine/`:
  - `socknot1000kg/imgproc-web`
  - `socknot1000kg/imgproc-engine`
  - Tag là commit SHA, kèm tag `main`.
- Infra (Đạt) giữ phần manifest Kubernetes và deploy các image đó lên namespace `imgproc-dev`. Muốn deploy bản mới thì báo Đạt (sau này có thể tự động).
- Trong cluster, app kết nối tới `nats:4222`, `postgresql:5432`, `minio:9000`. Thông tin đăng nhập lấy từ Secret do Infra cấp, không hardcode.
- Web dev public tại `https://imgproc-dev.sock1000kg.io.vn` (`/results/...` là link tải kết quả, `/api` và UI sẽ có khi web được deploy).
- Khi cần debug code local với NATS/PostgreSQL/MinIO thật của môi trường dev, các service này sẽ được mở qua Tailscale với tên miền dạng `*.internal.sock1000kg.io.vn` (chỉ môi trường dev). Đạt sẽ gửi tên miền cụ thể và mời vào Tailscale.
- Môi trường prod chỉ dùng cho demo và benchmark, Infra quản lý. Không dùng prod để test.
