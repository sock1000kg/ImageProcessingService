# Milestones
File này có mục đích chia các lượt công việc và theo dõi tiến độ project

## MVP (Tối thiểu cần có để demo trên lớp) - Cuối tháng 10
1. Web / Backend (Giao diện & API) - Anh Nguyễn Đức Huy
[ ] Quản lý tệp đầu vào: Nhận ảnh/video từ người dùng qua API và lưu trữ trực tiếp vào kho chứa MinIO.

[ ] Khởi tạo Job: Tạo bản ghi công việc mới trong PostgreSQL với trạng thái ban đầu là PENDING.

[ ] Phân phối tác vụ: Đẩy lệnh xử lý (chứa định danh jobId và đường dẫn tệp trong MinIO) vào các chủ đề (subject) tương ứng trên NATS JetStream (ví dụ: jobs.ai hoặc jobs.image) -> Update trạng thái thành QUEUED trong PostgreSQL.

[ ] Đồng bộ trạng thái: Lắng nghe các sự kiện tiến độ từ NATS (chủ đề jobs.events) để cập nhật trạng thái thực tế (PROCESSING, COMPLETED, FAILED) và phần trăm hoàn thành vào cơ sở dữ liệu PostgreSQL. Khi job xong thì cung cấp URL public thẳng đến MinIO:/results/user-uuid/job-id cho user xem (MinIO sẽ expose ra cho public bởi Infra để tiết kiệm tgian).

[ ] Cung cấp REST API: Cho phép frontend gửi yêu cầu tạo công việc mới, kiểm tra tiến độ liên tục, và nhận đường dẫn để tải kết quả.

2. Engine / Workers (Động cơ xử lý) - Huy Đức
[ ] Kết nối hàng đợi: Liên tục lắng nghe và nhận các công việc được giao từ NATS JetStream.

[ ] Tối ưu hóa khởi động: Tải mô hình AI hoặc các thư viện xử lý nặng vào bộ nhớ duy nhất một lần khi khởi động để tối ưu hiệu suất xử lý cho chuỗi nhiều công việc liên tiếp.

[ ] Xử lý dữ liệu: Nhận thông tin, tải tệp nguồn từ MinIO, thực hiện tác vụ xử lý (nhận diện hình ảnh, chuyển mã video), và tải tệp kết quả ngược lại lên MinIO.

[ ] Báo cáo tiến trình: Gửi các sự kiện cập nhật trạng thái về NATS JetStream để backend nắm bắt mà không cần kết nối trực tiếp vào PostgreSQL.

[ ] Xác nhận an toàn (Acknowledgement): Chỉ báo cáo hoàn tất (ACK) với NATS JetStream sau khi toàn bộ quá trình xử lý và tải kết quả lên MinIO đã thành công. Nếu xảy ra lỗi giữa chừng, NATS sẽ giao lại công việc đó.

3. Infrastructure - Đạt
[ ] Triển khai dịch vụ cốt lõi: Cài đặt và vận hành ổn định PostgreSQL (quản lý trạng thái), MinIO (lưu trữ tệp lớn), và NATS JetStream (vận chuyển thông điệp) trên Kubernetes.

[ ] Tự động mở rộng (Autoscaling) với KEDA: Cấu hình KEDA ScaledObject để liên tục theo dõi lượng công việc tồn đọng (consumer lag) trong NATS. Tự động tăng số lượng Pod của Worker khi hàng đợi dài ra, và thu hẹp về 0 khi hệ thống rảnh rỗi.

[ ] Quản lý tài nguyên: Thiết lập giới hạn sử dụng CPU và RAM tối đa cho các Worker Deployment để đảm bảo hệ thống không bị quá tải trên phần cứng giới hạn (4-core / 12GB RAM).


## Day 2 Features (nếu có thì tốt, không thì thôi) - Tháng 11 
1. Web / Backend (Giao diện & API) - Anh Nguyễn Đức Huy
[ ] Luồng xoá job đã hoàn thành, job đang chạy dở ngay tại Web (MVP thì là xoá tự động)

[ ] User auth, lưu lịch sử các job đã tạo

2. Engine / Workers (Động cơ xử lý) - Huy Đức
[ ] Tối ưu hoá thời gian xử lý

[ ] Thêm các loại job tiên tiến hơn

3. Infrastructure - Đạt
[ ] Triển khai và đánh giá các chiến thuật scaling và xử lý job khác nhau