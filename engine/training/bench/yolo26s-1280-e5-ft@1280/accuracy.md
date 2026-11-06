# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo26s-1280-e5-ft@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7756 | 0.7909 | 0.7609 | 0.7756 | 0.2659 | 0.8954 | 0.7176 | 0.7967 | **0.7913** |
| Plate | vn | 500 | 0.9483 | 0.9404 | 0.9460 | 0.9432 | 0.4951 | 0.9749 | 0.9340 | 0.9540 | **0.9460** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5963 | 0.6477 |
| Small | 16–32 | 10244 | 0.8873 | 0.9023 |
| Medium | 32–96 | 7823 | 0.9481 | 0.9541 |
| Large | > 96 | 1892 | 0.9693 | 0.9715 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9446 | 0.9508 |
| Blur | normal blur (1) | 10378 | 0.9406 | 0.9529 |
| Blur | heavy blur (2) | 23369 | 0.6389 | 0.6830 |
| Expression | typical expression (0) | 38712 | 0.7590 | 0.7897 |
| Expression | exaggerate expression (1) | 400 | 0.9400 | 0.9475 |
| Illumination | normal illumination (0) | 36832 | 0.7554 | 0.7865 |
| Illumination | extreme illumination (1) | 2280 | 0.8496 | 0.8689 |
| Occlusion | no occlusion (0) | 23428 | 0.8871 | 0.9007 |
| Occlusion | partial occlusion (1) | 7097 | 0.6651 | 0.7083 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4959 | 0.5615 |
| Pose | typical pose (0) | 37475 | 0.7627 | 0.7928 |
| Pose | atypical pose (1) | 1637 | 0.7196 | 0.7581 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6620 | 0.7049 |
| Blurry | 25–100 | 6506 | 0.9158 | 0.9276 |
| Soft | 100–400 | 4806 | 0.9559 | 0.9613 |
| Sharp | ≥ 400 | 2631 | 0.9681 | 0.9711 |

