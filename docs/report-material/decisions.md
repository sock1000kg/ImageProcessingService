# Quyết định thiết kế và hạ tầng

Mỗi mục theo format **Vấn đề → Lựa chọn → Quyết định → Vì sao**. Số liệu lấy từ các file đã commit trong repo
(đường dẫn ghi ở cuối mỗi mục). Phần A–F là các quyết định chính của đồ án, phần G là các quyết định hạ tầng chi tiết.

---

## A. Vì sao chọn kiến trúc Cloud-Native

- **Vấn đề:** Bài toán là ẩn danh hoá hàng loạt ảnh và video (che mặt, biển số). Khối lượng không đều: lúc rảnh
  không có gì, lúc có người tải một thư mục hàng trăm ảnh hoặc vài video 60 giây thì cần nhiều CPU cùng lúc. Một job
  video chạy vài phút, một job ảnh chỉ vài chục mili giây. Lab chỉ có một node 2C/4T, 12GB RAM, không GPU, dùng chung
  với app khác.
- **Lựa chọn:** (a) một server monolith xử lý tuần tự trong chính tiến trình web; (b) hàng đợi + worker cố định số
  lượng; (c) kiến trúc hướng sự kiện: web chỉ nhận file và tạo job, worker tách riêng, co giãn theo độ dài hàng đợi
  (NATS JetStream + KEDA trên Kubernetes, MinIO cho file).
- **Quyết định:** (c). Web/Backend không bao giờ chạy model. Nó ghi file lên MinIO, tạo job trong PostgreSQL và
  publish lệnh lên NATS. Worker lấy lệnh, đọc/ghi MinIO, báo tiến độ qua `jobs.events`. KEDA đọc lag của consumer
  trên NATS để tăng/giảm số worker, **kể cả về 0**. Hai pool riêng cho ảnh và video.
- **Vì sao:**
  - **Tách tải:** upload và xem kết quả không bị chậm khi worker đang bận; model nặng (vài trăm MB RAM mỗi worker) chỉ
    tồn tại khi có việc, nên node chung với app khác không bị chiếm RAM thường trực.
  - **Co giãn theo việc thật:** số worker đi theo số job chờ, không theo CPU. Hai loại job có tải khác hẳn nên mỗi pool
    có ngưỡng scale, `ack_wait` và giới hạn RAM riêng (xem G.3, G.4, G.12).
  - **Chịu lỗi:** JetStream giữ message bền, worker chết giữa chừng thì message được giao lại (tối đa `max_deliver`),
    job lỗi cuối cùng được báo `FAILED` thay vì mất.
  - **Chủ quyền dữ liệu và chi phí:** dịch vụ AI thương mại (Rekognition, Google Vision) là hộp đen, tính tiền theo
    lượt và gửi media ra nước ngoài; tự chạy trên hạ tầng của nhóm giữ ảnh trong lab và cho phép tuỳ biến whitelist.
  - **Đã đo, không chỉ suy luận:** benchmark 3.726 ảnh (`infra/bench/results/comparison.md`, chạy trên laptop RTX 3050,
    không phải lab) cho 0 job lỗi ở cả ba chế độ: cố định 3 worker, scale 0→3 và scale 1→3. Scale từ 0 mất khoảng
    4–11 giây khởi động nguội mà thông lượng đo được không thấp hơn chế độ cố định cùng số worker tối đa.
- **Không làm:** không viết Operator/CRD riêng (`docs/architecture.md`): Deployment + KEDA ScaledObject + NATS đủ cho
  yêu cầu co giãn.

---

## B. Mô hình AI đã chọn và hành trình chọn

- **Vấn đề:** cần một detector che được **mặt** (kể cả mặt nhỏ trong đám đông) và **biển số xe Việt Nam** (kể cả biển
  vuông 2 dòng của xe máy), chạy được trên CPU và chính xác hơn công cụ có sẵn.
- **Cách đo:** mọi mô hình được chấm trên cùng một bộ benchmark 3.726 ảnh chưa từng đưa vào huấn luyện (3.226 ảnh
  WIDER val + 500 ảnh biển số VN), **ở cùng độ chính xác (precision) mặt = 0,79**, nên so sánh được trực tiếp. Chỉ số
  "privacy" là tỉ lệ mặt (biển số) được che từ 70% diện tích trở lên. Dữ liệu huấn luyện: WIDER FACE train (12.225
  ảnh) + biển số VN (3.428 ảnh). (`engine/training/results/README.md`, `engine/training/bench/comparison.md`)

