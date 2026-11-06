# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11-1280-e5-crowd-os2@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7172 | 0.7746 | 0.6956 | 0.7330 | 0.2400 | 0.8772 | 0.6524 | 0.7483 | **0.7311** |
| Plate | vn | 500 | 0.9853 | 0.9057 | 0.9800 | 0.9414 | 0.4091 | 0.9490 | 0.9680 | 0.9584 | **0.9800** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.4953 | 0.5533 |
| Small | 16–32 | 10244 | 0.8449 | 0.8652 |
| Medium | 32–96 | 7823 | 0.9283 | 0.9360 |
| Large | > 96 | 1892 | 0.9530 | 0.9572 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9279 | 0.9335 |
| Blur | normal blur (1) | 10378 | 0.9084 | 0.9269 |
| Blur | heavy blur (2) | 23369 | 0.5478 | 0.5976 |
| Expression | typical expression (0) | 38712 | 0.6934 | 0.7291 |
| Expression | exaggerate expression (1) | 400 | 0.9075 | 0.9225 |
| Illumination | normal illumination (0) | 36832 | 0.6887 | 0.7253 |
| Illumination | extreme illumination (1) | 2280 | 0.8066 | 0.8241 |
| Occlusion | no occlusion (0) | 23428 | 0.8432 | 0.8626 |
| Occlusion | partial occlusion (1) | 7097 | 0.5719 | 0.6248 |
| Occlusion | heavy occlusion (2) | 8587 | 0.3950 | 0.4601 |
| Pose | typical pose (0) | 37475 | 0.6987 | 0.7338 |
| Pose | atypical pose (1) | 1637 | 0.6255 | 0.6671 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.5744 | 0.6241 |
| Blurry | 25–100 | 6506 | 0.8832 | 0.8972 |
| Soft | 100–400 | 4806 | 0.9370 | 0.9451 |
| Sharp | ≥ 400 | 2631 | 0.9498 | 0.9529 |

