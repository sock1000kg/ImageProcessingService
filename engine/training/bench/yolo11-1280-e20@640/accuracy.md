# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11-1280-e20@640`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.5191 | 0.7410 | 0.4915 | 0.5910 | 0.1668 | 0.7714 | 0.4816 | 0.5930 | **0.5296** |
| Plate | vn | 500 | 0.9656 | 0.8838 | 0.9580 | 0.9194 | 0.4004 | 0.9810 | 0.9300 | 0.9548 | **0.9600** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.1756 | 0.2270 |
| Small | 16–32 | 10244 | 0.6942 | 0.7339 |
| Medium | 32–96 | 7823 | 0.8869 | 0.8995 |
| Large | > 96 | 1892 | 0.9561 | 0.9582 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.8895 | 0.8982 |
| Blur | normal blur (1) | 10378 | 0.7687 | 0.7971 |
| Blur | heavy blur (2) | 23369 | 0.2769 | 0.3262 |
| Expression | typical expression (0) | 38712 | 0.4879 | 0.5262 |
| Expression | exaggerate expression (1) | 400 | 0.8400 | 0.8625 |
| Illumination | normal illumination (0) | 36832 | 0.4849 | 0.5236 |
| Illumination | extreme illumination (1) | 2280 | 0.5982 | 0.6272 |
| Occlusion | no occlusion (0) | 23428 | 0.6600 | 0.6908 |
| Occlusion | partial occlusion (1) | 7097 | 0.3024 | 0.3510 |
| Occlusion | heavy occlusion (2) | 8587 | 0.1880 | 0.2376 |
| Pose | typical pose (0) | 37475 | 0.4939 | 0.5309 |
| Pose | atypical pose (1) | 1637 | 0.4356 | 0.5003 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.2943 | 0.3449 |
| Blurry | 25–100 | 6506 | 0.7817 | 0.8037 |
| Soft | 100–400 | 4806 | 0.8876 | 0.9005 |
| Sharp | ≥ 400 | 2631 | 0.9358 | 0.9418 |