| Bước | Thử gì | Face AP | Mặt được che | Biển được che |
| :--- | :--- | :---: | :---: | :---: |
| 0 | Mô hình gốc YOLOv8n (Open Images), không fine-tune, 640 px | 0,219 | 0,307 | 0,778 |
| 1 | Fine-tune trên WIDER + biển VN, 1280 px | 0,694 | 0,696 | 0,960 |
| 2 | Kiến trúc mới hơn: YOLO11n | 0,713 | 0,716 | 0,970 |
| 3 | Mẹo dữ liệu: pseudo-label, cắt đám đông thành ô, oversample mặt nhỏ | 0,708–0,719 | 0,709–0,724 | 0,980–0,988 |
| 4 | Mô hình to hơn: YOLO11s | 0,743 | 0,753 | 0,974 |
| 5 | **Cùng một công thức cho mọi mô hình** (1280 px, 20 epoch, crowd-tiles ngay từ đầu): YOLO26n / YOLO26s | 0,751 / 0,772 | 0,763 / 0,789 | 0,976 / 0,958 |
| 6 | Tinh chỉnh YOLO26s để lấy lại biển số (đóng băng backbone, SGD, nhân bản ảnh biển ×3) | 0,773 | 0,790 | 0,958 |
| Tham chiếu | deface (CenterFace), độ phân giải đầy đủ | 0,649 | 0,657 | không có |

- **Những gì mỗi bước dạy:**
  - Mô hình gốc gần như không thấy mặt nhỏ. Fine-tune là bước nhảy lớn nhất (Face AP 0,37 → 0,69), nhiều epoch hơn
    không giúp, **dữ liệu mới là giới hạn**.
  - Kích thước đầu vào lúc suy luận phải bằng lúc huấn luyện: cùng trọng số mất 7–21 điểm khi chạy ở 960/640 thay vì
    1280. Đầu vào lớn quan trọng hơn mô hình to.
  - Pseudo-label không giúp (chỉ thêm ~50 box); chỉ phần "cắt đám đông thành ô" giúp một chút; oversample không giúp.
  - Dưới cùng công thức, YOLO26 thắng YOLO11 cùng cỡ, cùng tốc độ GPU. YOLO26s hơn ~2,6 điểm ở mặt (chủ yếu mặt rất
    nhỏ) nhưng **kém ~2 điểm ở biển số**.
  - Fine-tune "thường" (AdamW, lr thấp) làm biển số tệ hơn bất kể dữ liệu; giữ optimizer SGD ban đầu và đóng băng
    backbone thì biển số trở lại mà mặt không đổi. Phần biển số còn thiếu chủ yếu là điểm tin cậy thấp, nên hạ ngưỡng
    riêng cho biển số là đủ.
- **Quyết định (ba chế độ phát hiện, ngưỡng theo từng lớp):**

| Chế độ | Mô hình | Ngưỡng mặt | Ngưỡng biển số |
| :--- | :--- | :---: | :---: |
| Fast | YOLO26n | 0,17 | 0,11 |
| Accurate | YOLO26s (frozen ×3) | 0,13 | 0,09 |
| Maximum privacy | cùng YOLO26s, ngưỡng rất thấp | 0,06 | 0,05 |

- **Vì sao:** Ở cùng precision của deface (0,64), Fast che 80,4% số mặt so với 72,3% của deface, và Accurate 82,7%.
  Tách ba chế độ để người dùng đổi tốc độ lấy độ an toàn: ngưỡng thấp hơn = bắt thêm mặt mờ/nhỏ nhưng che nhầm nhiều
  hơn, phù hợp nguyên tắc "thà che thừa còn hơn lộ" (mục C).
- **Trạng thái:** hai file trọng số đã nằm trong `engine/models/` và ngưỡng riêng cho từng lớp (mặt 0,17, biển 0,11) đã
  chạy trong engine. Việc chọn chế độ theo từng job (`params.detection.mode`) còn mở trong `engine/docs/plan.md`.
- **Mô hình nhận diện người quen (whitelist):** ArcFace MobileFaceNet (`w600k_mbf.onnx`, 13 MB, vector 512 chiều), ~8–10
  ms/mặt trên CPU, RAM < 30 MB, chạy chung ONNX Runtime với OCR. Đo trên cặp người lạ (62 cặp): similarity lớn nhất chỉ
  0,1938, nên ở mọi ngưỡng ≥ 0,25 tỉ lệ nhận nhầm người lạ là 0%. Ngưỡng mặc định hiện là **0,45**.

---

## C. Chiến lược che mặt và biển số (tối ưu phát hiện và tối ưu việc che)

