# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-max/640px/accuracy-runs/20261031-100653-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.2192 | 0.9866 | 0.0755 | 0.1403 | 0.0500 | 0.8106 | 0.2317 | 0.3603 | **0.0759** |
| Plate | vn | 500 | 0.7050 | 0.9714 | 0.1360 | 0.2386 | 0.0501 | 0.7649 | 0.7680 | 0.7665 | **0.1380** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.0000 | 0.0000 |
| Small | 16–32 | 10244 | 0.0062 | 0.0070 |
| Medium | 32–96 | 7823 | 0.1970 | 0.1988 |
| Large | > 96 | 1892 | 0.7125 | 0.7088 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.4108 | 0.4106 |
| Blur | normal blur (1) | 10378 | 0.0676 | 0.0687 |
| Blur | heavy blur (2) | 23369 | 0.0020 | 0.0022 |
| Expression | typical expression (0) | 38712 | 0.0737 | 0.0741 |
| Expression | exaggerate expression (1) | 400 | 0.2475 | 0.2500 |
| Illumination | normal illumination (0) | 36832 | 0.0755 | 0.0759 |
| Illumination | extreme illumination (1) | 2280 | 0.0754 | 0.0759 |
| Occlusion | no occlusion (0) | 23428 | 0.1158 | 0.1161 |
| Occlusion | partial occlusion (1) | 7097 | 0.0190 | 0.0187 |
| Occlusion | heavy occlusion (2) | 8587 | 0.0123 | 0.0135 |
| Pose | typical pose (0) | 37475 | 0.0759 | 0.0762 |
| Pose | atypical pose (1) | 1637 | 0.0666 | 0.0684 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.0025 | 0.0028 |
| Blurry | 25–100 | 6506 | 0.0501 | 0.0510 |
| Soft | 100–400 | 4806 | 0.2459 | 0.2472 |
| Sharp | ≥ 400 | 2631 | 0.5249 | 0.5234 |

