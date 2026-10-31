> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 1000 images (700 WIDER FACE val + 300 VN plates), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Accuracy runs: 3 workers, confidence 0.05 saved, scored at the operating threshold 0.35 (engine) / 0.2 (deface) and at the best-F1 threshold. Faces on WIDER images, plates on VN images.

> Accuracy & Privacy Recall Benchmark Comparison:
> - Model differences: our engine uses YOLOv8n-oiv7 at configured imgsz (default 640px) letterboxed input; deface uses CenterFace ONNX.
> - Matching rule: greedy matching by confidence score, IoU >= 0.5, each non-ignore GT used at most once.
> - Ignore boxes: WIDER FACE invalid=1 annotations are flagged ignore; predictions matching ignore boxes are neither TP nor FP.
> - Subset scoring: faces are scored exclusively on the WIDER subset; plates exclusively on the VN subset.
> - Privacy recall: a GT target counts as protected if its bounding box area is covered >= 70% by the redacted area.
>   Our engine expands boxes by run padding (0.1 default); deface expands boxes by mask_scale 1.3 (ellipse approximated by its bounding box).
> - deface license plates: deface detects faces only; license plates rows report 'not supported' (recall 0 by design).

## Overall Detection Quality & Privacy Recall

| Run | Tool | Input Scale | Faces AP@0.5 | Faces P | Faces R | Faces F1 | Faces Priv Recall | Plates AP@0.5 | Plates P | Plates R | Plates F1 | Plates Priv Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-092722-fixed-3w-conf0.05` | engine | 1280px | 0.3799 | 0.9702 | 0.1571 | 0.2704 | **0.1588** | 0.6688 | 0.8734 | 0.2300 | 0.3641 | **0.2433** |
| `20261031-075855-fixed-3w-conf0.05` | engine | 640px | 0.2251 | 0.9831 | 0.0718 | 0.1338 | **0.0727** | 0.7015 | 0.9756 | 0.1333 | 0.2346 | **0.1367** |
| `20261031-090539-fixed-3w-conf0.05` | engine | 960px | 0.3145 | 0.9650 | 0.1090 | 0.1960 | **0.1103** | 0.7532 | 0.9545 | 0.2100 | 0.3443 | **0.2100** |
| `20261031-093226-deface-gpu` | deface | 640x480 | 0.4755 | 0.6209 | 0.4694 | 0.5346 | **0.5420** | not supported | not supported | 0.0000 | not supported | not supported |
| `20261031-092910-deface-gpu` | deface | full | 0.6486 | 0.6400 | 0.6435 | 0.6417 | **0.7230** | not supported | not supported | 0.0000 | not supported | not supported |

### Face Recall & Privacy Recall by Size

| Run | Tool | Tiny (<16px) R / Priv | Small (16–32px) R / Priv | Medium (32–96px) R / Priv | Large (>96px) R / Priv |
| --- | --- | --- | --- | --- | --- |
| `20261031-092722-fixed-3w-conf0.05` | engine | 0.001 / 0.001 | 0.090 / 0.091 | 0.465 / 0.471 | 0.836 / 0.833 |
| `20261031-075855-fixed-3w-conf0.05` | engine | 0.000 / 0.000 | 0.008 / 0.009 | 0.196 / 0.199 | 0.683 / 0.680 |
| `20261031-090539-fixed-3w-conf0.05` | engine | 0.000 / 0.000 | 0.036 / 0.037 | 0.316 / 0.321 | 0.790 / 0.787 |
| `20261031-093226-deface-gpu` | deface | 0.097 / 0.194 | 0.681 / 0.760 | 0.917 / 0.939 | 0.918 / 0.923 |
| `20261031-092910-deface-gpu` | deface | 0.345 / 0.480 | 0.862 / 0.910 | 0.946 / 0.956 | 0.926 / 0.949 |

### Face Recall & Privacy Recall by Measured Sharpness

| Run | Tool | Very Blurry (<25) R / Priv | Blurry (25–100) R / Priv | Soft (100–400) R / Priv | Sharp (≥400) R / Priv |
| --- | --- | --- | --- | --- | --- |
| `20261031-092722-fixed-3w-conf0.05` | engine | 0.021 / 0.022 | 0.229 / 0.234 | 0.474 / 0.479 | 0.728 / 0.725 |
| `20261031-075855-fixed-3w-conf0.05` | engine | 0.002 / 0.003 | 0.053 / 0.056 | 0.257 / 0.259 | 0.483 / 0.483 |
| `20261031-090539-fixed-3w-conf0.05` | engine | 0.011 / 0.011 | 0.122 / 0.125 | 0.356 / 0.360 | 0.605 / 0.603 |
| `20261031-093226-deface-gpu` | deface | 0.236 / 0.327 | 0.828 / 0.890 | 0.918 / 0.939 | 0.936 / 0.951 |
| `20261031-092910-deface-gpu` | deface | 0.485 / 0.596 | 0.904 / 0.933 | 0.937 / 0.956 | 0.938 / 0.957 |

### Face Breakdown by WIDER Attribute

| Run | Attribute Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| `20261031-092722-fixed-3w-conf0.05` | blur: clear | 1050 | 0.6410 | 0.6429 |
| `20261031-092722-fixed-3w-conf0.05` | blur: normal blur | 2219 | 0.2276 | 0.2321 |
| `20261031-092722-fixed-3w-conf0.05` | blur: heavy blur | 4810 | 0.0189 | 0.0193 |
| `20261031-092722-fixed-3w-conf0.05` | expression: typical expression | 8001 | 0.1549 | 0.1566 |
| `20261031-092722-fixed-3w-conf0.05` | expression: exaggerate expression | 78 | 0.3846 | 0.3846 |
| `20261031-092722-fixed-3w-conf0.05` | illumination: normal illumination | 7668 | 0.1583 | 0.1601 |
| `20261031-092722-fixed-3w-conf0.05` | illumination: extreme illumination | 411 | 0.1338 | 0.1338 |
| `20261031-092722-fixed-3w-conf0.05` | occlusion: no occlusion | 4980 | 0.2337 | 0.2347 |
| `20261031-092722-fixed-3w-conf0.05` | occlusion: partial occlusion | 1433 | 0.0419 | 0.0433 |
| `20261031-092722-fixed-3w-conf0.05` | occlusion: heavy occlusion | 1666 | 0.0270 | 0.0312 |
| `20261031-092722-fixed-3w-conf0.05` | pose: typical pose | 7757 | 0.1605 | 0.1620 |
| `20261031-092722-fixed-3w-conf0.05` | pose: atypical pose | 322 | 0.0745 | 0.0807 |
| `20261031-075855-fixed-3w-conf0.05` | blur: clear | 1050 | 0.3971 | 0.3981 |
| `20261031-075855-fixed-3w-conf0.05` | blur: normal blur | 2219 | 0.0676 | 0.0694 |
| `20261031-075855-fixed-3w-conf0.05` | blur: heavy blur | 4810 | 0.0027 | 0.0031 |
| `20261031-075855-fixed-3w-conf0.05` | expression: typical expression | 8001 | 0.0711 | 0.0720 |
| `20261031-075855-fixed-3w-conf0.05` | expression: exaggerate expression | 78 | 0.1410 | 0.1410 |
| `20261031-075855-fixed-3w-conf0.05` | illumination: normal illumination | 7668 | 0.0717 | 0.0726 |
| `20261031-075855-fixed-3w-conf0.05` | illumination: extreme illumination | 411 | 0.0730 | 0.0730 |
| `20261031-075855-fixed-3w-conf0.05` | occlusion: no occlusion | 4980 | 0.1086 | 0.1090 |
| `20261031-075855-fixed-3w-conf0.05` | occlusion: partial occlusion | 1433 | 0.0174 | 0.0181 |
| `20261031-075855-fixed-3w-conf0.05` | occlusion: heavy occlusion | 1666 | 0.0084 | 0.0108 |
| `20261031-075855-fixed-3w-conf0.05` | pose: typical pose | 7757 | 0.0725 | 0.0734 |
| `20261031-075855-fixed-3w-conf0.05` | pose: atypical pose | 322 | 0.0559 | 0.0559 |
| `20261031-090539-fixed-3w-conf0.05` | blur: clear | 1050 | 0.5019 | 0.5038 |
| `20261031-090539-fixed-3w-conf0.05` | blur: normal blur | 2219 | 0.1393 | 0.1424 |
| `20261031-090539-fixed-3w-conf0.05` | blur: heavy blur | 4810 | 0.0094 | 0.0096 |
| `20261031-090539-fixed-3w-conf0.05` | expression: typical expression | 8001 | 0.1075 | 0.1087 |
| `20261031-090539-fixed-3w-conf0.05` | expression: exaggerate expression | 78 | 0.2692 | 0.2692 |
| `20261031-090539-fixed-3w-conf0.05` | illumination: normal illumination | 7668 | 0.1085 | 0.1098 |
| `20261031-090539-fixed-3w-conf0.05` | illumination: extreme illumination | 411 | 0.1192 | 0.1192 |
| `20261031-090539-fixed-3w-conf0.05` | occlusion: no occlusion | 4980 | 0.1645 | 0.1649 |
| `20261031-090539-fixed-3w-conf0.05` | occlusion: partial occlusion | 1433 | 0.0258 | 0.0258 |
| `20261031-090539-fixed-3w-conf0.05` | occlusion: heavy occlusion | 1666 | 0.0150 | 0.0198 |
| `20261031-090539-fixed-3w-conf0.05` | pose: typical pose | 7757 | 0.1107 | 0.1120 |
| `20261031-090539-fixed-3w-conf0.05` | pose: atypical pose | 322 | 0.0683 | 0.0683 |
| `20261031-093226-deface-gpu` | blur: clear | 1050 | 0.8410 | 0.8629 |
| `20261031-093226-deface-gpu` | blur: normal blur | 2219 | 0.7986 | 0.8616 |
| `20261031-093226-deface-gpu` | blur: heavy blur | 4810 | 0.2364 | 0.3245 |
| `20261031-093226-deface-gpu` | expression: typical expression | 8001 | 0.4661 | 0.5391 |
| `20261031-093226-deface-gpu` | expression: exaggerate expression | 78 | 0.8077 | 0.8462 |
| `20261031-093226-deface-gpu` | illumination: normal illumination | 7668 | 0.4675 | 0.5395 |
| `20261031-093226-deface-gpu` | illumination: extreme illumination | 411 | 0.5036 | 0.5888 |
| `20261031-093226-deface-gpu` | occlusion: no occlusion | 4980 | 0.6127 | 0.6691 |
| `20261031-093226-deface-gpu` | occlusion: partial occlusion | 1433 | 0.2749 | 0.3608 |
| `20261031-093226-deface-gpu` | occlusion: heavy occlusion | 1666 | 0.2083 | 0.3181 |
| `20261031-093226-deface-gpu` | pose: typical pose | 7757 | 0.4686 | 0.5387 |
| `20261031-093226-deface-gpu` | pose: atypical pose | 322 | 0.4876 | 0.6211 |
| `20261031-092910-deface-gpu` | blur: clear | 1050 | 0.9095 | 0.9362 |
| `20261031-092910-deface-gpu` | blur: normal blur | 2219 | 0.8968 | 0.9324 |
| `20261031-092910-deface-gpu` | blur: heavy blur | 4810 | 0.4686 | 0.5798 |
| `20261031-092910-deface-gpu` | expression: typical expression | 8001 | 0.6409 | 0.7208 |
| `20261031-092910-deface-gpu` | expression: exaggerate expression | 78 | 0.9103 | 0.9487 |
| `20261031-092910-deface-gpu` | illumination: normal illumination | 7668 | 0.6372 | 0.7170 |
| `20261031-092910-deface-gpu` | illumination: extreme illumination | 411 | 0.7616 | 0.8345 |
| `20261031-092910-deface-gpu` | occlusion: no occlusion | 4980 | 0.7857 | 0.8343 |
| `20261031-092910-deface-gpu` | occlusion: partial occlusion | 1433 | 0.4878 | 0.6092 |
| `20261031-092910-deface-gpu` | occlusion: heavy occlusion | 1666 | 0.3523 | 0.4880 |
| `20261031-092910-deface-gpu` | pose: typical pose | 7757 | 0.6442 | 0.7224 |
| `20261031-092910-deface-gpu` | pose: atypical pose | 322 | 0.6273 | 0.7360 |

### Face Breakdown by Measured Sharpness

| Run | Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- | --- |
| `20261031-092722-fixed-3w-conf0.05` | Very blurry | < 25 | 5138 | 0.0212 | 0.0218 |
| `20261031-092722-fixed-3w-conf0.05` | Blurry | 25–100 | 1439 | 0.2293 | 0.2342 |
| `20261031-092722-fixed-3w-conf0.05` | Soft | 100–400 | 1036 | 0.4739 | 0.4788 |
| `20261031-092722-fixed-3w-conf0.05` | Sharp | ≥ 400 | 466 | 0.7275 | 0.7253 |
| `20261031-075855-fixed-3w-conf0.05` | Very blurry | < 25 | 5138 | 0.0023 | 0.0027 |
| `20261031-075855-fixed-3w-conf0.05` | Blurry | 25–100 | 1439 | 0.0535 | 0.0556 |
| `20261031-075855-fixed-3w-conf0.05` | Soft | 100–400 | 1036 | 0.2568 | 0.2587 |
| `20261031-075855-fixed-3w-conf0.05` | Sharp | ≥ 400 | 466 | 0.4828 | 0.4828 |
| `20261031-090539-fixed-3w-conf0.05` | Very blurry | < 25 | 5138 | 0.0107 | 0.0111 |
| `20261031-090539-fixed-3w-conf0.05` | Blurry | 25–100 | 1439 | 0.1216 | 0.1251 |
| `20261031-090539-fixed-3w-conf0.05` | Soft | 100–400 | 1036 | 0.3562 | 0.3600 |
| `20261031-090539-fixed-3w-conf0.05` | Sharp | ≥ 400 | 466 | 0.6052 | 0.6030 |
| `20261031-093226-deface-gpu` | Very blurry | < 25 | 5138 | 0.2363 | 0.3274 |
| `20261031-093226-deface-gpu` | Blurry | 25–100 | 1439 | 0.8277 | 0.8902 |
| `20261031-093226-deface-gpu` | Soft | 100–400 | 1036 | 0.9180 | 0.9392 |
| `20261031-093226-deface-gpu` | Sharp | ≥ 400 | 466 | 0.9356 | 0.9506 |
| `20261031-092910-deface-gpu` | Very blurry | < 25 | 5138 | 0.4846 | 0.5960 |
| `20261031-092910-deface-gpu` | Blurry | 25–100 | 1439 | 0.9041 | 0.9333 |
| `20261031-092910-deface-gpu` | Soft | 100–400 | 1036 | 0.9373 | 0.9556 |
| `20261031-092910-deface-gpu` | Sharp | ≥ 400 | 466 | 0.9378 | 0.9571 |

### Operating Thresholds vs Best-F1

| Run | Class | Default Thresh | Default F1 | Best Thresh | Best P | Best R | Best F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-092722-fixed-3w-conf0.05` | face | 0.35 | 0.2704 | 0.0508 | 0.8059 | 0.4009 | 0.5355 |
| `20261031-092722-fixed-3w-conf0.05` | plate | 0.35 | 0.3641 | 0.0585 | 0.7358 | 0.7800 | 0.7573 |
| `20261031-075855-fixed-3w-conf0.05` | face | 0.35 | 0.1338 | 0.0500 | 0.8099 | 0.2394 | 0.3695 |
| `20261031-075855-fixed-3w-conf0.05` | plate | 0.35 | 0.2346 | 0.0501 | 0.7600 | 0.7600 | 0.7600 |
| `20261031-090539-fixed-3w-conf0.05` | face | 0.35 | 0.1960 | 0.0500 | 0.8252 | 0.3320 | 0.4735 |
| `20261031-090539-fixed-3w-conf0.05` | plate | 0.35 | 0.3443 | 0.0752 | 0.8309 | 0.7700 | 0.7993 |
| `20261031-093226-deface-gpu` | face | 0.20 | 0.5346 | 0.3221 | 0.8569 | 0.4285 | 0.5713 |
| `20261031-092910-deface-gpu` | face | 0.20 | 0.6417 | 0.3314 | 0.8624 | 0.5811 | 0.6944 |

