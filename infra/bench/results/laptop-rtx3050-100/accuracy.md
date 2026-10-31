> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 100 images (70 WIDER FACE val + 30 VN plates), ~1024px wide.
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
| `20261031-073824-fixed-3w-conf0.05` | engine | 1280px | 0.4170 | 0.9528 | 0.1285 | 0.2265 | **0.1310** | 0.8798 | 1.0000 | 0.2000 | 0.3333 | **0.2000** |
| `20261031-065033-fixed-3w-conf0.05` | engine | 640px | 0.2130 | 0.9831 | 0.0738 | 0.1373 | **0.0751** | 0.8075 | 1.0000 | 0.1667 | 0.2857 | **0.1667** |
| `20261031-070656-fixed-3w-conf0.05` | engine | 960px | 0.3094 | 0.9744 | 0.0967 | 0.1759 | **0.0980** | 0.8122 | 1.0000 | 0.1667 | 0.2857 | **0.1667** |
| `20261031-073948-deface-gpu` | deface | 640x480 | 0.5567 | 0.5279 | 0.5776 | 0.5516 | **0.7265** | not supported | not supported | 0.0000 | not supported | not supported |
| `20261031-073922-deface-gpu` | deface | full | 0.7122 | 0.6117 | 0.7176 | 0.6604 | **0.8232** | not supported | not supported | 0.0000 | not supported | not supported |

### Face Recall & Privacy Recall by Size

| Run | Tool | Tiny (<16px) R / Priv | Small (16–32px) R / Priv | Medium (32–96px) R / Priv | Large (>96px) R / Priv |
| --- | --- | --- | --- | --- | --- |
| `20261031-073824-fixed-3w-conf0.05` | engine | 0.000 / 0.000 | 0.031 / 0.031 | 0.358 / 0.371 | 0.875 / 0.875 |
| `20261031-065033-fixed-3w-conf0.05` | engine | 0.000 / 0.000 | 0.004 / 0.004 | 0.164 / 0.170 | 0.775 / 0.775 |
| `20261031-070656-fixed-3w-conf0.05` | engine | 0.000 / 0.000 | 0.007 / 0.007 | 0.239 / 0.245 | 0.900 / 0.900 |
| `20261031-073948-deface-gpu` | deface | 0.191 / 0.425 | 0.760 / 0.906 | 0.868 / 0.899 | 1.000 / 1.000 |
| `20261031-073922-deface-gpu` | deface | 0.411 / 0.635 | 0.889 / 0.941 | 0.912 / 0.924 | 1.000 / 0.975 |

### Face Recall & Privacy Recall by Measured Sharpness

| Run | Tool | Very Blurry (<25) R / Priv | Blurry (25–100) R / Priv | Soft (100–400) R / Priv | Sharp (≥400) R / Priv |
| --- | --- | --- | --- | --- | --- |
| `20261031-073824-fixed-3w-conf0.05` | engine | 0.011 / 0.011 | 0.101 / 0.101 | 0.361 / 0.386 | 0.803 / 0.803 |
| `20261031-065033-fixed-3w-conf0.05` | engine | 0.006 / 0.006 | 0.041 / 0.041 | 0.145 / 0.157 | 0.590 / 0.590 |
| `20261031-070656-fixed-3w-conf0.05` | engine | 0.009 / 0.009 | 0.053 / 0.053 | 0.205 / 0.217 | 0.754 / 0.754 |
| `20261031-073948-deface-gpu` | deface | 0.383 / 0.588 | 0.811 / 0.917 | 0.928 / 0.952 | 0.967 / 0.967 |
| `20261031-073922-deface-gpu` | deface | 0.577 / 0.742 | 0.905 / 0.929 | 0.940 / 0.952 | 0.984 / 0.984 |

### Face Breakdown by WIDER Attribute

