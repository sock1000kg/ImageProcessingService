# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11-1280-e20-pl@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7082 | 0.7718 | 0.6850 | 0.7259 | 0.2356 | 0.8758 | 0.6407 | 0.7401 | **0.7163** |
| Plate | vn | 500 | 0.9895 | 0.9150 | 0.9900 | 0.9510 | 0.6217 | 0.9736 | 0.9600 | 0.9668 | **0.9900** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.4843 | 0.5344 |
| Small | 16–32 | 10244 | 0.8358 | 0.8538 |
| Medium | 32–96 | 7823 | 0.9154 | 0.9242 |
| Large | > 96 | 1892 | 0.9487 | 0.9540 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9200 | 0.9284 |
| Blur | normal blur (1) | 10378 | 0.8976 | 0.9145 |
| Blur | heavy blur (2) | 23369 | 0.5367 | 0.5796 |
| Expression | typical expression (0) | 38712 | 0.6828 | 0.7143 |
| Expression | exaggerate expression (1) | 400 | 0.9025 | 0.9100 |
| Illumination | normal illumination (0) | 36832 | 0.6779 | 0.7099 |
| Illumination | extreme illumination (1) | 2280 | 0.8000 | 0.8197 |
| Occlusion | no occlusion (0) | 23428 | 0.8344 | 0.8518 |
| Occlusion | partial occlusion (1) | 7097 | 0.5597 | 0.6012 |
| Occlusion | heavy occlusion (2) | 8587 | 0.3812 | 0.4418 |
| Pose | typical pose (0) | 37475 | 0.6888 | 0.7196 |
| Pose | atypical pose (1) | 1637 | 0.5987 | 0.6402 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.5643 | 0.6071 |
| Blurry | 25–100 | 6506 | 0.8712 | 0.8858 |
| Soft | 100–400 | 4806 | 0.9230 | 0.9309 |
| Sharp | ≥ 400 | 2631 | 0.9453 | 0.9494 |

