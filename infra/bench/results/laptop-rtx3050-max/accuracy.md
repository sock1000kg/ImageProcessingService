> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 3726 images (all 3226 WIDER FACE val + all 500 VN plates: Test 400 + Valid 100), ~1024px wide.
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
| `20261031-111852-fixed-3w-conf0.05` | engine | 1280px | 0.3690 | 0.9760 | 0.1572 | 0.2707 | **0.1591** | 0.6920 | 0.9028 | 0.2600 | 0.4037 | **0.2680** |
| `20261031-100653-fixed-3w-conf0.05` | engine | 640px | 0.2192 | 0.9866 | 0.0755 | 0.1403 | **0.0759** | 0.7050 | 0.9714 | 0.1360 | 0.2386 | **0.1380** |
| `20261031-103846-fixed-3w-conf0.05` | engine | 960px | 0.3065 | 0.9770 | 0.1127 | 0.2021 | **0.1138** | 0.7572 | 0.9174 | 0.2220 | 0.3575 | **0.2260** |
| `20261031-113700-deface-gpu` | deface | 640x480 | 0.4708 | 0.6150 | 0.4650 | 0.5295 | **0.5474** | not supported | not supported | 0.0000 | not supported | not supported |
| `20261031-112249-deface-gpu` | deface | full | 0.6494 | 0.6433 | 0.6403 | 0.6418 | **0.7231** | not supported | not supported | 0.0000 | not supported | not supported |

### Face Recall & Privacy Recall by Size

| Run | Tool | Tiny (<16px) R / Priv | Small (16–32px) R / Priv | Medium (32–96px) R / Priv | Large (>96px) R / Priv |
| --- | --- | --- | --- | --- | --- |
| `20261031-111852-fixed-3w-conf0.05` | engine | 0.001 / 0.001 | 0.073 / 0.075 | 0.478 / 0.484 | 0.871 / 0.873 |
| `20261031-100653-fixed-3w-conf0.05` | engine | 0.000 / 0.000 | 0.006 / 0.007 | 0.197 / 0.199 | 0.713 / 0.709 |
| `20261031-103846-fixed-3w-conf0.05` | engine | 0.000 / 0.000 | 0.028 / 0.029 | 0.326 / 0.328 | 0.835 / 0.834 |
| `20261031-113700-deface-gpu` | deface | 0.112 / 0.217 | 0.714 / 0.805 | 0.892 / 0.924 | 0.930 / 0.941 |
| `20261031-112249-deface-gpu` | deface | 0.373 / 0.507 | 0.864 / 0.912 | 0.928 / 0.948 | 0.947 / 0.959 |

### Face Recall & Privacy Recall by Measured Sharpness

| Run | Tool | Very Blurry (<25) R / Priv | Blurry (25–100) R / Priv | Soft (100–400) R / Priv | Sharp (≥400) R / Priv |
| --- | --- | --- | --- | --- | --- |
| `20261031-111852-fixed-3w-conf0.05` | engine | 0.020 / 0.021 | 0.204 / 0.209 | 0.489 / 0.493 | 0.744 / 0.745 |
| `20261031-100653-fixed-3w-conf0.05` | engine | 0.003 / 0.003 | 0.050 / 0.051 | 0.246 / 0.247 | 0.525 / 0.523 |
| `20261031-103846-fixed-3w-conf0.05` | engine | 0.009 / 0.009 | 0.111 / 0.113 | 0.368 / 0.371 | 0.648 / 0.646 |
| `20261031-113700-deface-gpu` | deface | 0.245 / 0.346 | 0.806 / 0.881 | 0.904 / 0.931 | 0.928 / 0.945 |
| `20261031-112249-deface-gpu` | deface | 0.488 / 0.603 | 0.891 / 0.926 | 0.931 / 0.951 | 0.945 / 0.957 |

### Face Breakdown by WIDER Attribute

