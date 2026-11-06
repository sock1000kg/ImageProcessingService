# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/direct-1280-e20@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.6870 | 0.8675 | 0.6347 | 0.7331 | 0.1445 | 0.8619 | 0.6383 | 0.7334 | **0.6557** |
| Plate | vn | 500 | 0.9886 | 0.9340 | 0.9900 | 0.9612 | 0.7431 | 0.9838 | 0.9700 | 0.9768 | **0.9900** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.4077 | 0.4401 |
| Small | 16–32 | 10244 | 0.7906 | 0.8040 |
| Medium | 32–96 | 7823 | 0.9099 | 0.9174 |
| Large | > 96 | 1892 | 0.9514 | 0.9540 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9156 | 0.9206 |
| Blur | normal blur (1) | 10378 | 0.8801 | 0.8934 |
| Blur | heavy blur (2) | 23369 | 0.4613 | 0.4894 |
| Expression | typical expression (0) | 38712 | 0.6321 | 0.6532 |
| Expression | exaggerate expression (1) | 400 | 0.8925 | 0.9025 |
| Illumination | normal illumination (0) | 36832 | 0.6281 | 0.6497 |
| Illumination | extreme illumination (1) | 2280 | 0.7412 | 0.7539 |
| Occlusion | no occlusion (0) | 23428 | 0.7976 | 0.8092 |
| Occlusion | partial occlusion (1) | 7097 | 0.4901 | 0.5178 |
| Occlusion | heavy occlusion (2) | 8587 | 0.3098 | 0.3510 |
| Pose | typical pose (0) | 37475 | 0.6371 | 0.6577 |
| Pose | atypical pose (1) | 1637 | 0.5809 | 0.6115 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.4920 | 0.5197 |
| Blurry | 25–100 | 6506 | 0.8508 | 0.8635 |
| Soft | 100–400 | 4806 | 0.9193 | 0.9263 |
| Sharp | ≥ 400 | 2631 | 0.9464 | 0.9487 |

