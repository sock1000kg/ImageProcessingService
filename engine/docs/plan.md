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
    - [x] Processor `image-redact`: dùng `yolov8n-oiv7`, chỉ giữ 2 lớp `Human face` → `face`, `Vehicle registration plate` → `plate` (map tên lớp qua config, để đổi sang model fine-tune 2 nhãn chỉ cần đổi env `YOLO_MODEL_NAME` + bảng map). Lọc theo `params.redaction.targets` và `confidenceThresholds`.
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
    - [x] Chọn model face embedding chạy tốt trên CPU: Đã chọn MobileFaceNet ArcFace (`w600k_mbf.onnx` 13MB), chạy ONNX Runtime (với fallback `cv2.dnn`). Đo đạc thực tế: latency ~8ms/mặt trên CPU, RAM footprint < 30MB, vector 512-d L2-normalized.
    - [x] Whitelist: với mỗi ảnh mẫu trong `params.whitelist.faces`, phát hiện khuôn mặt (lấy khuôn mặt lớn nhất bằng YOLO), tính embedding và **cache theo key** (`f"{bucket}/{key}"`, cùng batch dùng lại, không tải lại mỗi ảnh). Ảnh mẫu rỗng/hỏng hoặc không có mặt → `WHITELIST_REFERENCE_ERROR` + ACK ngay.
    - [x] Với mỗi khuôn mặt phát hiện: tính cosine similarity với từng mẫu. ≥ `similarityThreshold` → `whitelisted: true`, `redacted: false`, kèm `whitelistRef` (vị trí mẫu khớp). Mọi khuôn mặt đều có `similarity` (cao nhất so với các mẫu) khi batch có whitelist (contract §3B). Khi phân vân thì **che**.
    - [x] Hiệu chỉnh ngưỡng: thực nghiệm trên bộ ảnh chuẩn (Obama, Hopkins, Biden, Alex, Angelina, Bradley, Kate, Paul...):
        - Cặp người lạ (62 cặp): similarity cực đại chỉ **0.1938** (Mean: 0.0712). Tại mọi ngưỡng $\ge 0.25$, False Acceptance Rate (FAR - lộ người lạ) đều là **0.0%**.
        - Cặp cùng người: chân dung chuẩn đạt **0.9632**, góc nghiêng đạt **0.4404 - 0.5352**.
        - **Khuyến nghị cho Web:** Ngưỡng mặc định `similarityThreshold` đề xuất là **`0.50`** (vừa an toàn 100% trước người lạ, vừa nhận diện tốt góc nghiêng; hoặc `0.60` nếu cực kỳ bảo thủ). Ngưỡng cảnh báo `reviewThreshold` là **`0.40`** (dưới mức này đánh dấu `lowConfidence` để Web gắn cờ).
* **Kiểm chứng:** `engine/tests/test_whitelist.py` và `test_processors.py` (13/13 tests pass 100%): test whitelist với 2 người (1 trong whitelist, 1 không) → chỉ người lạ bị che, người quen giữ nguyên 100% nét. E2E trên ảnh `two_people.jpg` (Obama + Biden) hoạt động chính xác.

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
- [ ] So sánh với `yolov8n-oiv7` trên cùng tập test (nhất là biển số VN 2 dòng, góc nghiêng, ngược sáng): chạy benchmark (`infra/bench/run.sh --save-detections` + `engine/training/accuracy/evaluate.py`, hoặc `engine/training/bench.py` không cần cluster) với `YOLO_MODEL_NAME` trỏ tới trọng số mới, để so cùng quy tắc với model gốc và deface.
- [ ] Đạt ngưỡng → đổi model qua env `YOLO_MODEL_NAME` + bảng map lớp. Field `model` trong `resultSummary` ghi tên model mới.

---

