# Vị trí kết quả thí nghiệm

Chỉ mục đường dẫn (tính từ gốc repo) tới kết quả của từng thí nghiệm: bảng so sánh, hình của YOLO, benchmark độ chính xác và
benchmark tốc độ. Nội dung và cách đọc số liệu nằm trong chính các file được trỏ tới.

## 1. Huấn luyện detector (mặt + biển số)

- Tổng hợp cả quá trình (bảng "Journey", dataset, model được chọn): `engine/training/detection/results/README.md`
- So sánh độ chính xác mọi model trên bộ benchmark 3.726 ảnh: `engine/training/detection/bench/comparison.md`

Mỗi run huấn luyện có một thư mục `engine/training/detection/results/<thí nghiệm>/<run>/` chứa hình và số liệu của Ultralytics:
`args.yaml`, `results.csv`, `results.png`, `BoxPR_curve.png`, `BoxF1_curve.png`, `BoxP_curve.png`, `BoxR_curve.png`,
`confusion_matrix.png`, `confusion_matrix_normalized.png`, `labels.jpg`, `val_batch*_labels.jpg` / `val_batch*_pred.jpg`.
Mỗi run benchmark có một thư mục `engine/training/detection/bench/<tên>/` chứa `accuracy.md` (báo cáo đầy đủ), `accuracy.json`,
`detections.jsonl.gz`, `meta.json`.

| Bước | Run huấn luyện (`engine/training/detection/results/…`) | Benchmark độ chính xác (`engine/training/detection/bench/…`) |
| --- | --- | --- |
| 0. Model gốc, chưa fine-tune | — | `yolov8n-oiv7@640`, `yolov8n-oiv7@960`, `yolov8n-oiv7@1280` |
| 1. Fine-tune YOLOv8n-oiv7 | `direct-1280/e10-b4`, `direct-1280/e20` | `direct-1280-e10-b4@1280`, `direct-1280-e20@1280` |
| 2. YOLO11n | `yolo11-1280/e20` | `yolo11-1280-e20@640`, `yolo11-1280-e20@960`, `yolo11-1280-e20@1280` |
| 3. Thủ thuật dữ liệu | `yolo11-1280/e20-pl`, `yolo11-1280/e5-crowd`, `yolo11-1280/e5-crowd-os2` | `yolo11-1280-e20-pl@1280`, `yolo11-1280-e5-crowd@1280`, `yolo11-1280-e5-crowd-os2@1280` |
| 4. YOLO11s | `yolo11s-960/e12`, `yolo11s-1280/e12` | `yolo11s-960-e12@960`, `yolo11s-1280-e12@1280` |
| 5. Cùng công thức cho mọi model | `yolo11n-1280/e20-crowd`, `yolo26n-1280/e20-crowd` (Fast đến bước 8), `yolo26s-1280/e20-crowd` | `yolo11n-1280-e20-crowd@1280`, `yolo26n-1280-e20-crowd@1280`, `yolo26s-1280-e20-crowd@1280` |
| 6. Fine-tune YOLO26s cho biển số | `yolo26s-1280/e5-ft`, `yolo26s-1280/e5-plates-frozen`, `yolo26s-1280/e5-plates-frozen-x3` (Maximum privacy đến bước 8) | `yolo26s-1280-e5-ft@1280`, `yolo26s-1280-e5-plates-frozen@1280`, `yolo26s-1280-e5-plates-frozen-x3@1280` |
| 7. Biển số bị che một phần | `yolo26s-1280/e5-plates-occ`, `yolo26s-1280/e5-plates-occ-half` | `yolo26s-1280-e5-plates-occ@1280`, `yolo26s-1280-e5-plates-occ-half@1280` |
| 8. Biển số dashcam | `yolo26s-1280/e5-dashcam` (Maximum privacy), `yolo26n-1280/e5-dashcam` (Fast), `yolo26s-1280/e5-dashcam-neg`, `yolo26n-1280/e5-dashcam-neg` | `yolo26s-1280-e5-dashcam@1280`, `yolo26n-1280-e5-dashcam@1280`, `yolo26s-1280-e5-dashcam-neg@1280`, `yolo26n-1280-e5-dashcam-neg@1280` |
| Đối chứng: deface (CenterFace) | — | `deface-full`, `deface-640x480` |
| Đối chứng: YuNet | — | `yunet-2023mar` |
| Đối chứng: EgoBlur Gen2 (Meta) | — | `egoblur-gen2` |

