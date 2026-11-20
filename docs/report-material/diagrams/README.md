# Sơ đồ cho báo cáo (Mermaid)

Mỗi file `.md` là một hình trong báo cáo RedactFunnel, đặt tên theo số hình. Nội dung lấy từ code và docs hiện tại;
nguồn ghi ngay dưới tiêu đề mỗi file. Khi code đổi (tên hàm, trạng thái job, manifest), sửa file tương ứng.

| File | Hình trong báo cáo |
| --- | --- |
| `1.2-user-flow.md` | Hình 1.2: Luồng sử dụng của RedactFunnel |
| `3.2-data-flow.md` | Hình 3.2: Luồng dữ liệu end-to-end của một batch |
| `3.3-use-cases.md` | Hình 3.3: Biểu đồ ca sử dụng tổng quát |
| `3.4-uc01-activity.md` | Hình 3.4: Biểu đồ hoạt động UC01 Tạo batch ảnh và tải lên |
| `3.5-uc01-sequence.md` | Hình 3.5: Biểu đồ tuần tự UC01 |
| `3.6-uc02-sequence.md` | Hình 3.6: Biểu đồ tuần tự UC02 Tải lên và xử lý video |
| `3.7-uc04-activity.md` | Hình 3.7: Biểu đồ hoạt động UC04 Xem kết quả và báo cáo cần xem lại |
| `3.8-erd.md` | Hình 3.8: ERD (từ `web/backend/prisma/schema.prisma`) |
| `3.9-job-status.md` | Hình 3.9: Biểu đồ trạng thái của Job |
| `3.10-image-pipeline.md` | Hình 3.10: Pipeline xử lý ảnh (image-redact) |
| `3.11-video-pipeline.md` | Hình 3.11: Pipeline xử lý video (video-redact) |
| `3.12-k8s-deployment.md` | Hình 3.12: Sơ đồ triển khai trên Kubernetes |
| `4.10-ocr-pipeline.md` | Hình 4.10: Pipeline OCR biển số whole_or_split |
| `5.2-cicd.md` | Hình 5.2: Quy trình CI/CD với GitHub Actions |

Không có ở đây vì không phải sơ đồ: ảnh chụp màn hình (giao diện, `kubectl get pods`), hình huấn luyện của Ultralytics
(`results.png`, đường cong PR/F1, ma trận nhầm lẫn: lấy thẳng từ `engine/training/detection/results/<run>/`), biểu đồ số
liệu (Face privacy qua các bước, replica theo thời gian, thông lượng), ảnh minh hoạ (IoU, các dạng biển số, so sánh với deface).

`3.3-use-cases.md`, `3.4-uc01-activity.md` và `3.7-uc04-activity.md` dùng **PlantUML** (khối `plantuml`), vì Mermaid không
có use case diagram và activity diagram UML (swimlane, ký hiệu start/stop). Các file còn lại dùng Mermaid.

## Xuất ảnh để chèn vào Word

PlantUML (cần Java; GitHub không hiển thị khối `plantuml`, VS Code cần extension PlantUML). Use case diagram dùng layout
Smetana có sẵn nên không cần cài Graphviz:

```bash
java -jar plantuml.jar -charset UTF-8 -tpng 3.4-uc01-activity.md   # xuất PNG cho từng khối @startuml trong file
```

Mermaid:

```bash
npx -y @mermaid-js/mermaid-cli@11.4.2 -i 3.5-uc01-sequence.md -o 3.5-uc01-sequence.png -w 1600 -b white
```

Mỗi file chứa một khối `mermaid`, GitHub và VS Code hiển thị trực tiếp. Với file `.md`, mermaid-cli xuất ảnh tên
`<tên>-1.png`. Hoặc dán nội dung khối vào https://mermaid.live rồi tải PNG/SVG.
