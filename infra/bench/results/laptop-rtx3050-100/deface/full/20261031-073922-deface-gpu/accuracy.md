# Detection Accuracy & Privacy Recall Report

- **Tool**: `deface`
- **Run Directory**: `results/laptop-rtx3050-100/deface/full/20261031-073922-deface-gpu`
- **Operating Threshold**: `0.2`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 786 | 0.7122 | 0.6117 | 0.7176 | 0.6604 | 0.3480 | 0.8662 | 0.6425 | 0.7378 | **0.8232** |
| Plate | vn | 30 | not supported | not supported | 0.0000 | not supported | - | not supported | 0.0000 | not supported | not supported |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 299 | 0.4114 | 0.6355 |
| Small | 16–32 | 288 | 0.8889 | 0.9410 |
| Medium | 32–96 | 159 | 0.9119 | 0.9245 |
| Large | > 96 | 40 | 1.0000 | 0.9750 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 87 | 0.9540 | 0.9540 |
| Blur | normal blur (1) | 217 | 0.9078 | 0.9217 |
| Blur | heavy blur (2) | 482 | 0.5892 | 0.7552 |
| Expression | typical expression (0) | 777 | 0.7156 | 0.8224 |
| Expression | exaggerate expression (1) | 9 | 0.8889 | 0.8889 |
| Illumination | normal illumination (0) | 739 | 0.7131 | 0.8227 |
| Illumination | extreme illumination (1) | 47 | 0.7872 | 0.8298 |
| Occlusion | no occlusion (0) | 493 | 0.8702 | 0.9229 |
| Occlusion | partial occlusion (1) | 108 | 0.5833 | 0.7407 |
| Occlusion | heavy occlusion (2) | 185 | 0.3892 | 0.6054 |
| Pose | typical pose (0) | 753 | 0.7238 | 0.8274 |
| Pose | atypical pose (1) | 33 | 0.5758 | 0.7273 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 473 | 0.5772 | 0.7421 |
| Blurry | 25–100 | 169 | 0.9053 | 0.9290 |
| Soft | 100–400 | 83 | 0.9398 | 0.9518 |
| Sharp | ≥ 400 | 61 | 0.9836 | 0.9836 |