- **Nguyên tắc gốc: Privacy by Design, recall quan trọng hơn precision.** Bỏ sót một khuôn mặt hay biển số lạ (lộ dữ
  liệu cá nhân) nguy hiểm hơn che nhầm một người quen. Mọi quyết định mơ hồ đều rơi về phía **che**: OCR không chắc →
  vẫn che; similarity dưới ngưỡng → vẫn che; ảnh mẫu whitelist bị mất khi retry → người đó bị che.

### C.1 Tối ưu phát hiện
- **Mô hình riêng cho hai lớp, đầu vào 1280 px** (mục B): fine-tune trên dữ liệu mặt đám đông + biển số VN; ngưỡng tin
  cậy theo từng lớp (mặt 0,17, biển 0,11) thay vì một ngưỡng chung, vì biển số có điểm thấp hơn mặt nhưng vẫn đáng giữ.
- **Dữ liệu cho mặt nhỏ:** 45 ảnh đám đông (> 300 mặt/ảnh) bị loại vì tràn bộ nhớ GPU được cắt thành 236 ô và thêm lại.
- **Lọc nhiễu thật sự gặp trên video hành trình:** bộ lọc "phụ kiện buồng lái" bỏ các box `face` tròn nằm ở góc dưới
  bên phải (đèn trợ sáng xe máy bị nhận nhầm là mặt), gỡ 533 khung bị che nhầm.
- **Video: theo dõi thay vì phát hiện từng khung.** ByteTrack gán `trackId` cho mỗi người/biển số; mất phát hiện vài
  khung thì nội suy box; giữ vết che thêm ~200 ms hai phía mỗi chuỗi phát hiện để mặt không lộ khi vừa xuất hiện hoặc
  vừa khuất. Box có điểm thấp vẫn được giữ nếu track đã tồn tại (khôi phục điểm thấp), box không có ID được nối với
  track cũ bằng IoU > 0,4 trước khi tạo ID mới.
- **Whitelist mặt theo track, không theo khung:** nhúng ArcFace một lần ở khung đẹp nhất của track (xét diện tích,
  confidence và độ sắc nét Laplacian), gán nhãn cho cả track. Giảm 99,94% số lần gọi model so với quét từng khung.
- **Whitelist biển số bằng OCR, thiết kế quanh các lỗi thật của biển VN** (`engine/docs/plate-ocr-technical-report.md`):
  - RapidOCR (PP-OCRv4, ONNX) chỉ ở chế độ **nhận dạng** trên crop YOLO đã có (chạy thêm text detector làm lặp ký tự,
    chậm hơn 10 lần).
  - Chiến lược `whole_or_split` đọc cả biển và từng nửa trên/dưới rồi chọn theo điểm tin cậy: biển vuông 2 dòng của
    xe máy từ 0% lên 86,6% chính xác mà biển dài 1 dòng vẫn 98%.
  - Kéo ngang 1,3× chống gộp ký tự lặp (`43A-444.44` bị đọc thành `43A444`); bỏ CLAHE vì thực nghiệm làm tệ hơn.
  - So khớp mờ: chấp nhận các cặp nhập nhằng quang học (`L`↔`1`, `8`↔`B`, `0`↔`D/O`, `2`↔`Z`) và khoảng cách
    Levenshtein ≤ 1 cho chuỗi dài, nhưng chỉ khi OCR đủ chắc.
  - Kết quả: 100% (80/80) trên tập biển UET tự gán nhãn, 88,6% trên 536 biển xe máy/ô tô, ~73 ms/biển (nhanh hơn 10,4
    lần so với pipeline đầy đủ), RAM ~175 MB, thay thế Tesseract (18,3%).
  - **Kế thừa quỹ đạo có kiểm soát:** một track biển số chỉ được "kế thừa" trạng thái whitelist từ track đã khớp OCR
    trực tiếp khi nằm trong 1,5× kích thước và không có track nào đọc ra chữ xung đột. Chặn việc xe lạ đi qua bị
    miễn che do dây chuyền kế thừa.
- **Mặt và biển số dùng chung một cơ chế an toàn:** whitelist chỉ có chế độ **allow** (không che ai trong danh sách);
  chế độ block (chỉ che cái khớp) đã bỏ để không có đường nào dẫn tới việc không che.

### C.2 Tối ưu việc che
- **Độ mạnh tương đối theo kích thước box** (sau khi nới `padding` 10%): blur Gaussian có sigma = `strength`% chiều rộng
  box (1–50, mặc định 15); pixelate là số ô theo chiều rộng (3–32). Mặt to hay nhỏ đều bị che "như nhau", thay vì một
  bán kính cố định làm mặt nhỏ vẫn nhận ra, mặt lớn bị nhoè thừa.
