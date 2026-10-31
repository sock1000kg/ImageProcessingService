# Detection Accuracy & Privacy Recall Report

- **Tool**: `deface`
- **Run Directory**: `results/laptop-rtx3050-max/deface/640x480/20261031-113700-deface-gpu`
- **Operating Threshold**: `0.2`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.4708 | 0.6150 | 0.4650 | 0.5295 | 0.2973 | 0.8209 | 0.4283 | 0.5629 | **0.5474** |
| Plate | vn | 500 | not supported | not supported | 0.0000 | not supported | - | not supported | 0.0000 | not supported | not supported |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.1115 | 0.2168 |
| Small | 16–32 | 10244 | 0.7136 | 0.8053 |
| Medium | 32–96 | 7823 | 0.8924 | 0.9241 |
| Large | > 96 | 1892 | 0.9302 | 0.9408 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.8781 | 0.8975 |
| Blur | normal blur (1) | 10378 | 0.7661 | 0.8465 |
| Blur | heavy blur (2) | 23369 | 0.2364 | 0.3342 |
| Expression | typical expression (0) | 38712 | 0.4609 | 0.5438 |
| Expression | exaggerate expression (1) | 400 | 0.8550 | 0.8950 |
| Illumination | normal illumination (0) | 36832 | 0.4578 | 0.5410 |
| Illumination | extreme illumination (1) | 2280 | 0.5807 | 0.6513 |
| Occlusion | no occlusion (0) | 23428 | 0.6177 | 0.6824 |
| Occlusion | partial occlusion (1) | 7097 | 0.2667 | 0.3656 |
| Occlusion | heavy occlusion (2) | 8587 | 0.2121 | 0.3292 |
| Pose | typical pose (0) | 37475 | 0.4639 | 0.5447 |
| Pose | atypical pose (1) | 1637 | 0.4893 | 0.6097 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.2447 | 0.3463 |
| Blurry | 25–100 | 6506 | 0.8057 | 0.8810 |
| Soft | 100–400 | 4806 | 0.9037 | 0.9313 |
| Sharp | ≥ 400 | 2631 | 0.9285 | 0.9445 |

