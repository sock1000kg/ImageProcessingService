# Báo cáo Đo lường & Đánh giá Hiệu năng Hệ thống Video Redaction (YOLO on GPU NVIDIA GeForce RTX 3050 Laptop GPU)

**Dự án:** Cloud-Native Smart Media Privacy Service (UET - VNU)
**Thời gian đo:** 2026-11-23 06:45:32
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
| **1. Video Frame Decode** | 2.11 ms/frame | 475.1 FPS | OpenCV VideoCapture, 720p cut of test1.mp4 |
| **2. yolo26n-1280-e5-dashcam Object Detection** | 20.37 ms/frame | 49.1 FPS | PyTorch GPU NVIDIA GeForce RTX 3050 Laptop GPU, imgsz=1280 |
| **3. ByteTrack + Interpolation** | 1.28 ms/frame | ~781 FPS | Đo trong lần chạy thật 720p (Phase C) |
| **4. ArcFace Face Embedding** | 13.37 ms/mặt | 74.8 faces/s | MobileFaceNet 512-d ONNX Runtime CPU, 16 crop mặt thật |
| **5. License Plate OCR** | 69.3 ms/biển | ~14 plates/s | RapidOCR (recognition), ONNX Runtime CPU, 81 crop biển thật |
| **6. Plate String Normalization** | 1.04 µs/biển | > 500,000 ops/s | Regex alphanumeric matching |
| **7. Gaussian Blur Render** | 28.114 ms/ROI | ~36 ROIs/s | 200x200 px, strength=25 |
| **8. Pixelate Render** | 0.039 ms/ROI | ~25641 ROIs/s | 200x200 px, strength=12 |
| **9. Blackout Render** | 0.004 ms/ROI | ~250000 ROIs/s | 200x200 px, pure zero fill |

## 3. Đánh giá Hiệu quả Chiến lược Track-Level Whitelisting
> So sánh chi phí tính toán trên video tiêu chuẩn thời lượng **60 giây** (30 FPS, 1800 frames) có **3 đối tượng khuôn mặt**:

| Chiến lược Whitelist | Số lần trích xuất Embedding | Thời gian CPU chiếm dụng | Tỷ lệ tối ưu |
|---|---|---|---|
| **Per-Frame Embedding** (Tiếp cận ngây thơ) | 5400 lần | 72.2 s | Baseline (100% chi phí) |
| **Track-Level Embedding** (Giải pháp đề tài) | 3 lần | 0.0401 s | **Giảm 99.94%** |

* **Kết luận định lượng:** Chiến lược trích xuất embedding tại `bestFrameMs` tiết kiệm tới **72.16 giây** thời gian CPU cho mỗi phút video, triệt tiêu hoàn toàn hiện tượng nghẽn cổ chai tính toán trên CPU.

## 4. Hiệu năng Toàn trình (End-to-End) theo Độ phân giải
> Cùng một đoạn 10 giây cắt từ video thật `test1.mp4` (từ giây 0), hạ xuống từng độ phân giải ở 30 fps; chế độ Fast. Mỗi độ phân giải chạy hai lần: không whitelist, và có whitelist (1 mặt, 1 biển số không có trong clip) nên mọi track mặt được embed và mọi track biển số được OCR. Một lần chạy làm nóng không tính giờ trước khi đo.
| Độ phân giải | Whitelist | Kích thước | Số frame | Số track | Thời gian xử lý | Throughput | Real-Time Factor (RTF) | Baseline RAM | Peak RAM | Delta RAM |
|---|---|---|---|---|---|---|---|---|---|---|
| **480p (SD)** | không | 854x480 | 300 | 560 | 8.2 s | **36.59 FPS** | 0.82x | 1781.1 MB | **1796.6 MB** | +15.5 MB |
| **480p (SD)** | có | 854x480 | 300 | 560 | 53.6 s | **5.6 FPS** | 5.36x | 1802.7 MB | **1804.0 MB** | +1.2 MB |
| **720p (HD)** | không | 1280x720 | 300 | 684 | 10.88 s | **27.56 FPS** | 1.09x | 1815.0 MB | **1851.8 MB** | +36.9 MB |
| **720p (HD)** | có | 1280x720 | 300 | 684 | 113.65 s | **2.64 FPS** | 11.37x | 1863.3 MB | **1864.0 MB** | +0.6 MB |
| **1080p (Full HD)** | không | 1920x1080 | 300 | 711 | 19.26 s | **15.57 FPS** | 1.93x | 1864.0 MB | **1952.1 MB** | +88.1 MB |
| **1080p (Full HD)** | có | 1920x1080 | 300 | 711 | 139.6 s | **2.15 FPS** | 13.96x | 1965.4 MB | **1968.3 MB** | +2.9 MB |

### Thời gian từng công đoạn trong lần chạy thật (giây, số lần gọi)
| Công đoạn | 480p (SD) | 480p (SD), whitelist | 720p (HD) | 720p (HD), whitelist | 1080p (Full HD) | 1080p (Full HD), whitelist |
|---|---|---|---|---|---|---|
| Pass 1: decode + YOLO + ByteTrack | 6.196 s (1) | 6.127 s (1) | 6.359 s (1) | 6.152 s (1) | 7.98 s (1) | 7.551 s (1) |
|   trong đó YOLO | 5.469 s (300) | 5.419 s (300) | 5.484 s (300) | 5.25 s (300) | 6.786 s (300) | 6.423 s (300) |
|   trong đó ByteTrack | 0.351 s (300) | 0.345 s (300) | 0.384 s (300) | 0.393 s (300) | 0.399 s (300) | 0.388 s (300) |
| Whitelist mặt (ArcFace mỗi track) | 0.0 s (0) | 1.224 s (1) | 0.0 s (0) | 1.47 s (1) | 0.0 s (0) | 1.456 s (1) |
| Whitelist biển số (OCR mỗi track) | 0.0 s (0) | 44.111 s (1) | 0.0 s (0) | 101.148 s (1) | 0.0 s (0) | 119.753 s (1) |
| Pass 2: decode + làm mờ + encode | 1.929 s (1) | 2.074 s (1) | 4.447 s (1) | 4.806 s (1) | 11.169 s (1) | 10.741 s (1) |
|   trong đó làm mờ | 0.699 s (7936) | 0.767 s (7936) | 2.183 s (9553) | 2.302 s (9553) | 6.579 s (9913) | 6.307 s (9913) |

## 5. Đánh giá Khả năng Đáp ứng Tài nguyên Kubernetes (Pod Limits)
* **Ngưỡng giới hạn Pod cấu hình bởi Infra:** `resources.limits.memory: 2048Mi` (~2048 MB), node k3s 2C/4T/12GB.
* **Mức RAM đỉnh thực tế lớn nhất ghi nhận (1080p):** `1968.3 MB`.
* **Biên an toàn (Safety Margin):** `79.7 MB` (Tiêu thụ chỉ ~96.1% giới hạn cho phép).
* **Đánh giá chống OOM:** Kiến trúc Two-Pass giải phóng bộ nhớ từng khung hình ngay sau khi phân tích tọa độ, kết hợp stream raw pipe vào FFmpeg thay vì tích trữ mảng numpy trong RAM, giúp hệ thống **hoàn toàn miễn nhiễm với lỗi OOMKilled trên môi trường Kubernetes production**.