- **Chỉ đụng vào đúng vùng cần che:** kiểm thử xác nhận 100% pixel ngoài box giữ nguyên. Blur chỉ dùng điểm ảnh bên
  trong vùng (không kéo màu từ ngoài vào).
- **Giữ nguyên độ phân giải và âm thanh:** ảnh/video ra cùng kích thước nên box trong báo cáo khớp cả ảnh gốc lẫn kết
  quả; audio video được copy nguyên (`-c:a copy`) thay vì mã hoá lại.
- **Xoá metadata:** EXIF/GPS bị xoá khỏi mọi kết quả (`-map_metadata -1` với video), vì ảnh kết quả có thể chia sẻ.
- **Mức chất lượng nén `standard`/`high`/`max`** do Engine ánh xạ sang tham số từng bộ mã hoá (JPEG dừng ở 95 vì cao
  hơn gần như không đẹp hơn mà file to hơn nhiều).
- **Sửa tay thay cho việc cố ép model đúng 100%:** nút "Sửa ảnh" cho người dùng bật/tắt box, vẽ thêm box, đổi style;
  mỗi lần sửa là một job `image-render` mới từ ảnh **gốc** (không che chồng lên kết quả cũ). Xem mục D về những gì được
  đưa ra để người dùng kiểm tra.
- **Xem trước phía trình duyệt dùng đúng công thức của Engine:** web vẽ blur/pixelate bằng cùng công thức (sigma theo
  % chiều rộng, lấy mẫu mép bằng cách phản chiếu chính vùng đó) để xem trước không chênh với kết quả thật.

---

## D. Cái gì được coi là "cần xem lại" (needs review) và vì sao

- **Vấn đề:** model luôn có lúc sai. Muốn người dùng kiểm tra đúng những chỗ có rủi ro thật, nhưng nếu đánh dấu quá
  nhiều thì họ sẽ bỏ qua tất cả (cảnh báo mất tác dụng). Một video 18 giây từng bị gắn **88** mục cần xem.

### D.1 Với ảnh
Một phát hiện được đưa vào "cần xem lại" khi:
1. **Điểm tin cậy thấp:** confidence dưới `reviewThreshold` (mặc định 0,25). Vẫn **được che**, chỉ gắn cờ để người dùng
   xác nhận. Mặt có chiều rộng < **16 px** không được tính: đó là nhiễu nền, từ ~16 px trở lên mới còn nhận ra được.
2. **Similarity sát ngưỡng whitelist:** trong khoảng ±0,05 quanh `similarityThreshold`, cả với mặt được giữ lại lẫn mặt
   bị che. Đây là chỗ nguy hiểm nhất: một mặt lạ bị nhận nhầm là người quen sẽ **không được che**.
3. **Engine tự báo `needsReview`.**

Ảnh cần xem được xếp theo mức rủi ro: sát ngưỡng whitelist trước, rồi mặt lớn trước (mặt to dễ nhận ra hơn), rồi
confidence thấp nhất. Mỗi dòng ghi lý do cụ thể ("kept face near whitelist threshold (similarity 0.47, threshold 0.45)").

### D.2 Với video
Báo cáo video được dựng từ các **track** (mỗi track là một người/biển số) với cùng quy tắc trên, thêm hai điều chỉnh
cho đặc thù video:
- **Khoảng mất theo dõi ("gap") = có thể chưa được che.** Đây là rủi ro lớn nhất của video, nên có lý do riêng:
  "Possible redaction gap", kèm khoảng thời gian (`may be unredacted at 0:09.2–0:11.0`).
- **Lọc nhiễu do tracker nhấp nháy:** một track chỉ được xem lại khi kéo dài ≥ **0,5 s** và có một đoạn điểm thấp hoặc
  một gap dài ≥ **0,25 s**. Trong video thử, 215/260 track ngắn hơn 0,5 s và chỉ lệch điểm vài khung. Đo trên video đó:
  không lọc = 88, chỉ lọc track ngắn = 34, lọc thêm đoạn ngắn = **7**. Mặt < 16 px cũng bị bỏ như với ảnh.
- **Chỉ ra "ở đâu":** mỗi mục ghi khoảng thời gian; bấm vào sẽ dừng video đúng khung mà box được đo và vẽ box lên (Engine
  chỉ lưu một box mỗi track, nên vẽ khi đang phát sẽ sai chỗ). Dòng trong báo cáo cấp batch chỉ hiện tên video, danh
  sách chi tiết nằm trong trình xem video.
