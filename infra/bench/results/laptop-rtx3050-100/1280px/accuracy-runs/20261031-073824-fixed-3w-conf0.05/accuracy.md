# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-100/1280px/accuracy-runs/20261031-073824-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 786 | 0.4170 | 0.9528 | 0.1285 | 0.2265 | 0.0506 | 0.7947 | 0.4580 | 0.5811 | **0.1310** |
| Plate | vn | 30 | 0.8798 | 1.0000 | 0.2000 | 0.3333 | 0.0618 | 0.9310 | 0.9000 | 0.9153 | **0.2000** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 299 | 0.0000 | 0.0000 |
| Small | 16–32 | 288 | 0.0312 | 0.0312 |
| Medium | 32–96 | 159 | 0.3585 | 0.3711 |
| Large | > 96 | 40 | 0.8750 | 0.8750 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 87 | 0.7241 | 0.7241 |
| Blur | normal blur (1) | 217 | 0.1567 | 0.1659 |
| Blur | heavy blur (2) | 482 | 0.0083 | 0.0083 |
| Expression | typical expression (0) | 777 | 0.1261 | 0.1287 |
| Expression | exaggerate expression (1) | 9 | 0.3333 | 0.3333 |
| Illumination | normal illumination (0) | 739 | 0.1340 | 0.1367 |
| Illumination | extreme illumination (1) | 47 | 0.0426 | 0.0426 |
| Occlusion | no occlusion (0) | 493 | 0.1866 | 0.1886 |
| Occlusion | partial occlusion (1) | 108 | 0.0278 | 0.0278 |
| Occlusion | heavy occlusion (2) | 185 | 0.0324 | 0.0378 |
| Pose | typical pose (0) | 753 | 0.1288 | 0.1301 |
| Pose | atypical pose (1) | 33 | 0.1212 | 0.1515 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 473 | 0.0106 | 0.0106 |
| Blurry | 25–100 | 169 | 0.1006 | 0.1006 |
| Soft | 100–400 | 83 | 0.3614 | 0.3855 |
| Sharp | ≥ 400 | 61 | 0.8033 | 0.8033 |

