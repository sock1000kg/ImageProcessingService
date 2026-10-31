# Kế hoạch Engine (Workers): Cloud-Native Privacy Service

Contract (nguồn sự thật): `docs/integration-contracts.md`. Tiến độ chung: `docs/milestones.md`.
Ký hiệu trong task:
- **[Cần Web]**: phải thống nhất với anh Đức Huy.
- **[Cần Infra]**: nhờ Đạt.
- **[Đổi contract]**: thay đổi `docs/integration-contracts.md`, phải báo cả nhóm.

## Hiện trạng (24/10)
Đã có: worker Python bind đúng consumer có sẵn (không tự tạo stream/bucket), heartbeat `in_progress()`, tắt êm khi SIGTERM, chạy non-root, ACK sau khi upload,
event đúng contract, registry processor theo pool và lazy-load YOLO. Model `yolov8n-oiv7` (600 lớp, **có sẵn** `Human face` và `Vehicle registration plate`).
→ Khung worker đã ổn. Việc còn lại là **đổi processor** từ `object-detection`/`image-convert` sang ẩn danh hoá.

---

# Phase 1: Ẩn danh hoá ảnh (24/10 → 15/11)
**Hoàn thành khi:** pool `jobs.image` xử lý được `image-redact` (có whitelist khuôn mặt) đúng contract §2/§3, chạy trên lab trong giới hạn RAM đã đo.

## Milestone 1: `image-redact` không whitelist (24/10 → 01/11)
* **Tasks:**
    - [x] Processor `image-redact`: dùng `yolov8n-oiv7`, chỉ giữ 2 lớp `Human face` → `face`, `Vehicle registration plate` → `plate` (map tên lớp qua config, để đổi sang model fine-tune 2 nhãn chỉ cần đổi env `YOLO_MODEL_NAME` + bảng map). Lọc theo `params.redaction.targets` và `confidenceThreshold`.
    - [x] Ba style che theo `params.redaction`: `blur` (Gaussian, bán kính = `strength`), `pixelate` (thu nhỏ rồi phóng lại theo ô `strength`px), `blackout` (tô đen). Nới box theo `padding`, cắt trong biên ảnh. Che **sau** khi đã quyết định whitelist.
    - [ ] **[Đổi contract]** **[Cần Web]** Độ mạnh theo kích thước box: hiện `strength` là số px cố định, nên pixelate 12px trên mặt 600px còn ~50×50 ô, vẫn nhận ra người. Đề xuất `strength` là mức tương đối (ví dụ số ô theo chiều rộng box cho pixelate, bán kính theo % chiều rộng box cho blur). Web cập nhật ảnh xem trước theo cách tính mới.
    - [x] Định dạng đầu ra theo đuôi của `output.key` (JPG/PNG/WEBP, có thể khác ảnh gốc; alpha → JPG thì ghép nền trắng) và **giữ nguyên độ phân giải**. Nén theo mức `params.output.quality` với bảng map trong contract §2 (`standard`/`high`/`max`, mặc định `high`; đặt rõ tham số khi encode, không dùng mặc định của thư viện). Xoá EXIF/GPS khỏi ảnh kết quả (ảnh công khai không nên mang vị trí chụp).
    - [x] Phân loại lỗi theo contract §4 "Khi worker chết giữa chừng": lỗi input → `FAILED` + ack; lỗi tạm thời (MinIO/NATS) → `nak(delay)` không gửi `FAILED`, trừ lượt xử lý cuối (`num_delivered` = `MAX_ATTEMPTS`) thì `FAILED` + ack. Hiện tại mọi lỗi đều ack nên lỗi mạng thoáng qua là hỏng hẳn job.
    - [x] Giới hạn lượt: env `MAX_ATTEMPTS` (mặc định 3, phải < `max_deliver` 5 của stream). Message có `num_delivered` > `MAX_ATTEMPTS` → không xử lý, gửi `FAILED` `WORKER_CRASHED` + ack ngay.
    - [x] **Heartbeat phải chạy thật:** hiện `storage.download_file`, `processor.process`, `storage.upload_file` là hàm đồng bộ gọi thẳng trên event loop, nên task heartbeat (và handler SIGTERM) không chạy được trong lúc xử lý. Job > 60s (`ack_wait`) bị giao lại dù worker vẫn sống, tốn lượt, và tới lượt 4 sẽ thành `FAILED` `WORKER_CRASHED` sai trong khi job vẫn đang chạy. Bọc cả ba bằng `await asyncio.to_thread(...)`.
    - [x] **Hạn xử lý trong heartbeat:** env `JOB_DEADLINE_SECONDS` (ảnh 300). Vòng heartbeat ghi lại thời điểm bắt đầu job; quá hạn thì log lỗi và `os._exit(1)` (không cancel được thread đang treo, nên thoát hẳn process). Pod restart, message được giao lại và tính như một lần chết. Không có bước này thì một call bị treo (ví dụ MinIO không timeout) sẽ được heartbeat giữ mãi ở `PROCESSING`.
    - [x] SIGTERM khi job chưa xong trong grace period (60s): `nak()` job đang chạy trước khi thoát, để worker khác nhận ngay.
    - [x] `resultSummary` đúng contract §3B: `imageSize`, `counts`, `detections` (box **trước** padding, `lowConfidence` theo `reviewThreshold`), `redaction`, `model`, `processingTimeMs`.
    - [x] Gỡ `object-detection` / `image-convert` khỏi registry. Pool `jobs.image` chỉ đăng ký `image-redact`. Loại khác → `UNSUPPORTED_JOB_TYPE`.
    - [x] Ảnh hỏng hoặc không đọc được → `INVALID_INPUT_FILE` (không để thành `INTERNAL_WORKER_ERROR`).
