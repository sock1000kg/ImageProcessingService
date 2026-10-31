# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-100/640px/accuracy-runs/20261031-065033-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 786 | 0.2130 | 0.9831 | 0.0738 | 0.1373 | 0.0501 | 0.7593 | 0.2328 | 0.3564 | **0.0751** |
| Plate | vn | 30 | 0.8075 | 1.0000 | 0.1667 | 0.2857 | 0.0553 | 0.8333 | 0.8333 | 0.8333 | **0.1667** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 299 | 0.0000 | 0.0000 |
| Small | 16–32 | 288 | 0.0035 | 0.0035 |
| Medium | 32–96 | 159 | 0.1635 | 0.1698 |
| Large | > 96 | 40 | 0.7750 | 0.7750 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 87 | 0.5057 | 0.5057 |
| Blur | normal blur (1) | 217 | 0.0645 | 0.0691 |
| Blur | heavy blur (2) | 482 | 0.0000 | 0.0000 |
| Expression | typical expression (0) | 777 | 0.0708 | 0.0721 |
| Expression | exaggerate expression (1) | 9 | 0.3333 | 0.3333 |
| Illumination | normal illumination (0) | 739 | 0.0785 | 0.0798 |
| Illumination | extreme illumination (1) | 47 | 0.0000 | 0.0000 |
| Occlusion | no occlusion (0) | 493 | 0.1095 | 0.1095 |
| Occlusion | partial occlusion (1) | 108 | 0.0185 | 0.0185 |
| Occlusion | heavy occlusion (2) | 185 | 0.0108 | 0.0162 |
| Pose | typical pose (0) | 753 | 0.0757 | 0.0770 |
| Pose | atypical pose (1) | 33 | 0.0303 | 0.0303 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 473 | 0.0063 | 0.0063 |
| Blurry | 25–100 | 169 | 0.0414 | 0.0414 |
| Soft | 100–400 | 83 | 0.1446 | 0.1566 |
| Sharp | ≥ 400 | 61 | 0.5902 | 0.5902 |

