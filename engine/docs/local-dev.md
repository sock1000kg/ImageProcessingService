# Hướng Dẫn Vận Hành & Kiểm Thử Cục Bộ (Execution & Testing Guide)
## Cloud-Native Privacy Service — Engine Worker

> **Dành cho:** Lập trình viên phụ trách Engine và các AI Agent trong mọi phiên làm việc tiếp theo.  
> **Mục tiêu:** Cung cấp quy trình từng bước rõ ràng, chính xác để khởi động môi trường, chạy kiểm thử đơn vị (Unit Test) và kiểm thử tích hợp đầu-cuối (End-to-End Test) hoàn toàn độc lập mà **không cần chạy Web Frontend/Backend và không cần Kubernetes**.

---

## ⚡ Bảng Tra Cứu Lệnh Nhanh (Cheat Sheet)

| Tác vụ | Lệnh thực thi (PowerShell từ thư mục gốc hoặc `engine/`) | Mục đích |
| :--- | :--- | :--- |
| **1. Bật Hạ tầng** | `docker compose -f infra/docker-compose.yaml up -d` | Dựng NATS JetStream, MinIO, Postgres |
| **2. Chạy Unit Test** | `python tests/test_processors.py` *(trong thư mục `engine/`)* | Test logic che, padding, EXIF (không cần Docker) |
| **3. Bật Worker** | `python src/main.py` *(trong thư mục `engine/`)* | Khởi động Worker chờ nhận job từ NATS |
| **4. Bắn Job Test** | `python tests/mock_backend.py image-redact [duong_dan_anh]` | Giả lập Backend gửi job, nhận kết quả vào `output/` |

---

## 1. Khởi động Hạ tầng Nền tảng (NATS + MinIO)

Dự án dùng chung file `infra/docker-compose.yaml` (chứa các script cấu hình stream và bucket giống 100% trên cluster Kubernetes):

Tại thư mục gốc của repository:
```powershell
# 1. Tạo file cấu hình môi trường nếu chưa có
if (-not (Test-Path infra/.env)) { cp infra/.env.example infra/.env }

# 2. Khởi động NATS JetStream, MinIO và PostgreSQL
docker compose -f infra/docker-compose.yaml up -d
```

### Các dịch vụ được kích hoạt:
* **NATS JetStream:** Cổng `4222` (client), cổng `8222` (dashboard kiểm tra `http://localhost:8222`).
  * Tự động tạo stream `IMAGE_JOBS` (consumer `image-workers`) và `JOB_EVENTS`.
* **MinIO Storage:** Cổng `9000` (S3 API), cổng `9001` (Web Console `http://localhost:9001`, user: `minioadmin`, pass: `minioadmin`).
  * Tự động tạo 2 bucket: `uploads` (private) và `results` (public read).

> 💡 *Mẹo:* Nếu xóa volume Docker hoặc NATS báo thiếu stream/consumer, chạy lại lệnh cấu hình độc lập:
> ```powershell
> docker compose -f infra/docker-compose.yaml run --rm nats-setup
> docker compose -f infra/docker-compose.yaml run --rm minio-setup
> ```

---

## 2. Kiểm Thử Đơn Vị (Unit Testing — Không cần Docker)

Trước khi bật worker kết nối mạng, luôn chạy bộ test độc lập để đảm bảo thuật toán AI và xử lý ảnh hoạt động hoàn hảo:

Tại thư mục `engine/`:
```powershell
cd engine
python tests/test_processors.py
```

### Bộ test tự động kiểm tra 7 tiêu chí theo hợp đồng hệ thống:
1. **3 Phong cách che (`test_redaction_styles`):** Kiểm tra `blur` (Gaussian), `pixelate` (Mosaic) và `blackout` (tô đen).
2. **Nới viền (`test_padding_and_preservation`):** Khung bao được nới theo tỷ lệ `padding` nhưng không vượt ra ngoài biên ảnh.
3. **Bảo toàn điểm ảnh (`test_pixel_invariance_outside_box`):** 100% pixel nằm ngoài khung bao được giữ nguyên bản gốc, không bị biến đổi.
4. **Xóa dữ liệu nhạy cảm (`test_exif_removal`):** Toàn bộ thẻ metadata EXIF, GPS, thiết bị chụp bị xóa sạch khỏi file kết quả.
5. **Bắt lỗi tệp hỏng (`test_invalid_input_file`):** Trả về ngoại lệ `InvalidInputFileError` đối với file rỗng hoặc không phải ảnh.
6. **Đa dạng định dạng xuất (`test_output_formats`):** Xuất ảnh chuẩn xác theo đuôi mở rộng yêu cầu (`.jpg`, `.png`, `.webp`).
7. **Khớp Hợp đồng JSON (`test_contract_result_summary_schema`):** Metadata `resultSummary` có đủ `imageSize`, `counts`, `detections`, `model`, `processingTimeMs`.

