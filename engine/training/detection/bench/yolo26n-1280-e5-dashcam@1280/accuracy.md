# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `engine/training/detection/bench/yolo26n-1280-e5-dashcam@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7482 | 0.7660 | 0.7357 | 0.7505 | 0.2571 | 0.8869 | 0.6888 | 0.7754 | **0.7719** |
| Plate | vn | 500 | 0.9823 | 0.7792 | 0.9740 | 0.8658 | 0.7501 | 0.9875 | 0.9460 | 0.9663 | **0.9740** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5609 | 0.6217 |
| Small | 16–32 | 10244 | 0.8676 | 0.8853 |
| Medium | 32–96 | 7823 | 0.9363 | 0.9452 |
| Large | > 96 | 1892 | 0.9609 | 0.9630 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9376 | 0.9420 |
| Blur | normal blur (1) | 10378 | 0.9232 | 0.9397 |
| Blur | heavy blur (2) | 23369 | 0.6060 | 0.6584 |
| Expression | typical expression (0) | 38712 | 0.7337 | 0.7703 |
| Expression | exaggerate expression (1) | 400 | 0.9250 | 0.9325 |
| Illumination | normal illumination (0) | 36832 | 0.7302 | 0.7675 |
| Illumination | extreme illumination (1) | 2280 | 0.8232 | 0.8434 |
| Occlusion | no occlusion (0) | 23428 | 0.8704 | 0.8891 |
| Occlusion | partial occlusion (1) | 7097 | 0.6276 | 0.6794 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4574 | 0.5287 |
| Pose | typical pose (0) | 37475 | 0.7387 | 0.7748 |
| Pose | atypical pose (1) | 1637 | 0.6671 | 0.7056 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6297 | 0.6808 |
| Blurry | 25–100 | 6506 | 0.8982 | 0.9119 |
| Soft | 100–400 | 4806 | 0.9471 | 0.9546 |
| Sharp | ≥ 400 | 2631 | 0.9612 | 0.9635 |

