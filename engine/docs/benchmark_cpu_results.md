# Báo cáo Đo lường & Đánh giá Hiệu năng Hệ thống Video Redaction (YOLO on GPU NVIDIA GeForce RTX 3050 Laptop GPU)

**Dự án:** Cloud-Native Smart Media Privacy Service (UET - VNU)
**Thời gian đo:** 2026-11-26 03:56:35
**Phân hệ:** AI Engine Worker (`VideoRedactProcessor`)

## 1. Thông số Phần cứng & Môi trường Thực nghiệm
| Thông số | Giá trị |
|---|---|
| **Hệ điều hành** | Linux 6.6.87.2-microsoft-standard-WSL2 (64bit) |
| **Bộ vi xử lý (CPU)** | x86_64 |
| **Số nhân / Số luồng** | 8 Cores / 16 Threads |
| **Bộ nhớ RAM vật lý** | 9.71 GB |
| **Python Runtime** | 3.12.3 |
| **PyTorch (CPU)** | 2.15.0+cu132 |
| **ONNX Runtime (CPU)** | 1.31.1 |
| **OpenCV / FFmpeg** | 5.0.0 / ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers |

## 2. Đo lường Chi tiết Từng Công đoạn (Pipeline Breakdown)
| Công đoạn Pipeline | Độ trễ (Latency) | Thông lượng (Throughput) | Ghi chú kỹ thuật |
|---|---|---|---|
| **1. Video Frame Decode** | 1.99 ms/frame | 502.7 FPS | OpenCV VideoCapture, 720p cut of test1.mp4 |
| **2. yolo26n-1280-e5-dashcam Object Detection** | 20.47 ms/frame | 48.9 FPS | PyTorch GPU NVIDIA GeForce RTX 3050 Laptop GPU, imgsz=1280 |
| **3. ByteTrack + Interpolation** | 1.297 ms/frame | ~771 FPS | Đo trong lần chạy thật 720p (Phase C) |
| **4. ArcFace Face Embedding** | 13.42 ms/mặt | 74.5 faces/s | MobileFaceNet 512-d ONNX Runtime CPU, 16 crop mặt thật |
| **5. License Plate OCR** | 57.81 ms/biển | ~17 plates/s | RapidOCR (recognition), ONNX Runtime CPU, 81 crop biển thật |
| **6. Plate String Normalization** | 1.86 µs/biển | > 500,000 ops/s | Regex alphanumeric matching |
| **7. Gaussian Blur Render** | 29.159 ms/ROI | ~34 ROIs/s | 200x200 px, strength=25 |
| **8. Pixelate Render** | 0.039 ms/ROI | ~25641 ROIs/s | 200x200 px, strength=12 |
| **9. Blackout Render** | 0.004 ms/ROI | ~250000 ROIs/s | 200x200 px, pure zero fill |

## 3. Đánh giá Hiệu quả Chiến lược Track-Level Whitelisting
> So sánh chi phí tính toán trên video tiêu chuẩn thời lượng **60 giây** (30 FPS, 1800 frames) có **3 đối tượng khuôn mặt**:

| Chiến lược Whitelist | Số lần trích xuất Embedding | Thời gian CPU chiếm dụng | Tỷ lệ tối ưu |
|---|---|---|---|
| **Per-Frame Embedding** (Tiếp cận ngây thơ) | 5400 lần | 72.47 s | Baseline (100% chi phí) |
| **Track-Level Embedding** (Giải pháp đề tài) | 9 lần | 0.1208 s | **Giảm 99.83%** |

* **Kết luận định lượng:** Chiến lược so tối đa vài vùng cắt cho mỗi track tiết kiệm tới **72.35 giây** thời gian CPU cho mỗi phút video, triệt tiêu hoàn toàn hiện tượng nghẽn cổ chai tính toán trên CPU.