| Run | Attribute Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| `20261031-111852-fixed-3w-conf0.05` | blur: clear | 5365 | 0.6568 | 0.6593 |
| `20261031-111852-fixed-3w-conf0.05` | blur: normal blur | 10378 | 0.2205 | 0.2247 |
| `20261031-111852-fixed-3w-conf0.05` | blur: heavy blur | 23369 | 0.0143 | 0.0151 |
| `20261031-111852-fixed-3w-conf0.05` | expression: typical expression | 38712 | 0.1541 | 0.1560 |
| `20261031-111852-fixed-3w-conf0.05` | expression: exaggerate expression | 400 | 0.4575 | 0.4600 |
| `20261031-111852-fixed-3w-conf0.05` | illumination: normal illumination | 36832 | 0.1581 | 0.1601 |
| `20261031-111852-fixed-3w-conf0.05` | illumination: extreme illumination | 2280 | 0.1421 | 0.1434 |
| `20261031-111852-fixed-3w-conf0.05` | occlusion: no occlusion | 23428 | 0.2363 | 0.2369 |
| `20261031-111852-fixed-3w-conf0.05` | occlusion: partial occlusion | 7097 | 0.0475 | 0.0495 |
| `20261031-111852-fixed-3w-conf0.05` | occlusion: heavy occlusion | 8587 | 0.0320 | 0.0374 |
| `20261031-111852-fixed-3w-conf0.05` | pose: typical pose | 37475 | 0.1586 | 0.1604 |
| `20261031-111852-fixed-3w-conf0.05` | pose: atypical pose | 1637 | 0.1246 | 0.1289 |
| `20261031-100653-fixed-3w-conf0.05` | blur: clear | 5365 | 0.4108 | 0.4106 |
| `20261031-100653-fixed-3w-conf0.05` | blur: normal blur | 10378 | 0.0676 | 0.0687 |
| `20261031-100653-fixed-3w-conf0.05` | blur: heavy blur | 23369 | 0.0020 | 0.0022 |
| `20261031-100653-fixed-3w-conf0.05` | expression: typical expression | 38712 | 0.0737 | 0.0741 |
| `20261031-100653-fixed-3w-conf0.05` | expression: exaggerate expression | 400 | 0.2475 | 0.2500 |
| `20261031-100653-fixed-3w-conf0.05` | illumination: normal illumination | 36832 | 0.0755 | 0.0759 |
| `20261031-100653-fixed-3w-conf0.05` | illumination: extreme illumination | 2280 | 0.0754 | 0.0759 |
| `20261031-100653-fixed-3w-conf0.05` | occlusion: no occlusion | 23428 | 0.1158 | 0.1161 |
| `20261031-100653-fixed-3w-conf0.05` | occlusion: partial occlusion | 7097 | 0.0190 | 0.0187 |
| `20261031-100653-fixed-3w-conf0.05` | occlusion: heavy occlusion | 8587 | 0.0123 | 0.0135 |
| `20261031-100653-fixed-3w-conf0.05` | pose: typical pose | 37475 | 0.0759 | 0.0762 |
| `20261031-100653-fixed-3w-conf0.05` | pose: atypical pose | 1637 | 0.0666 | 0.0684 |
| `20261031-103846-fixed-3w-conf0.05` | blur: clear | 5365 | 0.5465 | 0.5471 |
| `20261031-103846-fixed-3w-conf0.05` | blur: normal blur | 10378 | 0.1282 | 0.1309 |
| `20261031-103846-fixed-3w-conf0.05` | blur: heavy blur | 23369 | 0.0063 | 0.0068 |
| `20261031-103846-fixed-3w-conf0.05` | expression: typical expression | 38712 | 0.1101 | 0.1112 |
| `20261031-103846-fixed-3w-conf0.05` | expression: exaggerate expression | 400 | 0.3650 | 0.3675 |
| `20261031-103846-fixed-3w-conf0.05` | illumination: normal illumination | 36832 | 0.1129 | 0.1141 |
| `20261031-103846-fixed-3w-conf0.05` | illumination: extreme illumination | 2280 | 0.1092 | 0.1096 |
| `20261031-103846-fixed-3w-conf0.05` | occlusion: no occlusion | 23428 | 0.1725 | 0.1730 |
| `20261031-103846-fixed-3w-conf0.05` | occlusion: partial occlusion | 7097 | 0.0293 | 0.0303 |
| `20261031-103846-fixed-3w-conf0.05` | occlusion: heavy occlusion | 8587 | 0.0186 | 0.0214 |
| `20261031-103846-fixed-3w-conf0.05` | pose: typical pose | 37475 | 0.1133 | 0.1142 |
| `20261031-103846-fixed-3w-conf0.05` | pose: atypical pose | 1637 | 0.1002 | 0.1057 |
| `20261031-113700-deface-gpu` | blur: clear | 5365 | 0.8781 | 0.8975 |
| `20261031-113700-deface-gpu` | blur: normal blur | 10378 | 0.7661 | 0.8465 |
| `20261031-113700-deface-gpu` | blur: heavy blur | 23369 | 0.2364 | 0.3342 |
| `20261031-113700-deface-gpu` | expression: typical expression | 38712 | 0.4609 | 0.5438 |
| `20261031-113700-deface-gpu` | expression: exaggerate expression | 400 | 0.8550 | 0.8950 |
| `20261031-113700-deface-gpu` | illumination: normal illumination | 36832 | 0.4578 | 0.5410 |
| `20261031-113700-deface-gpu` | illumination: extreme illumination | 2280 | 0.5807 | 0.6513 |
| `20261031-113700-deface-gpu` | occlusion: no occlusion | 23428 | 0.6177 | 0.6824 |
| `20261031-113700-deface-gpu` | occlusion: partial occlusion | 7097 | 0.2667 | 0.3656 |
| `20261031-113700-deface-gpu` | occlusion: heavy occlusion | 8587 | 0.2121 | 0.3292 |
| `20261031-113700-deface-gpu` | pose: typical pose | 37475 | 0.4639 | 0.5447 |
| `20261031-113700-deface-gpu` | pose: atypical pose | 1637 | 0.4893 | 0.6097 |
| `20261031-112249-deface-gpu` | blur: clear | 5365 | 0.9171 | 0.9374 |
| `20261031-112249-deface-gpu` | blur: normal blur | 10378 | 0.8870 | 0.9308 |
| `20261031-112249-deface-gpu` | blur: heavy blur | 23369 | 0.4672 | 0.5817 |
| `20261031-112249-deface-gpu` | expression: typical expression | 38712 | 0.6375 | 0.7210 |
| `20261031-112249-deface-gpu` | expression: exaggerate expression | 400 | 0.9100 | 0.9325 |
| `20261031-112249-deface-gpu` | illumination: normal illumination | 36832 | 0.6323 | 0.7171 |
| `20261031-112249-deface-gpu` | illumination: extreme illumination | 2280 | 0.7693 | 0.8211 |
| `20261031-112249-deface-gpu` | occlusion: no occlusion | 23428 | 0.7930 | 0.8461 |
| `20261031-112249-deface-gpu` | occlusion: partial occlusion | 7097 | 0.4813 | 0.5945 |
| `20261031-112249-deface-gpu` | occlusion: heavy occlusion | 8587 | 0.3550 | 0.4939 |
| `20261031-112249-deface-gpu` | pose: typical pose | 37475 | 0.6408 | 0.7232 |
| `20261031-112249-deface-gpu` | pose: atypical pose | 1637 | 0.6286 | 0.7221 |

