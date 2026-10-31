# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-max/960px/accuracy-runs/20261031-103846-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.3065 | 0.9770 | 0.1127 | 0.2021 | 0.0500 | 0.8110 | 0.3244 | 0.4634 | **0.1138** |
| Plate | vn | 500 | 0.7572 | 0.9174 | 0.2220 | 0.3575 | 0.0752 | 0.8180 | 0.7820 | 0.7996 | **0.2260** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.0001 | 0.0002 |
| Small | 16–32 | 10244 | 0.0275 | 0.0294 |
| Medium | 32–96 | 7823 | 0.3255 | 0.3284 |
| Large | > 96 | 1892 | 0.8351 | 0.8335 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.5465 | 0.5471 |
| Blur | normal blur (1) | 10378 | 0.1282 | 0.1309 |
| Blur | heavy blur (2) | 23369 | 0.0063 | 0.0068 |
| Expression | typical expression (0) | 38712 | 0.1101 | 0.1112 |
| Expression | exaggerate expression (1) | 400 | 0.3650 | 0.3675 |
| Illumination | normal illumination (0) | 36832 | 0.1129 | 0.1141 |
| Illumination | extreme illumination (1) | 2280 | 0.1092 | 0.1096 |
| Occlusion | no occlusion (0) | 23428 | 0.1725 | 0.1730 |
| Occlusion | partial occlusion (1) | 7097 | 0.0293 | 0.0303 |
| Occlusion | heavy occlusion (2) | 8587 | 0.0186 | 0.0214 |
| Pose | typical pose (0) | 37475 | 0.1133 | 0.1142 |
| Pose | atypical pose (1) | 1637 | 0.1002 | 0.1057 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.0085 | 0.0092 |
| Blurry | 25–100 | 6506 | 0.1111 | 0.1131 |
| Soft | 100–400 | 4806 | 0.3677 | 0.3712 |
| Sharp | ≥ 400 | 2631 | 0.6477 | 0.6458 |