* **Kiểm chứng:** `engine/tests/` có test cho 3 style (vùng trong box bị đổi, ngoài box giữ nguyên), map lớp, `padding` ở mép ảnh, kích thước đầu ra = đầu vào, phân loại ack/nak theo mã lỗi, heartbeat vẫn gửi trong lúc `process` chạy lâu (processor giả ngủ > 60s → không bị giao lại), quá `JOB_DEADLINE_SECONDS` thì process thoát. Thử `kill -9` worker khi đang xử lý → job được giao lại và hoàn tất. Ảnh làm worker chết mọi lần (ví dụ giả lập bằng env test) → sau `MAX_ATTEMPTS` lần có event `FAILED` `WORKER_CRASHED`, không kẹt ở `PROCESSING`. Chạy với compose local + publish tay 1 command `image-redact` theo contract §2A → ảnh kết quả trong `results`, event `COMPLETED` đúng shape.

## Milestone 2: Whitelist khuôn mặt (01/11 → 08/11)
* **Tasks:**
    - [ ] Chọn model face embedding chạy tốt trên CPU (ví dụ ArcFace/InsightFace dạng ONNX, hoặc model nhẹ tương đương). Ghi lý do chọn + RAM/tốc độ đo được vào `engine/docs/`.
    - [ ] Whitelist: với mỗi ảnh mẫu trong `params.whitelist.faces`, phát hiện khuôn mặt (lấy khuôn mặt lớn nhất), tính embedding và **cache theo key** (cùng batch dùng lại, không tính lại mỗi ảnh). Ảnh mẫu không có mặt → `WHITELIST_REFERENCE_ERROR`.
    - [ ] Với mỗi khuôn mặt phát hiện: cosine similarity với từng mẫu. ≥ `similarityThreshold` → `whitelisted: true`, `redacted: false`, kèm `whitelistRef` (vị trí mẫu khớp). Mọi khuôn mặt đều có `similarity` (cao nhất so với các mẫu), kể cả khi không khớp (contract §3B). Khi phân vân thì **che**.
    - [ ] Hiệu chỉnh ngưỡng: thử trên vài bộ ảnh có người quen/người lạ, đề xuất `similarityThreshold` mặc định (ưu tiên không nhận nhầm người lạ) và `reviewThreshold`. **[Cần Web]** báo giá trị để Web đặt mặc định.
