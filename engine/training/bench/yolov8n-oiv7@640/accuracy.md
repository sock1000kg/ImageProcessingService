# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolov8n-oiv7@640`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.2192 | 0.9418 | 0.1457 | 0.2523 | 0.0500 | 0.8106 | 0.2317 | 0.3603 | **0.1734** |
| Plate | vn | 500 | 0.7050 | 0.9187 | 0.4520 | 0.6059 | 0.0501 | 0.7649 | 0.7680 | 0.7665 | **0.4520** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.0008 | 0.0301 |
| Small | 16–32 | 10244 | 0.0546 | 0.0931 |
| Medium | 32–96 | 7823 | 0.4395 | 0.4558 |
| Large | > 96 | 1892 | 0.8906 | 0.8906 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.6183 | 0.6207 |
| Blur | normal blur (1) | 10378 | 0.1985 | 0.2156 |
| Blur | heavy blur (2) | 23369 | 0.0137 | 0.0519 |
| Expression | typical expression (0) | 38712 | 0.1426 | 0.1706 |
| Expression | exaggerate expression (1) | 400 | 0.4400 | 0.4425 |
| Illumination | normal illumination (0) | 36832 | 0.1462 | 0.1754 |
| Illumination | extreme illumination (1) | 2280 | 0.1364 | 0.1399 |
| Occlusion | no occlusion (0) | 23428 | 0.2153 | 0.2372 |
| Occlusion | partial occlusion (1) | 7097 | 0.0493 | 0.0779 |
| Occlusion | heavy occlusion (2) | 8587 | 0.0354 | 0.0780 |
| Pose | typical pose (0) | 37475 | 0.1453 | 0.1738 |
| Pose | atypical pose (1) | 1637 | 0.1546 | 0.1637 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.0179 | 0.0483 |
| Blurry | 25–100 | 6506 | 0.1743 | 0.2014 |
| Soft | 100–400 | 4806 | 0.4499 | 0.4784 |
| Sharp | ≥ 400 | 2631 | 0.7412 | 0.7434 |

