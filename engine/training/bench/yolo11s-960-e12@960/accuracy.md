# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11s-960-e12@960`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7159 | 0.7748 | 0.6988 | 0.7349 | 0.2373 | 0.8709 | 0.6570 | 0.7490 | **0.7384** |
| Plate | vn | 500 | 0.9659 | 0.9203 | 0.9700 | 0.9445 | 0.4223 | 0.9717 | 0.9600 | 0.9658 | **0.9700** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5003 | 0.5684 |
| Small | 16–32 | 10244 | 0.8479 | 0.8661 |
| Medium | 32–96 | 7823 | 0.9271 | 0.9347 |
| Large | > 96 | 1892 | 0.9567 | 0.9572 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9281 | 0.9333 |
| Blur | normal blur (1) | 10378 | 0.9068 | 0.9242 |
| Blur | heavy blur (2) | 23369 | 0.5538 | 0.6112 |
| Expression | typical expression (0) | 38712 | 0.6967 | 0.7366 |
| Expression | exaggerate expression (1) | 400 | 0.9075 | 0.9150 |
| Illumination | normal illumination (0) | 36832 | 0.6926 | 0.7337 |
| Illumination | extreme illumination (1) | 2280 | 0.7987 | 0.8149 |
| Occlusion | no occlusion (0) | 23428 | 0.8453 | 0.8677 |
| Occlusion | partial occlusion (1) | 7097 | 0.5745 | 0.6303 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4019 | 0.4750 |
| Pose | typical pose (0) | 37475 | 0.7025 | 0.7420 |
| Pose | atypical pose (1) | 1637 | 0.6139 | 0.6573 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.5800 | 0.6364 |
| Blurry | 25–100 | 6506 | 0.8818 | 0.8952 |
| Soft | 100–400 | 4806 | 0.9347 | 0.9430 |
| Sharp | ≥ 400 | 2631 | 0.9517 | 0.9532 |