- **Vì sao hai ngưỡng này:** chọn từ số liệu video thật chứ không phải benchmark, nên là hằng số trong
  `web/backend/src/dto/batch.dto.ts` (`VIDEO_MIN_TRACK_MS`, `VIDEO_MIN_RANGE_MS`), dễ chỉnh khi có thêm dữ liệu.

**Triết lý chung:** tất cả mục "cần xem lại" đều **đã được che** trừ trường hợp người quen (cố ý không che). Cờ xem lại
chỉ để con người xác nhận hai loại sai: che nhầm người quen, hoặc để lọt người lạ.

---

## E. Chính sách lưu trữ và xoá dữ liệu

- **Vấn đề:** ảnh gốc chứa khuôn mặt và biển số, tức dữ liệu cá nhân; ảnh mẫu whitelist còn là **dữ liệu sinh trắc**.
  Nhưng giữ dữ liệu cũng có giá trị: người dùng muốn sửa ảnh, thử lại ảnh lỗi, chạy lại batch với cấu hình khác mà không
  phải tải lại.
- **Lựa chọn:** (a) xoá mọi thứ sau 24 giờ ở tầng lưu trữ (MinIO lifecycle); (b) giữ vô thời hạn; (c) giữ tới khi người
  dùng xoá, kèm hạn tuỳ chọn do quản trị đặt, và xoá riêng dữ liệu sinh trắc ngay khi hết cần.
- **Quyết định:** (c), logic nằm ở **web**, không nằm ở MinIO:
  - **Ảnh gốc và kết quả:** giữ tới khi người dùng xoá batch (xoá cả prefix `uploads/<batchId>/`, `results/<batchId>/` và
    dòng DB). Quản trị viên có thể đặt `RETENTION_DAYS` để web dọn các batch cũ hơn N ngày (cả MinIO và PostgreSQL);
    để trống nghĩa là giữ mãi. Bộ dọn chạy định kỳ (mặc định 10 phút).
  - **Batch nháp** (đã tải lên nhưng chưa bấm chạy): luôn bị dọn sau 24 giờ, để ảnh gốc private không đọng lại khi
    không ai dùng.
  - **Ảnh mẫu whitelist tải riêng cho batch:** xoá ngay khi mọi job trong batch kết thúc, không chờ 24 giờ.
  - **Danh sách khuôn mặt đã lưu (Allow list):** chỉ lưu khi người dùng chủ động bấm lưu, giữ tới khi họ xoá. Batch tham
    chiếu trực tiếp ảnh của danh sách (không sao chép); xoá một mặt hoặc cả danh sách xoá object trên MinIO ngay.
  - **Không bao giờ public:** ảnh mẫu và danh sách khuôn mặt chỉ truy cập qua URL ký ngắn hạn.
  - **Thử lại khi ảnh mẫu đã bị dọn:** backend báo `409 WHITELIST_FACES_MISSING` và xin xác nhận; nếu đồng ý, những người
    thiếu ảnh mẫu sẽ bị che (hướng an toàn).
- **Vì sao bỏ lifecycle 24 giờ của MinIO (đảo ngược quyết định cũ):** Phase 1 chưa có tài khoản nên 24 giờ là hợp lý.
  Sang Phase 2 (có thư viện media) quy tắc ở MinIO trở thành lỗi: nó xoá file **mà dòng DB vẫn còn**, nên giao diện
  hiện batch cũ nhưng ảnh trả `NoSuchKey`. Đã xảy ra thật trên lab. Hạn xoá phải do một nơi duy nhất quyết định (web)
  để xoá cả file lẫn dòng DB cùng lúc; `infra/app/minio/setup-buckets.sh` giờ chủ động gỡ rule cũ (`mc ilm rule rm`).
- **Hạn chế:** `RETENTION_DAYS` hiện là một giá trị toàn hệ thống; hạn riêng theo người dùng bị hoãn vì phải đổi contract
  §5. Bộ dọn chưa loại trừ batch đang chạy (việc của Engine/Backend khác, ghi ở `web/docs/plan.md`).

---

## F. Chính sách tải lên, tải xuống và truyền file

