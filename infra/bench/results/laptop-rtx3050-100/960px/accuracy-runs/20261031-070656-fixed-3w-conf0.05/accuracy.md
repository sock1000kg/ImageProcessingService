# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-100/960px/accuracy-runs/20261031-070656-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 786 | 0.3094 | 0.9744 | 0.0967 | 0.1759 | 0.0516 | 0.8296 | 0.3282 | 0.4704 | **0.0980** |
| Plate | vn | 30 | 0.8122 | 1.0000 | 0.1667 | 0.2857 | 0.0689 | 0.9259 | 0.8333 | 0.8772 | **0.1667** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 299 | 0.0000 | 0.0000 |
| Small | 16–32 | 288 | 0.0069 | 0.0069 |
| Medium | 32–96 | 159 | 0.2390 | 0.2453 |
| Large | > 96 | 40 | 0.9000 | 0.9000 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 87 | 0.6207 | 0.6207 |
| Blur | normal blur (1) | 217 | 0.0876 | 0.0922 |
| Blur | heavy blur (2) | 482 | 0.0062 | 0.0062 |
| Expression | typical expression (0) | 777 | 0.0940 | 0.0952 |
| Expression | exaggerate expression (1) | 9 | 0.3333 | 0.3333 |
| Illumination | normal illumination (0) | 739 | 0.1015 | 0.1028 |
| Illumination | extreme illumination (1) | 47 | 0.0213 | 0.0213 |
| Occlusion | no occlusion (0) | 493 | 0.1400 | 0.1400 |
| Occlusion | partial occlusion (1) | 108 | 0.0185 | 0.0185 |
| Occlusion | heavy occlusion (2) | 185 | 0.0270 | 0.0324 |
| Pose | typical pose (0) | 753 | 0.0983 | 0.0996 |
| Pose | atypical pose (1) | 33 | 0.0606 | 0.0606 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 473 | 0.0085 | 0.0085 |
| Blurry | 25–100 | 169 | 0.0533 | 0.0533 |
| Soft | 100–400 | 83 | 0.2048 | 0.2169 |
| Sharp | ≥ 400 | 61 | 0.7541 | 0.7541 |

