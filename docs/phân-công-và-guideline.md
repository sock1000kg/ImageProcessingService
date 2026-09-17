# Overview
Project này giống 3 project gắn với nhau do nó tập trung vào cách triển khai trên hạ tầng, nên khối lượng công việc coi như chia thành 3 mini-projects:
- Web: bao gổm frontend và backend. Anh Đức Huy chịu trách nhiệm toàn bộ đầu cuối của thiết kế API, schema, database, lựa chọn framwork,... MVP chỉ yêu cầu tính năng tối thiểu (tải ảnh, tạo và theo dõi job, xem và tải kết quả), các tính năng kiểu authentication, rate-limiting, xoá job (logic phức tạp hơn)... thì không cần ngay. 
- Engine: bao gồm worker và các feature xử lý ảnh bằng ffmpeg/AI và đăng kết quả lên MinIO. Huy Đức sẽ chịu trách nhiệm phần này. MVP chỉ cần 1 loại job bằng AI và 1-2 loại job xử lý ảnh bthg để tiết kiệm tgian. 
- Infra: bao gồm KEDA auto-scaling và hạ tầng để chạy và expose demo ra public. Đạt chịu trách nhiệm phần này.

# Vài cái lưu ý
- Mỗi người chịu trách nhiệm hoàn toàn một trong 3 folder chính. Nếu cần giúp gì thì có thể kêu gọi trợ giúp (nên dùng ngôn ngữ/framework nhiều người biết và AI gen được tốt kiểu React/Node.js/Typescript/Python).
- Ưu tiên trước hết một cái demo tối thiểu rồi làm gì thì làm
- Những cái nào ảnh hưởng các thành phần khác như cấu trúc job, job status,... mà nếu có thay đổi gì thì phải báo với mọi người để còn thống nhất, ko để AI tự ý đổi docs/schemas. Cái gì không rõ về hướng giải quyết hiện tại thì hỏi chứ đừng tự ý làm hoặc để AI thay đổi. 
- Phần docs với prompt agent cụ thể cho từng phần thì cho vào folder tương ứng phần đấy kiểu web/docs để tránh conflict.