### F.1 Tải lên
- **Vấn đề:** thư mục vài trăm ảnh, file lớn, mạng chập chờn, và giới hạn tốc độ; không muốn mất công khi một file lỗi.
- **Quyết định:**
  - **Tạo batch nháp trước, rồi tải từng file một** (`POST /api/batches/:id/files`), cuối cùng mới `start`. Mỗi file là
    một request nên một file hỏng hoặc đụng giới hạn không làm mất các file khác, và bộ đếm tiến độ chính xác. Giá phải
    trả là nhiều request hơn.
  - **Hai worker song song ở trình duyệt:** nhanh hơn một, đủ ít để không vượt giới hạn tốc độ. Gặp `429` thì cả hai
    cùng nghỉ theo `Retry-After` rồi gửi lại **đúng file đó** (không tính là lần thử lại); lỗi khác được thử lại một lần
    rồi đánh dấu lỗi. Batch đầy (`BATCH_FULL`) thì dừng cả mẻ. Nếu có file lỗi thì **không** `start`, người dùng thử lại
    riêng các file đó trong cùng batch nháp.
  - **Chỉ nhận JPG/PNG/WEBP và MP4**, mỗi file tối đa 50 MB; kiểm tra phía trình duyệt (để báo lý do từng file bị từ
    chối) và kiểm tra lại ở backend.
  - **Xác thực trước khi nhận file:** `requireAuth` chạy trước multer, nên request ẩn danh bị từ chối trước khi đệm file
    vào RAM.
  - **Video dùng multipart theo mảnh 8 MB** (S3 multipart): mỗi mảnh một `PUT`, thử lại một lần, `complete` ghép lại, lỗi
    thì huỷ phiên để không đọng mảnh dở. Backend so kích thước thực với kích thước khai báo, rồi kiểm tra bằng ffprobe
    (H.264, 15–60 giây) **trước khi** tạo job, vì file hỏng là lỗi đáng báo ngay lúc tải chứ không phải sau vài phút trong
    hàng đợi.
  - **Phải giữ tab mở** trong lúc tải (trình duyệt hiện cảnh báo): tải lên do trình duyệt điều phối.

### F.2 Tải xuống và hiển thị
- **Vấn đề:** ảnh/video kết quả lớn không nên đi qua backend, nhưng ảnh gốc và kết quả là dữ liệu riêng tư.
- **Lựa chọn:** (a) bucket `results` public chỉ-đọc, bảo vệ bằng UUID khó đoán; (b) backend stream mọi file; (c) **URL ký
  (presigned) ngắn hạn** do backend cấp sau khi kiểm tra quyền sở hữu, tải thẳng từ MinIO.
- **Quyết định:** (c). Bucket không còn quyền ẩn danh. Backend kiểm tra người dùng có sở hữu job rồi ký URL cục bộ
  (không gọi mạng) bằng host công khai `blob-imgproc.sock1000kg.io.vn`; chữ ký gắn với host và đường dẫn nên host dùng
  để ký phải trùng host trình duyệt gọi. Ảnh kết quả sống 1 giờ, ảnh gốc và ảnh mẫu sống 5 phút. Trình duyệt tự xin URL
  mới trước khi hết hạn 30 giây, khi quay lại tab (timer có thể bị tạm dừng) và khi ảnh lỗi tải (thử một lần cho mỗi URL).
  Gateway chỉ cho `GET`/`HEAD` trên host này để object store không bao giờ nhận yêu cầu ghi từ ngoài.
- **Vì sao:** UUID khó đoán là bảo vệ yếu: ai có link là xem được và link không thu hồi được. URL ký thu hồi bằng thời
  gian, gắn với quyền sở hữu, và vẫn không bắt backend gánh băng thông.
- **Tải cả batch (zip):** backend ký **token 60 giây** gắn với một người dùng và một batch, trình duyệt điều hướng tới
  `download.zip?token=…`, backend dựng zip **luồng** từ MinIO từng object một, không đệm cả file trong RAM và không ghi
  đĩa; client ngắt kết nối thì huỷ luồng đang mở. Cần token vì tải qua điều hướng trình duyệt không gửi được header
  xác thực tuỳ chọn.
- **Kết nối nội bộ và công khai tách đôi:** backend dùng tên Service trong cụm (`minio:9000`) để upload/xoá/stream zip,
  chỉ dùng host công khai để ký URL cho trình duyệt.

---

## G. Quyết định hạ tầng (Infra)

### G.1 Thuê (tenant) trên cụm Lab-sock sẵn có thay vì dựng cụm riêng
- **Vấn đề:** Cần NATS/PostgreSQL/MinIO/KEDA + Gateway + Tunnel + metrics.
- **Lựa chọn:** (a) kind/k3s riêng cho project; (b) làm tenant trên cụm Lab-sock (k3s, node `home-server`, Traefik
  Gateway API, cloudflared, sealed-secrets, prom-agent, StorageClass `local-path`).