### Face Breakdown by Measured Sharpness

| Run | Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- | --- |
| `20261031-111852-fixed-3w-conf0.05` | Very blurry | < 25 | 25169 | 0.0203 | 0.0213 |
| `20261031-111852-fixed-3w-conf0.05` | Blurry | 25–100 | 6506 | 0.2043 | 0.2087 |
| `20261031-111852-fixed-3w-conf0.05` | Soft | 100–400 | 4806 | 0.4886 | 0.4929 |
| `20261031-111852-fixed-3w-conf0.05` | Sharp | ≥ 400 | 2631 | 0.7442 | 0.7450 |
| `20261031-100653-fixed-3w-conf0.05` | Very blurry | < 25 | 25169 | 0.0025 | 0.0028 |
| `20261031-100653-fixed-3w-conf0.05` | Blurry | 25–100 | 6506 | 0.0501 | 0.0510 |
| `20261031-100653-fixed-3w-conf0.05` | Soft | 100–400 | 4806 | 0.2459 | 0.2472 |
| `20261031-100653-fixed-3w-conf0.05` | Sharp | ≥ 400 | 2631 | 0.5249 | 0.5234 |
| `20261031-103846-fixed-3w-conf0.05` | Very blurry | < 25 | 25169 | 0.0085 | 0.0092 |
| `20261031-103846-fixed-3w-conf0.05` | Blurry | 25–100 | 6506 | 0.1111 | 0.1131 |
| `20261031-103846-fixed-3w-conf0.05` | Soft | 100–400 | 4806 | 0.3677 | 0.3712 |
| `20261031-103846-fixed-3w-conf0.05` | Sharp | ≥ 400 | 2631 | 0.6477 | 0.6458 |
| `20261031-113700-deface-gpu` | Very blurry | < 25 | 25169 | 0.2447 | 0.3463 |
| `20261031-113700-deface-gpu` | Blurry | 25–100 | 6506 | 0.8057 | 0.8810 |
| `20261031-113700-deface-gpu` | Soft | 100–400 | 4806 | 0.9037 | 0.9313 |
| `20261031-113700-deface-gpu` | Sharp | ≥ 400 | 2631 | 0.9285 | 0.9445 |
| `20261031-112249-deface-gpu` | Very blurry | < 25 | 25169 | 0.4880 | 0.6029 |
| `20261031-112249-deface-gpu` | Blurry | 25–100 | 6506 | 0.8910 | 0.9256 |
| `20261031-112249-deface-gpu` | Soft | 100–400 | 4806 | 0.9313 | 0.9509 |
| `20261031-112249-deface-gpu` | Sharp | ≥ 400 | 2631 | 0.9449 | 0.9567 |

