# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `engine/training/detection/bench/yolo26n-1280-e5-dashcam-neg@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7487 | 0.7494 | 0.7389 | 0.7441 | 0.2594 | 0.8766 | 0.6937 | 0.7745 | **0.7766** |
| Plate | vn | 500 | 0.9859 | 0.7997 | 0.9740 | 0.8783 | 0.7149 | 0.9835 | 0.9540 | 0.9685 | **0.9740** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5650 | 0.6280 |
| Small | 16–32 | 10244 | 0.8712 | 0.8905 |
| Medium | 32–96 | 7823 | 0.9379 | 0.9461 |
| Large | > 96 | 1892 | 0.9598 | 0.9625 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9376 | 0.9443 |
| Blur | normal blur (1) | 10378 | 0.9245 | 0.9405 |
| Blur | heavy blur (2) | 23369 | 0.6109 | 0.6653 |
| Expression | typical expression (0) | 38712 | 0.7370 | 0.7750 |
| Expression | exaggerate expression (1) | 400 | 0.9225 | 0.9325 |
| Illumination | normal illumination (0) | 36832 | 0.7336 | 0.7724 |
| Illumination | extreme illumination (1) | 2280 | 0.8246 | 0.8443 |
| Occlusion | no occlusion (0) | 23428 | 0.8721 | 0.8915 |
| Occlusion | partial occlusion (1) | 7097 | 0.6338 | 0.6863 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4624 | 0.5377 |
| Pose | typical pose (0) | 37475 | 0.7419 | 0.7794 |
| Pose | atypical pose (1) | 1637 | 0.6701 | 0.7111 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6342 | 0.6872 |
| Blurry | 25–100 | 6506 | 0.9002 | 0.9152 |
| Soft | 100–400 | 4806 | 0.9469 | 0.9551 |
| Sharp | ≥ 400 | 2631 | 0.9616 | 0.9628 |