- **Quyết định:** (b).
- **Vì sao:** Không tốn thêm tài nguyên cho control plane; dùng lại Gateway/Tunnel/metrics đã có; phù hợp "làm infra,
  không làm DevOps".

### G.2 NATS JetStream thay vì Redis / RabbitMQ
- **Vấn đề:** Cần hàng đợi bền vững + consumer lag để KEDA scale theo queue.
- **Lựa chọn:** Redis Streams/BullMQ, RabbitMQ, NATS JetStream.
- **Quyết định:** NATS JetStream (nats-server 2.x, file store trên PVC).
- **Vì sao:** Lag theo consumer là metric chuẩn của KEDA (`nats-jetstream` trigger); NATS nhẹ hơn RabbitMQ, không cần
  operator riêng; hệ thống đã chốt NATS trong hợp đồng tích hợp.

### G.3 Tách stream theo pool + workqueue retention
- **Vấn đề:** Pool ảnh và pool video cần scale độc lập; event trạng thái chỉ có một bên đọc (backend).
- **Quyết định:** `IMAGE_JOBS`, `VIDEO_JOBS` (workqueue) + `JOB_EVENTS` (workqueue, ack nhanh).
- **Vì sao:** Mỗi pool một stream/consumer riêng → KEDA scale độc lập, không cạnh tranh message; workqueue đảm bảo 1
  message chỉ 1 worker xử lý, không cần dedup ở tầng trên. Vì chỉ backend đọc event nên `JOB_EVENTS` dùng một consumer
  duy nhất (`backend-job-events`); nếu thêm consumer thứ hai phải đổi sang retention `limits`.

### G.4 Chọn `ack_wait` / `max_deliver`
- **Vấn đề:** Job video chạy hàng phút, job ảnh nhanh, event backend xử lý rất nhanh.
- **Quyết định:** `video-workers` 5 phút, `image-workers` 1 phút, `backend-job-events` 30 giây; `max_deliver` lần lượt
  5 / 5 / 10. Phía Engine, một job còn có thời hạn riêng (`JOB_DEADLINE_SECONDS`: 300 s cho ảnh, 3600 s cho video).
- **Vì sao:** `ack_wait` phải dài hơn thời gian xử lý thật để không giao lại giữa chừng; event cần fail-fast để backend
  không bị nghẽn.

### G.5 SealedSecrets thay vì Secret plaintext hay external secret manager
- **Vấn đề:** Secret cần commit an toàn cho cả team nhưng không nằm trong git dạng plaintext.
- **Lựa chọn:** (a) commit Secret plaintext; (b) SealedSecrets; (c) Vault / External Secrets Operator.
- **Quyết định:** (b), `infra/seal.sh` seal từ file `real-secret.yaml` bị gitignore.
- **Vì sao:** Lab đã có sealed-secrets controller; không thêm operator mới; file mẫu commit được để teammate tự tạo
  secret mà không cần admin.

### G.6 Ngân sách tài nguyên trên 2C/4T/12GB/HDD
- **Vấn đề:** Lab còn app khác; tổng giới hạn RAM của nền tảng phải ≤ ~2,5Gi (chart MinIO mặc định xin 16Gi).
- **Quyết định:** Đặt limit thủ công từng container (Postgres 384Mi, MinIO 512Mi, exporter 32Mi…); ngưỡng cứng 2560Mi áp
  dụng cho nền tảng chạy thường trực (NATS, Postgres, MinIO, KEDA), **không tính Job setup một lần**. RAM worker
  (một model ở 1280 px dùng ~1,2 GB) báo cáo riêng vì worker scale từ 0 nên không chiếm RAM thường trực.
- **Vì sao:** Phải giới hạn tổng để chạy chung với app khác; Job setup chỉ tồn tại vài phút nên không chiếm ngân sách.

### G.7 Giữ chart PostgreSQL của Bitnami
- **Vấn đề:** Bitnami ngừng đẩy tag phiên bản lên Docker Hub (chỉ còn `latest`).
- **Quyết định:** Giữ chart `postgresql` 18.11.5, pin image theo digest của bản 18.6.0; exporter dùng
  `bitnamilegacy/postgres-exporter`.
- **Vì sao:** Không đổi chart (giữ convention của lab) mà vẫn có digest bất biến thay vì `latest` trôi theo thời gian.

### G.8 Tự build image MinIO
- **Vấn đề:** MinIO đã đóng băng; `quay.io/minio/minio` trả 401, `docker.io/minio/*` bị từ chối, `dl.min.io` trả 410.
  Image cũ không còn kéo được nên Deployment và Job setup sẽ `ImagePullBackOff`.