## 4. Hiệu năng Toàn trình (End-to-End) theo Độ phân giải
> Cùng một đoạn 10 giây cắt từ video thật `test1.mp4` (từ giây 0), hạ xuống từng độ phân giải ở 30 fps; chế độ Fast. Mỗi độ phân giải chạy hai lần: không whitelist, và có whitelist (1 mặt, 1 biển số không có trong clip) nên mọi track mặt được embed và mọi track biển số được OCR. Một lần chạy làm nóng không tính giờ trước khi đo.
| Độ phân giải | Whitelist | Kích thước | Số frame | Số track | Thời gian xử lý | Throughput | Real-Time Factor (RTF) | Baseline RAM | Peak RAM | Delta RAM |
|---|---|---|---|---|---|---|---|---|---|---|
| **480p (SD)** | không | 854x480 | 300 | 560 | 8.38 s | **35.81 FPS** | 0.84x | 1783.7 MB | **1799.7 MB** | +16.0 MB |
| **480p (SD)** | có | 854x480 | 300 | 560 | 38.11 s | **7.87 FPS** | 3.81x | 1804.7 MB | **1805.7 MB** | +1.0 MB |
| **720p (HD)** | không | 1280x720 | 300 | 684 | 11.24 s | **26.69 FPS** | 1.12x | 1817.0 MB | **1854.1 MB** | +37.1 MB |
| **720p (HD)** | có | 1280x720 | 300 | 684 | 78.78 s | **3.81 FPS** | 7.88x | 1865.4 MB | **1866.1 MB** | +0.6 MB |
| **1080p (Full HD)** | không | 1920x1080 | 300 | 711 | 17.8 s | **16.85 FPS** | 1.78x | 1865.7 MB | **1960.8 MB** | +95.1 MB |
| **1080p (Full HD)** | có | 1920x1080 | 300 | 711 | 94.9 s | **3.16 FPS** | 9.49x | 1974.4 MB | **1977.0 MB** | +2.6 MB |

### Thời gian từng công đoạn trong lần chạy thật (giây, số lần gọi)
| Công đoạn | 480p (SD) | 480p (SD), whitelist | 720p (HD) | 720p (HD), whitelist | 1080p (Full HD) | 1080p (Full HD), whitelist |
|---|---|---|---|---|---|---|
| Pass 1: decode + YOLO + ByteTrack | 6.385 s (1) | 6.11 s (1) | 6.746 s (1) | 6.045 s (1) | 7.386 s (1) | 7.031 s (1) |
|   trong đó YOLO | 5.543 s (300) | 5.409 s (300) | 5.829 s (300) | 5.152 s (300) | 6.256 s (300) | 5.922 s (300) |
|   trong đó ByteTrack | 0.343 s (300) | 0.34 s (300) | 0.389 s (300) | 0.384 s (300) | 0.38 s (300) | 0.382 s (300) |
| Whitelist mặt (ArcFace mỗi track) | 0.0 s (0) | 1.952 s (1) | 0.0 s (0) | 2.29 s (1) | 0.0 s (0) | 2.598 s (1) |
| Whitelist biển số (OCR mỗi track) | 0.0 s (0) | 27.935 s (1) | 0.0 s (0) | 65.908 s (1) | 0.0 s (0) | 74.728 s (1) |
| Pass 2: decode + làm mờ + encode | 1.924 s (1) | 2.051 s (1) | 4.412 s (1) | 4.462 s (1) | 10.301 s (1) | 10.437 s (1) |
|   trong đó làm mờ | 0.695 s (7936) | 0.745 s (7936) | 2.158 s (9553) | 2.131 s (9553) | 6.145 s (9913) | 6.172 s (9913) |

## 5. Đánh giá Khả năng Đáp ứng Tài nguyên Kubernetes (Pod Limits)
* **Ngưỡng giới hạn Pod cấu hình bởi Infra:** `resources.limits.memory: 3072Mi`, node k3s 2C/4T/12GB.
* **Mức RAM đỉnh thực tế lớn nhất ghi nhận (1080p):** `1977.0 MB`.
* **Biên an toàn (Safety Margin):** `1095.0 MB` (Tiêu thụ chỉ ~64.4% giới hạn cho phép).
* **Lưu ý:** RAM đỉnh ở trên chỉ tính tiến trình Python. Encoder FFmpeg (libx264) là tiến trình con riêng và tăng theo độ phân giải: khoảng 0,74 GB ở 2560x1440 với `rc-lookahead=10`, nên video độ phân giải cao cần thêm khoảng trống này trong giới hạn Pod.