---

## 3. Khởi động Engine Worker

Mở một cửa sổ Terminal (Terminal 1) để chạy Worker lắng nghe hàng đợi NATS:

```powershell
cd engine

# Thiết lập biến môi trường (mặc định đã được cấu hình trong config.py)
$env:NATS_URL = "nats://localhost:4222"
$env:NATS_STREAM_NAME = "IMAGE_JOBS"
$env:NATS_CONSUMER_NAME = "image-workers"
$env:NATS_SUBJECTS = "jobs.image"
$env:MINIO_ENDPOINT = "localhost:9000"
$env:MINIO_ACCESS_KEY = "minioadmin"
$env:MINIO_SECRET_KEY = "minioadmin"
$env:YOLO_MODEL_NAME = "yolov8n-oiv7.pt"

# Khởi động worker
python src/main.py
```

### Dấu hiệu Worker khởi động thành công:
```text
INFO:root:Connected to NATS at nats://localhost:4222
INFO:root:Worker [worker-xxxx] binding to pre-provisioned consumer 'image-workers' on stream 'IMAGE_JOBS'...
INFO:root:Initializing YOLO model for image-redact from: models/yolov8n-oiv7.pt...
INFO:root:YOLO model (yolov8n-oiv7) loaded successfully with 600 classes!
INFO:root:Worker started. Waiting for jobs on subjects: ['jobs.image']...
```

---

## 4. Kiểm Thử Tích Hợp Đầu-Cuối (End-to-End Test với Mock Backend)

Mở một cửa sổ Terminal khác (Terminal 2) để đóng vai Backend gửi job vào hệ thống:

### Cách 4.1: Test nhanh với ảnh mẫu tự sinh trong RAM
```powershell
cd engine
python tests/mock_backend.py image-redact
```

### Cách 4.2: Test với ảnh thực tế trên máy tính của bạn (Khuyên dùng)
Bạn có thể truyền đường dẫn tới bất kỳ bức ảnh chụp người hoặc xe nào trên máy:
```powershell
python tests/mock_backend.py image-redact "D:\Photos\test_street.jpg"
```

### Cách 4.3: Test các phong cách che khác nhau
```powershell
# 1. Test làm mờ Gaussian Blur
python tests/mock_backend.py image-redact-blur "D:\Photos\test_face.jpg"

# 2. Test che hộp đen Blackout
python tests/mock_backend.py image-redact-blackout "D:\Photos\test_car.jpg"
```

### Luồng xử lý tự động của `mock_backend.py`:
1. Tải ảnh lên MinIO bucket `uploads/<batchId>/<jobId>/input.jpg`.
2. Bắn lệnh Job Command vào NATS JetStream kênh `jobs.image`.
3. Lắng nghe sự kiện từ Worker qua kênh `jobs.events`:
   * `[EVENT] Status: PROCESSING (Progress: 10%, Stage: DOWNLOADING_INPUT)`
   * `[EVENT] Status: PROCESSING (Progress: 40%, Stage: PROCESSING)`
   * `[EVENT] Status: PROCESSING (Progress: 85%, Stage: UPLOADING_OUTPUT)`
   * `[EVENT] Status: COMPLETED (Progress: 100%, Stage: DONE)`
4. Tự động tải file kết quả từ MinIO về thư mục: **`engine/output/<jobId>_result.jpg`**.
5. Bạn chỉ cần mở thư mục `output/` lên để xem ảnh kết quả trực quan!

---

## 5. Xử Lý Các Lỗi Thường Gặp (Troubleshooting)

| Hiện tượng | Nguyên nhân | Cách khắc phục 1-click |
| :--- | :--- | :--- |
| `Consumer 'image-workers' not found` | Docker compose vừa xóa volume nên NATS chưa tạo consumer | Chạy lệnh: `docker compose -f infra/docker-compose.yaml run --rm nats-setup` |
| `Bucket 'uploads' does not exist` | MinIO chưa chạy script tạo bucket | Chạy lệnh: `docker compose -f infra/docker-compose.yaml run --rm minio-setup` |
| `Cannot connect to NATS at localhost:4222` | Docker container chưa được bật | Chạy lệnh: `docker compose -f infra/docker-compose.yaml up -d` |
| `ModuleNotFoundError: No module named '...'` | Đang chạy sai môi trường Python | Kích hoạt đúng môi trường: `conda activate base` hoặc cài đặt thư viện qua: `pip install -r requirements.txt` |