| Run | Attribute Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| `20261031-073824-fixed-3w-conf0.05` | blur: clear | 87 | 0.7241 | 0.7241 |
| `20261031-073824-fixed-3w-conf0.05` | blur: normal blur | 217 | 0.1567 | 0.1659 |
| `20261031-073824-fixed-3w-conf0.05` | blur: heavy blur | 482 | 0.0083 | 0.0083 |
| `20261031-073824-fixed-3w-conf0.05` | expression: typical expression | 777 | 0.1261 | 0.1287 |
| `20261031-073824-fixed-3w-conf0.05` | expression: exaggerate expression | 9 | 0.3333 | 0.3333 |
| `20261031-073824-fixed-3w-conf0.05` | illumination: normal illumination | 739 | 0.1340 | 0.1367 |
| `20261031-073824-fixed-3w-conf0.05` | illumination: extreme illumination | 47 | 0.0426 | 0.0426 |
| `20261031-073824-fixed-3w-conf0.05` | occlusion: no occlusion | 493 | 0.1866 | 0.1886 |
| `20261031-073824-fixed-3w-conf0.05` | occlusion: partial occlusion | 108 | 0.0278 | 0.0278 |
| `20261031-073824-fixed-3w-conf0.05` | occlusion: heavy occlusion | 185 | 0.0324 | 0.0378 |
| `20261031-073824-fixed-3w-conf0.05` | pose: typical pose | 753 | 0.1288 | 0.1301 |
| `20261031-073824-fixed-3w-conf0.05` | pose: atypical pose | 33 | 0.1212 | 0.1515 |
| `20261031-065033-fixed-3w-conf0.05` | blur: clear | 87 | 0.5057 | 0.5057 |
| `20261031-065033-fixed-3w-conf0.05` | blur: normal blur | 217 | 0.0645 | 0.0691 |
| `20261031-065033-fixed-3w-conf0.05` | blur: heavy blur | 482 | 0.0000 | 0.0000 |
| `20261031-065033-fixed-3w-conf0.05` | expression: typical expression | 777 | 0.0708 | 0.0721 |
| `20261031-065033-fixed-3w-conf0.05` | expression: exaggerate expression | 9 | 0.3333 | 0.3333 |
| `20261031-065033-fixed-3w-conf0.05` | illumination: normal illumination | 739 | 0.0785 | 0.0798 |
| `20261031-065033-fixed-3w-conf0.05` | illumination: extreme illumination | 47 | 0.0000 | 0.0000 |
| `20261031-065033-fixed-3w-conf0.05` | occlusion: no occlusion | 493 | 0.1095 | 0.1095 |
| `20261031-065033-fixed-3w-conf0.05` | occlusion: partial occlusion | 108 | 0.0185 | 0.0185 |
| `20261031-065033-fixed-3w-conf0.05` | occlusion: heavy occlusion | 185 | 0.0108 | 0.0162 |
| `20261031-065033-fixed-3w-conf0.05` | pose: typical pose | 753 | 0.0757 | 0.0770 |
| `20261031-065033-fixed-3w-conf0.05` | pose: atypical pose | 33 | 0.0303 | 0.0303 |
| `20261031-070656-fixed-3w-conf0.05` | blur: clear | 87 | 0.6207 | 0.6207 |
| `20261031-070656-fixed-3w-conf0.05` | blur: normal blur | 217 | 0.0876 | 0.0922 |
| `20261031-070656-fixed-3w-conf0.05` | blur: heavy blur | 482 | 0.0062 | 0.0062 |
| `20261031-070656-fixed-3w-conf0.05` | expression: typical expression | 777 | 0.0940 | 0.0952 |
| `20261031-070656-fixed-3w-conf0.05` | expression: exaggerate expression | 9 | 0.3333 | 0.3333 |
| `20261031-070656-fixed-3w-conf0.05` | illumination: normal illumination | 739 | 0.1015 | 0.1028 |
| `20261031-070656-fixed-3w-conf0.05` | illumination: extreme illumination | 47 | 0.0213 | 0.0213 |
| `20261031-070656-fixed-3w-conf0.05` | occlusion: no occlusion | 493 | 0.1400 | 0.1400 |
| `20261031-070656-fixed-3w-conf0.05` | occlusion: partial occlusion | 108 | 0.0185 | 0.0185 |
| `20261031-070656-fixed-3w-conf0.05` | occlusion: heavy occlusion | 185 | 0.0270 | 0.0324 |
| `20261031-070656-fixed-3w-conf0.05` | pose: typical pose | 753 | 0.0983 | 0.0996 |
| `20261031-070656-fixed-3w-conf0.05` | pose: atypical pose | 33 | 0.0606 | 0.0606 |
| `20261031-073948-deface-gpu` | blur: clear | 87 | 0.9540 | 0.9655 |
| `20261031-073948-deface-gpu` | blur: normal blur | 217 | 0.7696 | 0.9032 |
| `20261031-073948-deface-gpu` | blur: heavy blur | 482 | 0.4232 | 0.6037 |
| `20261031-073948-deface-gpu` | expression: typical expression | 777 | 0.5753 | 0.7246 |
| `20261031-073948-deface-gpu` | expression: exaggerate expression | 9 | 0.7778 | 0.8889 |
| `20261031-073948-deface-gpu` | illumination: normal illumination | 739 | 0.5765 | 0.7253 |
| `20261031-073948-deface-gpu` | illumination: extreme illumination | 47 | 0.5957 | 0.7447 |
| `20261031-073948-deface-gpu` | occlusion: no occlusion | 493 | 0.7465 | 0.8621 |
| `20261031-073948-deface-gpu` | occlusion: partial occlusion | 108 | 0.3056 | 0.5000 |
| `20261031-073948-deface-gpu` | occlusion: heavy occlusion | 185 | 0.2865 | 0.4973 |
| `20261031-073948-deface-gpu` | pose: typical pose | 753 | 0.5790 | 0.7238 |
| `20261031-073948-deface-gpu` | pose: atypical pose | 33 | 0.5455 | 0.7879 |
| `20261031-073922-deface-gpu` | blur: clear | 87 | 0.9540 | 0.9540 |
| `20261031-073922-deface-gpu` | blur: normal blur | 217 | 0.9078 | 0.9217 |
| `20261031-073922-deface-gpu` | blur: heavy blur | 482 | 0.5892 | 0.7552 |
| `20261031-073922-deface-gpu` | expression: typical expression | 777 | 0.7156 | 0.8224 |
| `20261031-073922-deface-gpu` | expression: exaggerate expression | 9 | 0.8889 | 0.8889 |
| `20261031-073922-deface-gpu` | illumination: normal illumination | 739 | 0.7131 | 0.8227 |
| `20261031-073922-deface-gpu` | illumination: extreme illumination | 47 | 0.7872 | 0.8298 |
| `20261031-073922-deface-gpu` | occlusion: no occlusion | 493 | 0.8702 | 0.9229 |
| `20261031-073922-deface-gpu` | occlusion: partial occlusion | 108 | 0.5833 | 0.7407 |
| `20261031-073922-deface-gpu` | occlusion: heavy occlusion | 185 | 0.3892 | 0.6054 |
| `20261031-073922-deface-gpu` | pose: typical pose | 753 | 0.7238 | 0.8274 |
| `20261031-073922-deface-gpu` | pose: atypical pose | 33 | 0.5758 | 0.7273 |

