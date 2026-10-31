# Detection Accuracy & Privacy Recall Report

- **Tool**: `deface`
- **Run Directory**: `results/laptop-rtx3050-max/deface/full/20261031-112249-deface-gpu`
- **Operating Threshold**: `0.2`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.6494 | 0.6433 | 0.6403 | 0.6418 | 0.3222 | 0.8513 | 0.5747 | 0.6862 | **0.7231** |
| Plate | vn | 500 | not supported | not supported | 0.0000 | not supported | - | not supported | 0.0000 | not supported | not supported |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.3730 | 0.5070 |
| Small | 16–32 | 10244 | 0.8638 | 0.9123 |
| Medium | 32–96 | 7823 | 0.9276 | 0.9475 |
| Large | > 96 | 1892 | 0.9471 | 0.9588 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9171 | 0.9374 |
| Blur | normal blur (1) | 10378 | 0.8870 | 0.9308 |
| Blur | heavy blur (2) | 23369 | 0.4672 | 0.5817 |
| Expression | typical expression (0) | 38712 | 0.6375 | 0.7210 |
| Expression | exaggerate expression (1) | 400 | 0.9100 | 0.9325 |
| Illumination | normal illumination (0) | 36832 | 0.6323 | 0.7171 |
| Illumination | extreme illumination (1) | 2280 | 0.7693 | 0.8211 |
| Occlusion | no occlusion (0) | 23428 | 0.7930 | 0.8461 |
| Occlusion | partial occlusion (1) | 7097 | 0.4813 | 0.5945 |
| Occlusion | heavy occlusion (2) | 8587 | 0.3550 | 0.4939 |
| Pose | typical pose (0) | 37475 | 0.6408 | 0.7232 |
| Pose | atypical pose (1) | 1637 | 0.6286 | 0.7221 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.4880 | 0.6029 |
| Blurry | 25–100 | 6506 | 0.8910 | 0.9256 |
| Soft | 100–400 | 4806 | 0.9313 | 0.9509 |
| Sharp | ≥ 400 | 2631 | 0.9449 | 0.9567 |