* **Kiểm chứng:** test whitelist với 2 người (một trong whitelist, một không) → chỉ người lạ bị che.

## Milestone 3: Tài nguyên và chạy trên lab (08/11 → 15/11)
* **Tasks:**
    - [ ] Đo RAM/CPU của worker pool ảnh khi đã load YOLO + model embedding, và thời gian xử lý một ảnh 1080p. **[Cần Infra]** gửi số liệu để Đạt đặt memory limit và `maxReplicaCount` cho `image-worker`.
    - [ ] `engine/Dockerfile` bake sẵn trọng số model (pod chạy offline, không tải lúc khởi động). Ghi đường dẫn và biến env model vào `engine/README.md`.
    - [ ] **[Cần Infra]** Image `socknot1000kg/imgproc-engine` do CI build theo SHA. Thử trên lab với `infra/scaling-demo.sh` (Infra cập nhật script cho job `image-redact`).
    - [ ] **[Cần Web]** Chạy luồng thật batch → worker → UI trên lab.
    - [ ] Cập nhật `engine/docs/` (local-dev, jobs-spec) theo contract mới. Bỏ hướng dẫn cũ về `object-detection`/`image-convert` và compose riêng.
* **Kiểm chứng:** batch 20 ảnh trên lab hoàn tất, worker không bị OOM, KEDA scale lên rồi về 0.

## Song song suốt Phase 1–2: Model fine-tune (Mục tiêu A)
- [ ] Gom dataset: WIDER FACE + Vietnamese License Plate Dataset. Chuẩn hoá về format YOLO 2 nhãn (`face`, `plate`), chia train/val/test.
- **Quy tắc tách dữ liệu (bắt buộc, để số liệu benchmark còn ý nghĩa):** bộ benchmark của Infra (`infra/bench/dataset/images-max.txt`: toàn bộ
  WIDER FACE **val** 3226 ảnh + toàn bộ 500 ảnh biển số của repo `ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset`, `Dataset/Test` 400 + `Dataset/Valid` 100)
  là **tập kiểm tra giữ riêng**: không dùng để train, không dùng để chọn checkpoint/ngưỡng/siêu tham số.
    - WIDER FACE: chỉ train trên split **train**; tập validation để chọn checkpoint thì tách ra từ chính split train, không dùng WIDER val.
    - Biển số VN: không dùng ảnh nào có trong `images-max.txt`. Kiểm tra theo **sha256** (cột hash trong file), không chỉ theo tên file, vì cùng một
      ảnh có thể nằm trong dataset khác hoặc mirror khác. Ưu tiên train trên một dataset biển số VN khác; nếu buộc phải dùng repo UET thì báo **[Cần
      Infra]** để chia lại (ví dụ train trên `Test`, benchmark chỉ dùng `Valid`).
    - Ghi rõ dataset, split và số ảnh đã dùng để train vào `engine/docs/`, để báo cáo nêu được là kết quả đo trên dữ liệu model chưa từng thấy.
- [ ] Fine-tune YOLOv8n. Báo cáo mAP@50 tổng và **theo từng lớp**, precision/recall (đặc biệt recall: bỏ sót là lộ thông tin). Mục tiêu mAP@50 ≥ 85%.
- [ ] So sánh với `yolov8n-oiv7` trên cùng tập test (nhất là biển số VN 2 dòng, góc nghiêng, ngược sáng): chạy benchmark của Infra (`infra/bench`, `run.sh --save-detections` + `accuracy/evaluate.py`) với `YOLO_MODEL_NAME` trỏ tới trọng số mới, để so cùng quy tắc với model gốc và deface.
- [ ] Đạt ngưỡng → đổi model qua env `YOLO_MODEL_NAME` + bảng map lớp. Field `model` trong `resultSummary` ghi tên model mới.

