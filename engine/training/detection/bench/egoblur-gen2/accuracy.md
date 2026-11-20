# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `engine/training/detection/bench/egoblur-gen2`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.5340 | 0.9001 | 0.5133 | 0.6538 | 0.0929 | 0.8673 | 0.5290 | 0.6571 | **0.5326** |
| Plate | vn | 500 | 0.9998 | 0.7825 | 1.0000 | 0.8780 | 0.9252 | 1.0000 | 0.9940 | 0.9970 | **1.0000** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.2210 | 0.2490 |
| Small | 16–32 | 10244 | 0.6870 | 0.7023 |
| Medium | 32–96 | 7823 | 0.8924 | 0.8998 |
| Large | > 96 | 1892 | 0.9646 | 0.9662 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9016 | 0.9070 |
| Blur | normal blur (1) | 10378 | 0.8075 | 0.8237 |
| Blur | heavy blur (2) | 23369 | 0.2935 | 0.3174 |
| Expression | typical expression (0) | 38712 | 0.5097 | 0.5291 |
| Expression | exaggerate expression (1) | 400 | 0.8600 | 0.8700 |
| Illumination | normal illumination (0) | 36832 | 0.5082 | 0.5277 |
| Illumination | extreme illumination (1) | 2280 | 0.5961 | 0.6123 |
| Occlusion | no occlusion (0) | 23428 | 0.6895 | 0.7036 |
| Occlusion | partial occlusion (1) | 7097 | 0.3135 | 0.3376 |
| Occlusion | heavy occlusion (2) | 8587 | 0.1976 | 0.2273 |
| Pose | typical pose (0) | 37475 | 0.5142 | 0.5331 |
| Pose | atypical pose (1) | 1637 | 0.4936 | 0.5211 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.3230 | 0.3480 |
| Blurry | 25–100 | 6506 | 0.7840 | 0.7971 |
| Soft | 100–400 | 4806 | 0.9022 | 0.9097 |
| Sharp | ≥ 400 | 2631 | 0.9540 | 0.9559 |