- **Lựa chọn:** (a) `bitnamilegacy/minio` (entrypoint không tương thích); (b) Chainguard (rủi ro giấy phép); (c) chuyển
  sang SeaweedFS/Garage (cả một lần migrate); (d) tự build từ source.
- **Quyết định:** (d), `infra/images/minio/Dockerfile` build server tại tag `RELEASE.2025-10-15T17-29-55Z` (có bản vá
  GHSA-jjjj-jwhf-8rgr), kèm client `mc` đã verify sha256. Một image `socknot1000kg/minio:<tag>` dùng cho Deployment, Job,
  compose và smoke test; giữ `LICENSE`/`CREDITS` theo AGPL-3.0.
- **Vì sao:** Có bản vá mới nhất, tự build lại được, tuân thủ giấy phép, không phải migrate giữa chừng.

### G.9 `namespace:` của kustomize phải nằm trên `helmCharts`
- **Vấn đề:** `namespace: keda` ở top-level ghi đè namespace của cả RoleBinding mà chart cố ý đặt ở `kube-system`;
  binding mất tác dụng và metrics apiserver crash-loop (`unable to load configmap based request-header`).
- **Quyết định:** đặt `namespace: keda` trong entry `helmCharts`; `deploy.sh cluster` restart metrics apiserver trước khi
  chờ rollout rồi chờ `apiservice/v1beta1.external.metrics.k8s.io` `Available`; `verify-render.sh` có allow-list
  `kube-system` và coi resource namespaced thiếu `metadata.namespace` là lỗi.

### G.10 Init container `chown` thay vì `setfacl`
- **Vấn đề:** Thư mục lưu trữ của lab có POSIX ACL với mask chặn lớp group, nên MinIO/Postgres chạy non-root không ghi được.
- **Lựa chọn:** (a) `setfacl -k` toàn lab; (b) chạy bằng root; (c) init container chỉ `chown`.
- **Quyết định:** (c): chạy uid 0 với `drop: ALL` + `CHOWN` + `FOWNER`, chỉ `chown` volume về đúng uid/gid. **Không sửa
  ACL của lab** vì app khác có thể phụ thuộc vào nó; `verify-render.sh` chặn việc quay lại thiếu init container.

### G.11 Hợp nhất dev và prod thành một môi trường `imgproc`
- **Vấn đề:** Chạy song song `imgproc-dev` và `imgproc-prod` làm gấp đôi tài nguyên nền trên một node 12GB chung.
- **Quyết định:** một namespace `imgproc`, cấu hình kích thước như prod, host công khai `imgproc.sock1000kg.io.vn`
  (và `blob-imgproc.sock1000kg.io.vn` cho tải file, mục F.2); cả nhóm tích hợp và kiểm thử trực tiếp ở đó.
- **Vì sao:** Tiết kiệm tài nguyên, đơn giản hoá vận hành và kiểm thử E2E cho nhóm đồ án.

### G.12 Chia pool worker theo loại media (ảnh / video)
- **Vấn đề:** Mọi job đều dùng model AI nên cách chia cũ "AI / xử lý thường" mất nghĩa; ảnh (hàng trăm job nhỏ) và video
  (một job chạy hàng phút, nặng CPU vì ByteTrack + FFmpeg) có tải khác hẳn.
- **Lựa chọn:** (a) một pool chung; (b) giữ tên cũ; (c) `IMAGE_JOBS`/`jobs.image` và `VIDEO_JOBS`/`jobs.video`.
- **Quyết định:** (c). Mỗi ảnh là một job riêng nên hàng đợi phản ánh khối lượng thật; KEDA scale pool ảnh theo số ảnh
  chờ, pool video theo từng video (lagThreshold 1).
- **Vì sao:** Một pool chung thì video dài chặn hàng trăm ảnh nhỏ phía sau và không chỉnh được ngưỡng scale riêng; chia
  pool cho mỗi bên đúng `ack_wait`, giới hạn RAM và ngưỡng KEDA, và giữ được thí nghiệm co giãn độc lập hai pool.

### G.13 Ghim image engine theo mã commit
- **Vấn đề:** Image engine nặng vài GB; theo `:main` thì mỗi build CI mới kéo lại toàn bộ lên node ở lần scale-up kế tiếp.
- **Quyết định:** ghim `newTag` theo SHA commit trong `infra/app/engine-workers/kustomization.yaml` và chủ động nâng
  khi cần. Image web theo `:main` (nhỏ, `imagePullPolicy: Always`), migration chạy khi pod khởi động
  (`prisma migrate deploy`).
