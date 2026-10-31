# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-1000/960px/accuracy-runs/20261031-090539-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 8079 | 0.3145 | 0.9650 | 0.1090 | 0.1960 | 0.0500 | 0.8252 | 0.3320 | 0.4735 | **0.1103** |
| Plate | vn | 300 | 0.7532 | 0.9545 | 0.2100 | 0.3443 | 0.0752 | 0.8309 | 0.7700 | 0.7993 | **0.2100** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 3727 | 0.0000 | 0.0003 |
| Small | 16–32 | 2367 | 0.0363 | 0.0372 |
| Medium | 32–96 | 1632 | 0.3162 | 0.3211 |
| Large | > 96 | 353 | 0.7904 | 0.7875 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 1050 | 0.5019 | 0.5038 |
| Blur | normal blur (1) | 2219 | 0.1393 | 0.1424 |
| Blur | heavy blur (2) | 4810 | 0.0094 | 0.0096 |
| Expression | typical expression (0) | 8001 | 0.1075 | 0.1087 |
| Expression | exaggerate expression (1) | 78 | 0.2692 | 0.2692 |
| Illumination | normal illumination (0) | 7668 | 0.1085 | 0.1098 |
| Illumination | extreme illumination (1) | 411 | 0.1192 | 0.1192 |
| Occlusion | no occlusion (0) | 4980 | 0.1645 | 0.1649 |
| Occlusion | partial occlusion (1) | 1433 | 0.0258 | 0.0258 |
| Occlusion | heavy occlusion (2) | 1666 | 0.0150 | 0.0198 |
| Pose | typical pose (0) | 7757 | 0.1107 | 0.1120 |
| Pose | atypical pose (1) | 322 | 0.0683 | 0.0683 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 5138 | 0.0107 | 0.0111 |
| Blurry | 25–100 | 1439 | 0.1216 | 0.1251 |
| Soft | 100–400 | 1036 | 0.3562 | 0.3600 |
| Sharp | ≥ 400 | 466 | 0.6052 | 0.6030 |