### Operating Thresholds vs Best-F1

| Run | Class | Default Thresh | Default F1 | Best Thresh | Best P | Best R | Best F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-111852-fixed-3w-conf0.05` | face | 0.35 | 0.2707 | 0.0500 | 0.7940 | 0.3914 | 0.5243 |
| `20261031-111852-fixed-3w-conf0.05` | plate | 0.35 | 0.4037 | 0.0585 | 0.7429 | 0.7860 | 0.7638 |
| `20261031-100653-fixed-3w-conf0.05` | face | 0.35 | 0.1403 | 0.0500 | 0.8106 | 0.2317 | 0.3603 |
| `20261031-100653-fixed-3w-conf0.05` | plate | 0.35 | 0.2386 | 0.0501 | 0.7649 | 0.7680 | 0.7665 |
| `20261031-103846-fixed-3w-conf0.05` | face | 0.35 | 0.2021 | 0.0500 | 0.8110 | 0.3244 | 0.4634 |
| `20261031-103846-fixed-3w-conf0.05` | plate | 0.35 | 0.3575 | 0.0752 | 0.8180 | 0.7820 | 0.7996 |
| `20261031-113700-deface-gpu` | face | 0.20 | 0.5295 | 0.2973 | 0.8209 | 0.4283 | 0.5629 |
| `20261031-112249-deface-gpu` | face | 0.20 | 0.6418 | 0.3222 | 0.8513 | 0.5747 | 0.6862 |

