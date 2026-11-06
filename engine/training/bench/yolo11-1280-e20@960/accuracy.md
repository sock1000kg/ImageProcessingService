# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11-1280-e20@960`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.6505 | 0.7632 | 0.6242 | 0.6867 | 0.2120 | 0.8480 | 0.5891 | 0.6952 | **0.6610** |
| Plate | vn | 500 | 0.9835 | 0.9192 | 0.9780 | 0.9477 | 0.4472 | 0.9778 | 0.9700 | 0.9739 | **0.9780** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.3789 | 0.4377 |
| Small | 16–32 | 10244 | 0.7976 | 0.8210 |
| Medium | 32–96 | 7823 | 0.9161 | 0.9248 |
| Large | > 96 | 1892 | 0.9604 | 0.9641 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9143 | 0.9215 |
| Blur | normal blur (1) | 10378 | 0.8651 | 0.8874 |
| Blur | heavy blur (2) | 23369 | 0.4506 | 0.5006 |
| Expression | typical expression (0) | 38712 | 0.6214 | 0.6585 |
| Expression | exaggerate expression (1) | 400 | 0.8875 | 0.8975 |
| Illumination | normal illumination (0) | 36832 | 0.6160 | 0.6537 |
| Illumination | extreme illumination (1) | 2280 | 0.7553 | 0.7789 |
| Occlusion | no occlusion (0) | 23428 | 0.7869 | 0.8101 |
| Occlusion | partial occlusion (1) | 7097 | 0.4757 | 0.5263 |
| Occlusion | heavy occlusion (2) | 8587 | 0.3028 | 0.3656 |
| Pose | typical pose (0) | 37475 | 0.6269 | 0.6634 |
| Pose | atypical pose (1) | 1637 | 0.5608 | 0.6060 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.4761 | 0.5272 |
| Blurry | 25–100 | 6506 | 0.8480 | 0.8638 |
| Soft | 100–400 | 4806 | 0.9216 | 0.9284 |
| Sharp | ≥ 400 | 2631 | 0.9437 | 0.9502 |

