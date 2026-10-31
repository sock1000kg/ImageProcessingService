# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-max/1280px/accuracy-runs/20261031-111852-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.3690 | 0.9760 | 0.1572 | 0.2707 | 0.0500 | 0.7940 | 0.3914 | 0.5243 | **0.1591** |
| Plate | vn | 500 | 0.6920 | 0.9028 | 0.2600 | 0.4037 | 0.0585 | 0.7429 | 0.7860 | 0.7638 | **0.2680** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.0006 | 0.0010 |
| Small | 16–32 | 10244 | 0.0731 | 0.0751 |
| Medium | 32–96 | 7823 | 0.4778 | 0.4836 |
| Large | > 96 | 1892 | 0.8710 | 0.8726 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.6568 | 0.6593 |
| Blur | normal blur (1) | 10378 | 0.2205 | 0.2247 |
| Blur | heavy blur (2) | 23369 | 0.0143 | 0.0151 |
| Expression | typical expression (0) | 38712 | 0.1541 | 0.1560 |
| Expression | exaggerate expression (1) | 400 | 0.4575 | 0.4600 |
| Illumination | normal illumination (0) | 36832 | 0.1581 | 0.1601 |
| Illumination | extreme illumination (1) | 2280 | 0.1421 | 0.1434 |
| Occlusion | no occlusion (0) | 23428 | 0.2363 | 0.2369 |
| Occlusion | partial occlusion (1) | 7097 | 0.0475 | 0.0495 |
| Occlusion | heavy occlusion (2) | 8587 | 0.0320 | 0.0374 |
| Pose | typical pose (0) | 37475 | 0.1586 | 0.1604 |
| Pose | atypical pose (1) | 1637 | 0.1246 | 0.1289 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.0203 | 0.0213 |
| Blurry | 25–100 | 6506 | 0.2043 | 0.2087 |
| Soft | 100–400 | 4806 | 0.4886 | 0.4929 |
| Sharp | ≥ 400 | 2631 | 0.7442 | 0.7450 |