### Face Breakdown by Measured Sharpness

| Run | Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- | --- |
| `20261031-073824-fixed-3w-conf0.05` | Very blurry | < 25 | 473 | 0.0106 | 0.0106 |
| `20261031-073824-fixed-3w-conf0.05` | Blurry | 25–100 | 169 | 0.1006 | 0.1006 |
| `20261031-073824-fixed-3w-conf0.05` | Soft | 100–400 | 83 | 0.3614 | 0.3855 |
| `20261031-073824-fixed-3w-conf0.05` | Sharp | ≥ 400 | 61 | 0.8033 | 0.8033 |
| `20261031-065033-fixed-3w-conf0.05` | Very blurry | < 25 | 473 | 0.0063 | 0.0063 |
| `20261031-065033-fixed-3w-conf0.05` | Blurry | 25–100 | 169 | 0.0414 | 0.0414 |
| `20261031-065033-fixed-3w-conf0.05` | Soft | 100–400 | 83 | 0.1446 | 0.1566 |
| `20261031-065033-fixed-3w-conf0.05` | Sharp | ≥ 400 | 61 | 0.5902 | 0.5902 |
| `20261031-070656-fixed-3w-conf0.05` | Very blurry | < 25 | 473 | 0.0085 | 0.0085 |
| `20261031-070656-fixed-3w-conf0.05` | Blurry | 25–100 | 169 | 0.0533 | 0.0533 |
| `20261031-070656-fixed-3w-conf0.05` | Soft | 100–400 | 83 | 0.2048 | 0.2169 |
| `20261031-070656-fixed-3w-conf0.05` | Sharp | ≥ 400 | 61 | 0.7541 | 0.7541 |
| `20261031-073948-deface-gpu` | Very blurry | < 25 | 473 | 0.3827 | 0.5877 |
| `20261031-073948-deface-gpu` | Blurry | 25–100 | 169 | 0.8107 | 0.9172 |
| `20261031-073948-deface-gpu` | Soft | 100–400 | 83 | 0.9277 | 0.9518 |
| `20261031-073948-deface-gpu` | Sharp | ≥ 400 | 61 | 0.9672 | 0.9672 |
| `20261031-073922-deface-gpu` | Very blurry | < 25 | 473 | 0.5772 | 0.7421 |
| `20261031-073922-deface-gpu` | Blurry | 25–100 | 169 | 0.9053 | 0.9290 |
| `20261031-073922-deface-gpu` | Soft | 100–400 | 83 | 0.9398 | 0.9518 |
| `20261031-073922-deface-gpu` | Sharp | ≥ 400 | 61 | 0.9836 | 0.9836 |

### Operating Thresholds vs Best-F1

| Run | Class | Default Thresh | Default F1 | Best Thresh | Best P | Best R | Best F1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-073824-fixed-3w-conf0.05` | face | 0.35 | 0.2265 | 0.0506 | 0.7947 | 0.4580 | 0.5811 |
| `20261031-073824-fixed-3w-conf0.05` | plate | 0.35 | 0.3333 | 0.0618 | 0.9310 | 0.9000 | 0.9153 |
| `20261031-065033-fixed-3w-conf0.05` | face | 0.35 | 0.1373 | 0.0501 | 0.7593 | 0.2328 | 0.3564 |
| `20261031-065033-fixed-3w-conf0.05` | plate | 0.35 | 0.2857 | 0.0553 | 0.8333 | 0.8333 | 0.8333 |
| `20261031-070656-fixed-3w-conf0.05` | face | 0.35 | 0.1759 | 0.0516 | 0.8296 | 0.3282 | 0.4704 |
| `20261031-070656-fixed-3w-conf0.05` | plate | 0.35 | 0.2857 | 0.0689 | 0.9259 | 0.8333 | 0.8772 |
| `20261031-073948-deface-gpu` | face | 0.20 | 0.5516 | 0.3171 | 0.8172 | 0.5064 | 0.6253 |
| `20261031-073922-deface-gpu` | face | 0.20 | 0.6604 | 0.3480 | 0.8662 | 0.6425 | 0.7378 |

