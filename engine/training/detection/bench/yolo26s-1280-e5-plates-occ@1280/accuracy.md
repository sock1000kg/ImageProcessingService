# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `engine/training/detection/bench/yolo26s-1280-e5-plates-occ@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7738 | 0.8029 | 0.7566 | 0.7791 | 0.2527 | 0.8957 | 0.7173 | 0.7966 | **0.7881** |
| Plate | vn | 500 | 0.9835 | 0.8925 | 0.9800 | 0.9342 | 0.4493 | 0.9602 | 0.9660 | 0.9631 | **0.9800** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5892 | 0.6422 |
| Small | 16–32 | 10244 | 0.8846 | 0.8997 |
| Medium | 32–96 | 7823 | 0.9490 | 0.9556 |
| Large | > 96 | 1892 | 0.9630 | 0.9672 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9430 | 0.9495 |
| Blur | normal blur (1) | 10378 | 0.9389 | 0.9524 |
| Blur | heavy blur (2) | 23369 | 0.6328 | 0.6780 |
| Expression | typical expression (0) | 38712 | 0.7548 | 0.7864 |
| Expression | exaggerate expression (1) | 400 | 0.9350 | 0.9475 |
| Illumination | normal illumination (0) | 36832 | 0.7511 | 0.7835 |
| Illumination | extreme illumination (1) | 2280 | 0.8456 | 0.8614 |
| Occlusion | no occlusion (0) | 23428 | 0.8846 | 0.8991 |
| Occlusion | partial occlusion (1) | 7097 | 0.6569 | 0.7018 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4897 | 0.5564 |
| Pose | typical pose (0) | 37475 | 0.7587 | 0.7900 |
| Pose | atypical pose (1) | 1637 | 0.7086 | 0.7440 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6560 | 0.7001 |
| Blurry | 25–100 | 6506 | 0.9144 | 0.9268 |
| Soft | 100–400 | 4806 | 0.9557 | 0.9625 |
| Sharp | ≥ 400 | 2631 | 0.9647 | 0.9677 |

