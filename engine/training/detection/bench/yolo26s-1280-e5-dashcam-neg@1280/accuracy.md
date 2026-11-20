# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `engine/training/detection/bench/yolo26s-1280-e5-dashcam-neg@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7725 | 0.8134 | 0.7542 | 0.7827 | 0.2442 | 0.8958 | 0.7177 | 0.7969 | **0.7852** |
| Plate | vn | 500 | 0.9697 | 0.7954 | 0.9640 | 0.8716 | 0.7661 | 0.9848 | 0.9100 | 0.9459 | **0.9640** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5864 | 0.6393 |
| Small | 16–32 | 10244 | 0.8824 | 0.8963 |
| Medium | 32–96 | 7823 | 0.9466 | 0.9532 |
| Large | > 96 | 1892 | 0.9641 | 0.9662 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9426 | 0.9480 |
| Blur | normal blur (1) | 10378 | 0.9379 | 0.9511 |
| Blur | heavy blur (2) | 23369 | 0.6294 | 0.6742 |
| Expression | typical expression (0) | 38712 | 0.7524 | 0.7836 |
| Expression | exaggerate expression (1) | 400 | 0.9350 | 0.9450 |
| Illumination | normal illumination (0) | 36832 | 0.7486 | 0.7805 |
| Illumination | extreme illumination (1) | 2280 | 0.8456 | 0.8618 |
| Occlusion | no occlusion (0) | 23428 | 0.8832 | 0.8973 |
| Occlusion | partial occlusion (1) | 7097 | 0.6539 | 0.6982 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4853 | 0.5513 |
| Pose | typical pose (0) | 37475 | 0.7565 | 0.7876 |
| Pose | atypical pose (1) | 1637 | 0.7025 | 0.7312 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6533 | 0.6971 |
| Blurry | 25–100 | 6506 | 0.9122 | 0.9233 |
| Soft | 100–400 | 4806 | 0.9544 | 0.9613 |
| Sharp | ≥ 400 | 2631 | 0.9631 | 0.9650 |