# Phase 2: Video + tối ưu (16/11 → 29/11)
- [x] **[Must, làm trước video]** `strength` **tương đối theo kích thước box** (contract §2). `_apply_redaction_style` dùng chung trong `base.py`: blur bán kính Gaussian = `strength`% chiều rộng box sau khi nới `padding` (1–50, mặc định 15), pixelate = `strength` ô theo chiều rộng box (3–32, càng nhỏ càng thô, mặc định 8). Unit test `test_relative_strength_consistency_across_scales` kiểm chứng cùng `strength` cho mặt 60 px và 600 px cho mức che tương đương (cùng 8 ô pixelate). `image_redact` và `video_redact` dùng chung hàm này.
- [ ] **[Must]** Cho cache embedding whitelist hết hạn: `WhitelistManager._cache` (`src/processors/whitelist.py`) giữ vector 512-d trong RAM worker tới khi restart hoặc đủ 1000 mục (không nơi nào gọi `clear_cache()`), nên dữ liệu sinh trắc vẫn còn, và vẫn khớp được, sau khi ảnh mẫu hoặc danh sách đã bị xoá (contract §5). Khi Web chuyển sang gửi thẳng key `lists/...` (không copy theo batch), key không đổi giữa các batch nên càng dễ gặp. Đổi sang cache có TTL ngắn (env, ví dụ `WHITELIST_CACHE_TTL_SECONDS`, mặc định 10–15 phút), vẫn giới hạn kích thước. Unit test: quá TTL thì tải và tính lại; ảnh đã bị xoá thì trả `WHITELIST_REFERENCE_ERROR`.
- [ ] **[Must]** **OCR biển số chạy thật.** Mục whitelist biển số bên dưới đã đánh dấu xong, nhưng `plate_ocr.py` thử PaddleOCR → EasyOCR → Tesseract và không thư viện nào có trong `requirements.txt`, nên OCR luôn trả rỗng: không biển nào khớp whitelist (vẫn che, an toàn nhưng tính năng chưa chạy).
  - **Dùng một thư viện: RapidOCR** (`rapidocr-onnxruntime`, model PP-OCRv4, chạy trên `onnxruntime` mà Engine đã dùng cho ArcFace). Thêm vào `requirements.txt`, bỏ chuỗi thử nhiều backend và chế độ fallback trả rỗng.
  - **Cách đọc:** chỉ chạy nhận dạng (`use_det=False, use_cls=False`) trên crop biển số gốc, **không** qua `preprocess_plate` (CLAHE làm kết quả kém hơn). Bước detect chữ của RapidOCR tách một dòng thành nhiều box chồng nhau nên lặp ký tự (`22A072661`).
  - **Biển 2 dòng:** bộ nhận dạng chỉ đọc một dòng. Đọc crop nguyên và crop chia đôi theo chiều cao, giữ kết quả có điểm nhận dạng cao hơn (không đoán theo tỉ lệ khung, vì biển 1 dòng bị nghiêng cũng cao).
  - **Kéo rộng crop 1,3 lần theo chiều ngang** trước khi nhận dạng: không kéo thì chữ số lặp liền nhau bị gộp (`43A-444.44` → `43A444`). 1,6 và 2,0 bắt đầu sai chỗ khác; thêm viền làm kém hơn.
  - **Kết quả đo** (`engine/training/ocr/`, chỉ đo phần đọc chữ, crop theo box nhãn): trên 536 biển VN của tập val `trungdinh22` (440 biển 2 dòng, đáp án từ nhãn từng ký tự), toàn bộ pipeline 65,9%, cách đọc trên **88,6%** (1 dòng 97,9%, 2 dòng 86,6%). Trên 80 biển UET đọc bằng mắt: 53,8% so với **100%**. Khoảng 0,07 s mỗi biển trên CPU, so với 0,4–0,8 s của toàn bộ pipeline. Khoảng một phần tư số lỗi ở tập `trungdinh22` là do dataset gán nhãn sai từng biển (thiếu hoặc sai một chữ số, ví dụ `59-T1 221.89` được gán `59T12219`), RapidOCR đọc đúng; phần còn lại là RapidOCR đọc sai, chủ yếu nhầm chữ và số ở dòng trên biển xe máy (B/8, D/0). Chạy lại bằng `engine/training/ocr/eval_ocr.py`.
  - Không sửa kết quả theo định dạng biển số VN (ví dụ đổi `B` thành `8`): dễ sai, che mất lỗi thật.
  - Làm cho cả **ảnh**: `image_redact.py` hiện chưa đọc `whitelist.plates`, mới có ở video. Test: đọc đúng một biển 1 dòng, một biển 2 dòng và một biển có chữ số lặp; biển đọc sai không được khớp whitelist.
