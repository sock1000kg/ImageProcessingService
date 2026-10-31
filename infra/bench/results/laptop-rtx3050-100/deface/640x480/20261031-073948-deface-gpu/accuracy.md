# Detection Accuracy & Privacy Recall Report

- **Tool**: `deface`
- **Run Directory**: `results/laptop-rtx3050-100/deface/640x480/20261031-073948-deface-gpu`
- **Operating Threshold**: `0.2`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 786 | 0.5567 | 0.5279 | 0.5776 | 0.5516 | 0.3171 | 0.8172 | 0.5064 | 0.6253 | **0.7265** |
| Plate | vn | 30 | not supported | not supported | 0.0000 | not supported | - | not supported | 0.0000 | not supported | not supported |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 299 | 0.1906 | 0.4247 |
| Small | 16–32 | 288 | 0.7604 | 0.9062 |
| Medium | 32–96 | 159 | 0.8679 | 0.8994 |
| Large | > 96 | 40 | 1.0000 | 1.0000 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 87 | 0.9540 | 0.9655 |
| Blur | normal blur (1) | 217 | 0.7696 | 0.9032 |
| Blur | heavy blur (2) | 482 | 0.4232 | 0.6037 |
| Expression | typical expression (0) | 777 | 0.5753 | 0.7246 |
| Expression | exaggerate expression (1) | 9 | 0.7778 | 0.8889 |
| Illumination | normal illumination (0) | 739 | 0.5765 | 0.7253 |
| Illumination | extreme illumination (1) | 47 | 0.5957 | 0.7447 |
| Occlusion | no occlusion (0) | 493 | 0.7465 | 0.8621 |
| Occlusion | partial occlusion (1) | 108 | 0.3056 | 0.5000 |
| Occlusion | heavy occlusion (2) | 185 | 0.2865 | 0.4973 |
| Pose | typical pose (0) | 753 | 0.5790 | 0.7238 |
| Pose | atypical pose (1) | 33 | 0.5455 | 0.7879 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 473 | 0.3827 | 0.5877 |
| Blurry | 25–100 | 169 | 0.8107 | 0.9172 |
| Soft | 100–400 | 83 | 0.9277 | 0.9518 |
| Sharp | ≥ 400 | 61 | 0.9672 | 0.9672 |

