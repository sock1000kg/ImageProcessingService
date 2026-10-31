# Milestones
File này chia các lượt công việc và theo dõi tiến độ. Contract: `docs/integration-contracts.md`.
Kế hoạch chi tiết từng team: `web/docs/plan.md`, `engine/docs/plan.md`, `infra/AGENTS.md`.

## Phase 1: Ẩn danh hoá bộ ảnh (24/10 → 15/11)
Demo được: tải lên một bộ ảnh + ảnh chân dung whitelist, chọn cách che, xem before/after, chỉnh độ mạnh, tải kết quả và báo cáo JSON. Chạy trên `https://imgproc.sock1000kg.io.vn`.

1. Web / Backend: Nguyễn Đức Huy
- [x] Tạo batch: tải lên nhiều ảnh + 0..n ảnh whitelist + cấu hình che. Lưu MinIO, tạo batch và **một job cho mỗi ảnh** trong PostgreSQL, publish lên `jobs.image`.
- [ ] Theo dõi batch: trạng thái từng ảnh và tiến độ tổng. Thử lại ảnh `FAILED` riêng lẻ.
- [ ] Cấu hình che có ảnh mẫu đổi ngay theo style/độ mạnh đã chọn. Xem kết quả: thanh trượt before/after + danh sách phát hiện.
- [ ] Báo cáo: tổng số khuôn mặt/biển số/đã che/whitelist, danh sách phát hiện confidence thấp. Xem trên web và tải JSON.
- [x] Đồng bộ trạng thái từ `jobs.events` (idempotent, contract §8).

2. Engine / Workers: Huy Đức
- [ ] `image-redact`: phát hiện face + plate (pretrained `yolov8n-oiv7`), che blur/pixelate/blackout theo `params.redaction`, trả `detections` + `counts` theo contract §3.
- [ ] Whitelist khuôn mặt: embedding ảnh mẫu (cache theo key), cosine similarity, không che khi ≥ ngưỡng.
- [ ] Đánh dấu `lowConfidence` theo `reviewThreshold`.
- [ ] Song song: chuẩn bị dataset (WIDER FACE + biển số VN) và fine-tune YOLOv8n 2 nhãn. Thay model qua env khi đạt mAP@50 ≥ 85%.

3. Infrastructure: Đạt
- [ ] Môi trường `imgproc` chạy và public. Smoke test pass.
- [ ] Đổi stream theo contract mục 4: `IMAGE_JOBS` cho ảnh, thêm `VIDEO_JOBS`/`jobs.video`, bỏ `AI_JOBS`. Worker `image-worker` + KEDA chỉnh theo RAM đo được của model.
- [ ] CI build image `imgproc-engine` / `imgproc-web` theo commit SHA. Deploy web (Deployment, Service, HTTPRoute `/` và `/api`).

## Phase 2: Video + benchmark (16/11 → 29/11)
1. Web
- [ ] Đầu Phase 2: tài khoản (JWT + refresh, rate-limit, đăng ký bằng mã `REGISTER_KEY`), sau đó thư viện media (xem/xoá từng ảnh hoặc batch; ảnh gốc và kết quả giữ tới khi người dùng xoá, người quản trị đặt hạn tối đa qua env).
- [ ] Tải lên video (MP4 H.264, 15–60s), theo dõi tiến độ, xem/tải kết quả. Dùng chung cấu hình che và whitelist.
- [ ] Xuất báo cáo PDF. Whitelist biển số (nhập danh sách biển).

2. Engine
- [ ] `video-redact`: tách khung hình, phát hiện + ByteTrack, che, ghép lại bằng FFmpeg giữ nguyên âm thanh.
- [ ] Whitelist biển số (OCR biển VN 2 dòng).
- [ ] ONNX + OpenVINO (INT8 có điều kiện). Benchmark so với PyTorch CPU.

3. Infrastructure
- [ ] Pool `video-worker` + KEDA (mỗi video một pod).
- [ ] Benchmark trên môi trường đã deploy: monolith vs phân tán, các chiến thuật scale, thông lượng/độ trễ/RAM. Số liệu cho báo cáo.