- [x] **[Must]** `video-redact` trên pool `jobs.video` (worker riêng, contract §2B, §3 B2): tách khung hình (FFmpeg/OpenCV), phát hiện + **ByteTrack** để giữ id đối tượng giữa các khung (vết che không nhấp nháy, nội suy tuyến tính $\le 167$ ms, giữ vết che 200 ms ở hai đầu mỗi chuỗi phát hiện, ghi nhận `gapRanges` và `lowConfidenceRanges`), che, ghép lại MP4 H.264 (CRF map từ `params.output.quality`: standard=28, high=23, max=18, giữ độ phân giải + fps gốc), **copy 100% audio gốc** bằng FFmpeg remux (`-c:a copy`). Xóa metadata EXIF/GPS (`-map_metadata -1`), web streaming (`-movflags +faststart`). Gửi progress theo % khung hình ($\le 1$ event / 2s). Heartbeat `in_progress()` (ack_wait 5m), `JOB_DEADLINE_SECONDS = 3600` cho video.
- [x] **[Must]** Whitelist khuôn mặt cho video: trích xuất embedding ArcFace MobileFaceNet 512-d tại khung hình tối ưu `bestFrameMs` (đánh giá diện tích, confidence và độ sắc nét Laplacian). So khớp Cosine Similarity theo **track**, gán nhãn đồng bộ cho toàn bộ khung hình của track. Tiết kiệm **99.94%** số lần gọi model so với quét từng frame.
- [x] **[Should]** Whitelist biển số xe: Chuẩn hóa ký tự biển số VN (`normalize_plate_text`), OCR biển số (tiền xử lý CLAHE + cubic resize 120px) với cơ chế cắm backend (PaddleOCR / EasyOCR / PyTesseract / fallback), so khớp chính xác với `whitelist.plates`. Tuân thủ triệt để Privacy by Design (Recall > Precision): khi OCR mờ hoặc confidence $< 0.50$ thì **bắt buộc tiếp tục che**.
- [x] **[Should]** Benchmark định lượng trên CPU: Thực hiện đo đạc chi tiết qua `engine/tests/benchmark_video_cpu.py`. Đạt tốc độ 12.3 - 14.2 FPS trên CPU, mức tiêu thụ RAM đỉnh chỉ **659.7 MB** (với video 1080p), hoàn toàn an toàn trong giới hạn `resources.limits.memory: 2048Mi` của Kubernetes Pod trên node K3s lab 2C/4T/12GB. Báo cáo chi tiết: `engine/docs/benchmark_cpu_results.md`.
- [x] **[Must]** Kiểm thử tích hợp toàn trình Worker E2E: Xây dựng `engine/tests/test_worker_e2e.py` với 4/4 test cases pass 100% kiểm chứng luồng nhận job qua NATS JetStream, lưu trữ MinIO S3, heartbeat, phân loại mã lỗi Contract §4 (`INVALID_INPUT_FILE`, `UNSUPPORTED_JOB_TYPE`, `WORKER_CRASHED`).
- [~] ~~**[Could]** **[Đổi contract]** **[Cần Web]** Chế độ blockList cho `params.whitelist`: chỉ che khuôn mặt khớp mẫu. Fail-open nên dùng ngưỡng thấp hơn và đánh dấu khuôn mặt sát ngưỡng.~~ **Bỏ** (cả nhóm quyết định: không đáng công, không có use case).
- [ ] **[Should]** **[Đổi contract]** **[Cần Web]** Job chỉ render (`image-render`): nhận danh sách box cuối cùng + style, che rồi xuất ảnh, không chạy model. Dùng cho nút "Sửa ảnh" của Web.
- [ ] **[Could]** Build arg `TORCH=cpu|cuda` cho `engine/Dockerfile`: bản `cpu` nhỏ hơn nhiều cho lab (không GPU), bản `cuda` giữ khả năng chạy GPU. Ultralytics tự chọn GPU nếu torch thấy GPU, không cần đổi code.
- [ ] **[Could]** Benchmark xử lý video monolith (một process xử lý cả video) vs phân tán (chia đoạn video ra nhiều job). **[Cần Infra]** để đưa vào phần đo đạc của báo cáo.
- [ ] **[Should, sau khi xong các tính năng chính]** **[Đổi contract]** **[Cần Web]** Chọn chế độ theo job: `params.detection.mode` (`fast` | `accurate` | `max_privacy`, thiếu thì `fast`) map sang model + `imgsz` + **ngưỡng riêng cho từng class** qua env (ví dụ `MODE_FAST=yolo26n-1280-e20-crowd.pt@1280:face=0.17,plate=0.11`). Model đã chọn (`engine/models/`, đề xuất ngưỡng từ `engine/training/bench/`):

  | Chế độ | Model | Ngưỡng mặt | Ngưỡng biển số |
  | --- | --- | --- | --- |
  | `fast` | `yolo26n-1280-e20-crowd.pt` | 0.17 | 0.11 |
  | `accurate` | `yolo26s-1280-e5-plates-frozen-x3.pt` | 0.13 | 0.09 |
  | `max_privacy` | `yolo26s-1280-e5-plates-frozen-x3.pt` | 0.06 | 0.05 |

  Ngưỡng theo class trong `processors/image_redact.py`: `model.predict(conf=` ngưỡng thấp nhất `)`, rồi lọc từng box theo ngưỡng của class đó (label đã có trong vòng lặp). Worker chỉ nạp model mà job cần, lúc dùng lần đầu (`accurate` và `max_privacy` dùng chung một model), giữ một model và đổi khi job sau dùng chế độ khác (nạp lại ~1-2 s); giữ cả hai thì phải nâng memory limit (một model ở 1280 đã dùng ~1.2 GB / 1.5 GB), chốt sau khi đo. `resultSummary.model` ghi model và ngưỡng thật đã chạy. Image engine cần Ultralytics >= 8.4 (YOLO26). *(Lưu ý Task 77: Per-class confidence thresholds `face` 0.17 và `plate` 0.11 cùng parser chia sẻ đã hoàn thành; công việc chọn chế độ `params.detection.mode` vẫn để mở).*

---

## Tổng hợp việc cần phối hợp
| Khi nào | Với ai | Việc |
|---|---|---|
| M1 (28/10) | Web | Xác nhận contract §2/§3 mới (kể cả `params.output.quality` dạng mức, định dạng theo `output.key`, `whitelistRef`, `strength` tương đối theo kích thước box) và cách xử lý worker chết (§4: `MAX_ATTEMPTS`, `WORKER_CRASHED`, hạn xử lý) trước khi code |
| M2 (06/11) | Web | Ngưỡng mặc định `similarityThreshold`, `reviewThreshold` |
| M3 (09/11) | Infra | RAM/CPU đo được → memory limit, max replicas, CI image |
| M3 (12/11) | Web + Infra | Chạy luồng thật trên lab |
| Phase 2 | Web + Infra | `resultSummary` video, OCR biển số, benchmark |
