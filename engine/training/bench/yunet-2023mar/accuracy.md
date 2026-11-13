# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yunet-2023mar`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.6510 | 0.2902 | 0.7047 | 0.4112 | 0.5655 | 0.8383 | 0.5850 | 0.6891 | **0.8659** |
| Plate | vn | 500 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.1500 | 0.0000 | 0.0000 | 0.0000 | **0.0000** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5152 | 0.7855 |
| Small | 16–32 | 10244 | 0.8522 | 0.9302 |
| Medium | 32–96 | 7823 | 0.9182 | 0.9533 |
| Large | > 96 | 1892 | 0.9429 | 0.9709 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9197 | 0.9527 |
| Blur | normal blur (1) | 10378 | 0.8860 | 0.9524 |
| Blur | heavy blur (2) | 23369 | 0.5749 | 0.8077 |
| Expression | typical expression (0) | 38712 | 0.7026 | 0.8651 |
| Expression | exaggerate expression (1) | 400 | 0.9100 | 0.9500 |
| Illumination | normal illumination (0) | 36832 | 0.6982 | 0.8643 |
| Illumination | extreme illumination (1) | 2280 | 0.8101 | 0.8925 |
| Occlusion | no occlusion (0) | 23428 | 0.8401 | 0.9320 |
| Occlusion | partial occlusion (1) | 7097 | 0.5976 | 0.8282 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4240 | 0.7169 |
| Pose | typical pose (0) | 37475 | 0.7101 | 0.8690 |
| Pose | atypical pose (1) | 1637 | 0.5822 | 0.7972 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.5943 | 0.8204 |
| Blurry | 25–100 | 6506 | 0.8769 | 0.9371 |
| Soft | 100–400 | 4806 | 0.9218 | 0.9548 |
| Sharp | ≥ 400 | 2631 | 0.9396 | 0.9635 |