## 2. OCR biển số

- Tổng hợp (Journey, dataset, phương pháp được chọn): `engine/training/ocr/results/README.md`
- Số liệu thô: `engine/training/ocr/results/results.json`

## 3. Whitelist (allow list)

- Tổng hợp cả mặt và biển số trên ảnh: `engine/training/whitelist/README.md`
- Kế hoạch và trạng thái các benchmark: `engine/training/whitelist/benchmarks.md`
- Biển số, bộ so khớp: `engine/training/whitelist/plate/results/whitelist.json`, `engine/training/whitelist/plate/results/whitelist_rules.json`
- Khuôn mặt (LFW): `engine/training/whitelist/face/results/face_whitelist.json` (Engine hiện tại, có căn chỉnh YuNet),
  `face_whitelist_raw_box.json` (trước căn chỉnh), `face_whitelist_aligned.json` (căn chỉnh cả ảnh, cận trên),
  `face_whitelist_masked.json` (thử tô xám phần viền), `align_cutoff.json` (kích thước mặt mà căn chỉnh hết tác dụng);
  cùng thư mục `engine/training/whitelist/face/results/`; cùng phép đo với từng detector của bước 8:
  `engine/training/whitelist/face/results/by-detector/`

## 4. Video: allow list và che trên clip mạng xã hội do nhóm gán nhãn

- So sánh đầy đủ: `engine/training/video/results/comparison.md`
- Số liệu thô: `engine/training/video/results/results.json`
- Hai model thử nghiệm của thí nghiệm này: bước 7 ở mục 1
- Hai bản sửa Engine (bỏ bộ lọc góc khung, giữ phát hiện chưa vào track) và so sánh với deface, EgoBlur trên cùng clip:
  các mục "Two Engine fixes" và "Open-source tools" trong `engine/training/video/results/comparison.md`
- Model dashcam (bước 8 ở mục 1) và hai bản sửa allow list biển số (OCR đọc crop rộng nhất; tách track khi mất dấu lâu):
  mục "Dashcam fine-tune and allow-list fixes" trong cùng file
- Công cụ chạy và chấm benchmark video: `engine/training/video/` (`run_dashcam.sh`, `prelabel.py`, `score.py`, `render_compare.py`)

## 5. Tốc độ và thông lượng

- So sánh tốc độ: `infra/bench/results/comparison.md` (cách chạy: `infra/bench/README.md`)
- Từng lần chạy: `infra/bench/results/<máy>/<model>/<kích thước ảnh>/<thời điểm>-<chế độ>/`, mỗi thư mục có `summary.md`,
  `jobs.csv`, `replicas.csv`, `cpu_counters.csv`, `top.csv`, `meta.json`

| Máy | Model | Kích thước ảnh |
| --- | --- | --- |
| `home-server-100` (server lab, CPU) | `yolov8n-oiv7` | 640px |
|  | `yolo26n-1280-e20-crowd` | 960px, 1280px |
|  | `yolo26s-1280-e5-plates-frozen-x3` | 960px, 1280px |
| `laptop-rtx3050-max` (laptop, GPU RTX 3050) | `yolov8n-oiv7` | 1280px |
|  | `yolo26n-1280-e20-crowd` | 640px, 960px, 1280px |
|  | `yolo26s-1280-e5-plates-frozen-x3` | 640px, 960px, 1280px |
|  | `deface` | full, 640x480 |

- Tốc độ xử lý video trên CPU: `engine/docs/benchmark_cpu_results.md`