---

# Phase 2: Video + tối ưu (16/11 → 29/11)
- [ ] **[Must]** `video-redact` trên pool `jobs.video` (worker riêng, contract §2B, §3 B2): tách khung hình (FFmpeg/OpenCV), phát hiện + **ByteTrack** để giữ id đối tượng giữa các khung (vết che không nhấp nháy, có thể nội suy khi mất phát hiện vài khung), che, ghép lại MP4 H.264 (CRF map từ `params.output.quality`, giữ độ phân giải + fps gốc), **copy nguyên audio gốc** bằng FFmpeg. Gửi progress theo % khung hình. Heartbeat `in_progress()` (ack_wait 5m), `JOB_DEADLINE_SECONDS` cho video (gợi ý 3600). **[Đổi contract]** chốt `resultSummary` video với Web (số đối tượng duy nhất theo track id, khoảng khung hình/thời gian của từng track, đoạn có confidence thấp để Web đánh dấu và tua tới...).
- [ ] **[Must]** Whitelist khuôn mặt cho video: so embedding theo **track**, không theo từng khung (một lần mỗi track, ổn định hơn và nhanh hơn).
- [ ] **[Should]** ONNX + OpenVINO trên CPU Intel. Benchmark với PyTorch CPU: throughput, latency, RAM, mAP. INT8 chỉ dùng nếu nhanh hơn rõ rệt (mục tiêu 2–3 lần) mà mAP/recall vẫn đạt.
- [ ] **[Should]** Whitelist biển số: OCR biển VN 2 dòng (ví dụ PaddleOCR/EasyOCR), so khớp với `whitelist.plates`. **[Đổi contract]** **[Cần Web]**.
- [ ] **[Could]** **[Đổi contract]** **[Cần Web]** Chế độ blockList cho `params.whitelist`: chỉ che khuôn mặt khớp mẫu. Fail-open nên dùng ngưỡng thấp hơn và đánh dấu khuôn mặt sát ngưỡng.
- [ ] **[Could]** **[Đổi contract]** **[Cần Web]** Job chỉ render (`image-render`): nhận danh sách box cuối cùng + style, che rồi xuất ảnh, không chạy model. Dùng cho nút "Sửa ảnh" của Web.
- [ ] **[Could]** Build arg `TORCH=cpu|cuda` cho `engine/Dockerfile`: bản `cpu` nhỏ hơn nhiều cho lab (không GPU), bản `cuda` giữ khả năng chạy GPU. Ultralytics tự chọn GPU nếu torch thấy GPU, không cần đổi code.
- [ ] **[Could]** Benchmark xử lý video monolith (một process xử lý cả video) vs phân tán (chia đoạn video ra nhiều job). **[Cần Infra]** để đưa vào phần đo đạc của báo cáo.

---

## Tổng hợp việc cần phối hợp
| Khi nào | Với ai | Việc |
|---|---|---|
| M1 (28/10) | Web | Xác nhận contract §2/§3 mới (kể cả `params.output.quality` dạng mức, định dạng theo `output.key`, `whitelistRef`, `strength` tương đối theo kích thước box) và cách xử lý worker chết (§4: `MAX_ATTEMPTS`, `WORKER_CRASHED`, hạn xử lý) trước khi code |
| M2 (06/11) | Web | Ngưỡng mặc định `similarityThreshold`, `reviewThreshold` |
| M3 (09/11) | Infra | RAM/CPU đo được → memory limit, max replicas, CI image |
| M3 (12/11) | Web + Infra | Chạy luồng thật trên lab |
| Phase 2 | Web + Infra | `resultSummary` video, OCR biển số, benchmark |
