# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-1000/640px/accuracy-runs/20261031-075855-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 8079 | 0.2251 | 0.9831 | 0.0718 | 0.1338 | 0.0500 | 0.8099 | 0.2394 | 0.3695 | **0.0727** |
| Plate | vn | 300 | 0.7015 | 0.9756 | 0.1333 | 0.2346 | 0.0501 | 0.7600 | 0.7600 | 0.7600 | **0.1367** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 3727 | 0.0000 | 0.0000 |
| Small | 16–32 | 2367 | 0.0080 | 0.0093 |
| Medium | 32–96 | 1632 | 0.1961 | 0.1991 |
| Large | > 96 | 353 | 0.6827 | 0.6799 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 1050 | 0.3971 | 0.3981 |
| Blur | normal blur (1) | 2219 | 0.0676 | 0.0694 |
| Blur | heavy blur (2) | 4810 | 0.0027 | 0.0031 |
| Expression | typical expression (0) | 8001 | 0.0711 | 0.0720 |
| Expression | exaggerate expression (1) | 78 | 0.1410 | 0.1410 |
| Illumination | normal illumination (0) | 7668 | 0.0717 | 0.0726 |
| Illumination | extreme illumination (1) | 411 | 0.0730 | 0.0730 |
| Occlusion | no occlusion (0) | 4980 | 0.1086 | 0.1090 |
| Occlusion | partial occlusion (1) | 1433 | 0.0174 | 0.0181 |
| Occlusion | heavy occlusion (2) | 1666 | 0.0084 | 0.0108 |
| Pose | typical pose (0) | 7757 | 0.0725 | 0.0734 |
| Pose | atypical pose (1) | 322 | 0.0559 | 0.0559 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 5138 | 0.0023 | 0.0027 |
| Blurry | 25–100 | 1439 | 0.0535 | 0.0556 |
| Soft | 100–400 | 1036 | 0.2568 | 0.2587 |
| Sharp | ≥ 400 | 466 | 0.4828 | 0.4828 |

