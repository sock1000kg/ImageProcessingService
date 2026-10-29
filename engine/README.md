# Engine Module — Cloud-Native Privacy Service

Phân hệ xử lý nền tảng (Worker) của dịch vụ ẩn danh hóa đa phương tiện thông minh, chịu trách nhiệm tiêu thụ các tác vụ xử lý ảnh tĩnh (`image-redact`) và video (`video-redact`) từ hàng đợi NATS JetStream, chạy suy luận thị giác máy tính với mô hình YOLOv8, áp dụng các thuật toán che giấu và lưu trữ kết quả trên MinIO S3.

---

## 📁 Cấu trúc Thư mục

```text
engine/
├── docs/                       # Tài liệu thiết kế & kỹ thuật chi tiết
│   ├── README.md               # Ngữ cảnh tổng thể (Master Context) của Engine
│   ├── plan.md                 # Kế hoạch chi tiết & lộ trình từng Milestone
│   ├── jobs-spec.md            # Đặc tả chi tiết cấu trúc JSON & mã lỗi của từng job
│   ├── backend-handshake.md    # Hợp đồng giao tiếp giữa Backend và Engine
│   └── local-dev.md            # Hướng dẫn chạy & test độc lập ở môi trường local
├── models/                     # Thư mục chứa trọng số mô hình AI (yolov8n-oiv7.pt, ...)
├── src/                        # Mã nguồn chính của Worker
│   ├── config.py               # Quản lý cấu hình & biến môi trường
│   ├── storage.py              # Kết nối & xử lý MinIO I/O
│   ├── messaging.py            # Kết nối & phát sự kiện qua NATS JetStream
│   ├── processors/             # Các bộ xử lý tác vụ (Processor implementations)
│   │   ├── base.py             # Lớp trừu tượng BaseProcessor
│   │   └── ...                 # Các processor cụ thể (image-redact, ...)
│   └── main.py                 # Điểm khởi động chính của Worker Pool
├── tests/                      # Bộ kiểm thử đơn vị & script mock Backend
│   └── mock_backend.py         # Giả lập Backend upload ảnh & phát job để test end-to-end
├── Cloud-Native Privacy Service.pdf  # Bản mô tả đề tài & căn cứ nghiệp vụ chi tiết
├── Dockerfile                  # Đóng gói container chạy non-root cho Kubernetes
└── requirements.txt            # Danh sách thư viện Python phụ thuộc
```

---

## 🚀 Bắt đầu Nhanh (Quick Start)

1. **Khởi động hạ tầng nền tảng (NATS + MinIO):**
   ```bash
   docker compose -f ../infra/docker-compose.yaml up -d
   ```

2. **Cài đặt thư viện:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Chạy worker ở môi trường local:**
   * Xem chi tiết hướng dẫn tại [`docs/local-dev.md`](docs/local-dev.md).

4. **Kế hoạch triển khai & Tiến độ:**
   * Xem lộ trình các mốc tại [`docs/plan.md`](docs/plan.md).
