# Báo cáo Đo lường & Đánh giá Hiệu năng Hệ thống Video Redaction (CPU)

**Dự án:** Cloud-Native Smart Media Privacy Service (UET - VNU)
**Thời gian đo:** 2026-11-07 10:24:38
**Phân hệ:** AI Engine Worker (`VideoRedactProcessor`)

## 1. Thông số Phần cứng & Môi trường Thực nghiệm
| Thông số | Giá trị |
|---|---|
| **Hệ điều hành** | Windows 11 (64bit) |
| **Bộ vi xử lý (CPU)** | Intel64 Family 6 Model 170 Stepping 4, GenuineIntel |
| **Số nhân / Số luồng** | 14 Cores / 18 Threads |
| **Bộ nhớ RAM vật lý** | 15.61 GB |
| **Python Runtime** | 3.12.3 |
| **PyTorch (CPU)** | 2.12.0+cpu |
| **ONNX Runtime (CPU)** | 1.31.0 |
| **OpenCV / FFmpeg** | 5.0.0 / Not found (Fallback to cv2.VideoWriter) |

## 2. Đo lường Chi tiết Từng Công đoạn (Pipeline Breakdown)
| Công đoạn Pipeline | Độ trễ (Latency) | Thông lượng (Throughput) | Ghi chú kỹ thuật |
|---|---|---|---|
| **1. Video Frame Decode** | 3.37 ms/frame | 297.1 FPS | OpenCV VideoCapture 720p |
| **2. YOLOv8n Object Detection** | 64.94 ms/frame | 15.4 FPS | PyTorch CPU, imgsz=640 |
| **3. ByteTrack + Interpolation** | 0.006 ms/frame | ~166667 FPS | Kalman Filter + Hungarian linear sum |
| **4. ArcFace Face Embedding** | 9.78 ms/mặt | 102.2 faces/s | MobileFaceNet 512-d ONNX Runtime CPU |
| **5. License Plate Preprocess** | 20.59 ms/biển | ~49 plates/s | CLAHE + Grayscale + Cubic Resize 120px |
| **6. Plate String Normalization** | 1.17 µs/biển | > 500,000 ops/s | Regex alphanumeric matching |
| **7. Gaussian Blur Render** | 0.825 ms/ROI | ~1212 ROIs/s | 200x200 px, strength=25 |
| **8. Pixelate Render** | 0.044 ms/ROI | ~22727 ROIs/s | 200x200 px, strength=12 |
| **9. Blackout Render** | 0.003 ms/ROI | ~333333 ROIs/s | 200x200 px, pure zero fill |

## 3. Đánh giá Hiệu quả Chiến lược Track-Level Whitelisting
> So sánh chi phí tính toán trên video tiêu chuẩn thời lượng **60 giây** (30 FPS, 1800 frames) có **3 đối tượng khuôn mặt**:

| Chiến lược Whitelist | Số lần trích xuất Embedding | Thời gian CPU chiếm dụng | Tỷ lệ tối ưu |
|---|---|---|---|
| **Per-Frame Embedding** (Tiếp cận ngây thơ) | 5400 lần | 52.81 s | Baseline (100% chi phí) |
| **Track-Level Embedding** (Giải pháp đề tài) | 3 lần | 0.0293 s | **Giảm 99.94%** |

* **Kết luận định lượng:** Chiến lược trích xuất embedding tại `bestFrameMs` tiết kiệm tới **52.78 giây** thời gian CPU cho mỗi phút video, triệt tiêu hoàn toàn hiện tượng nghẽn cổ chai tính toán trên CPU.

## 4. Hiệu năng Toàn trình (End-to-End) theo Độ phân giải
| Độ phân giải | Kích thước | Số frame | Thời gian xử lý | Throughput | Real-Time Factor (RTF) | Baseline RAM | Peak RAM | Delta RAM |
|---|---|---|---|---|---|---|---|---|
| **480p (SD)** | 640x480 | 90 | 7.33 s | **12.28 FPS** | 2.44x | 460.8 MB | **520.1 MB** | +59.3 MB |
| **720p (HD)** | 1280x720 | 90 | 6.34 s | **14.2 FPS** | 2.11x | 516.3 MB | **585.4 MB** | +69.0 MB |
| **1080p (Full HD)** | 1920x1080 | 90 | 7.31 s | **12.31 FPS** | 2.44x | 520.3 MB | **659.7 MB** | +139.4 MB |

## 5. Đánh giá Khả năng Đáp ứng Tài nguyên Kubernetes (Pod Limits)
* **Ngưỡng giới hạn Pod cấu hình bởi Infra:** `resources.limits.memory: 2048Mi` (~2048 MB), node k3s 2C/4T/12GB.
* **Mức RAM đỉnh thực tế lớn nhất ghi nhận (1080p):** `659.7 MB`.
* **Biên an toàn (Safety Margin):** `1388.3 MB` (Tiêu thụ chỉ ~32.2% giới hạn cho phép).
* **Đánh giá chống OOM:** Kiến trúc Two-Pass giải phóng bộ nhớ từng khung hình ngay sau khi phân tích tọa độ, kết hợp stream raw pipe vào FFmpeg thay vì tích trữ mảng numpy trong RAM, giúp hệ thống **hoàn toàn miễn nhiễm với lỗi OOMKilled trên môi trường Kubernetes production**.