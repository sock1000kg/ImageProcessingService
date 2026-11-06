# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolov8n-oiv7@960`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.3065 | 0.9354 | 0.2146 | 0.3491 | 0.0500 | 0.8110 | 0.3244 | 0.4634 | **0.2223** |
| Plate | vn | 500 | 0.7572 | 0.8971 | 0.5580 | 0.6880 | 0.0752 | 0.8180 | 0.7820 | 0.7996 | **0.5620** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.0052 | 0.0103 |
| Small | 16–32 | 10244 | 0.1562 | 0.1685 |
| Medium | 32–96 | 7823 | 0.6308 | 0.6409 |
| Large | > 96 | 1892 | 0.9286 | 0.9281 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.7381 | 0.7418 |
| Blur | normal blur (1) | 10378 | 0.3468 | 0.3585 |
| Blur | heavy blur (2) | 23369 | 0.0356 | 0.0425 |
| Expression | typical expression (0) | 38712 | 0.2108 | 0.2186 |
| Expression | exaggerate expression (1) | 400 | 0.5775 | 0.5825 |
| Illumination | normal illumination (0) | 36832 | 0.2156 | 0.2235 |
| Illumination | extreme illumination (1) | 2280 | 0.1974 | 0.2031 |
| Occlusion | no occlusion (0) | 23428 | 0.3104 | 0.3148 |
| Occlusion | partial occlusion (1) | 7097 | 0.0841 | 0.0914 |
| Occlusion | heavy occlusion (2) | 8587 | 0.0609 | 0.0780 |
| Pose | typical pose (0) | 37475 | 0.2142 | 0.2215 |
| Pose | atypical pose (1) | 1637 | 0.2217 | 0.2407 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.0461 | 0.0536 |
| Blurry | 25–100 | 6506 | 0.3234 | 0.3338 |
| Soft | 100–400 | 4806 | 0.6092 | 0.6188 |
| Sharp | ≥ 400 | 2631 | 0.8358 | 0.8354 |

