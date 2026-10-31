# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `results/laptop-rtx3050-1000/1280px/accuracy-runs/20261031-092722-fixed-3w-conf0.05`
- **Operating Threshold**: `0.35`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 8079 | 0.3799 | 0.9702 | 0.1571 | 0.2704 | 0.0508 | 0.8059 | 0.4009 | 0.5355 | **0.1588** |
| Plate | vn | 300 | 0.6688 | 0.8734 | 0.2300 | 0.3641 | 0.0585 | 0.7358 | 0.7800 | 0.7573 | **0.2433** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 3727 | 0.0008 | 0.0013 |
| Small | 16–32 | 2367 | 0.0900 | 0.0913 |
| Medium | 32–96 | 1632 | 0.4645 | 0.4706 |
| Large | > 96 | 353 | 0.8357 | 0.8329 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 1050 | 0.6410 | 0.6429 |
| Blur | normal blur (1) | 2219 | 0.2276 | 0.2321 |
| Blur | heavy blur (2) | 4810 | 0.0189 | 0.0193 |
| Expression | typical expression (0) | 8001 | 0.1549 | 0.1566 |
| Expression | exaggerate expression (1) | 78 | 0.3846 | 0.3846 |
| Illumination | normal illumination (0) | 7668 | 0.1583 | 0.1601 |
| Illumination | extreme illumination (1) | 411 | 0.1338 | 0.1338 |
| Occlusion | no occlusion (0) | 4980 | 0.2337 | 0.2347 |
| Occlusion | partial occlusion (1) | 1433 | 0.0419 | 0.0433 |
| Occlusion | heavy occlusion (2) | 1666 | 0.0270 | 0.0312 |
| Pose | typical pose (0) | 7757 | 0.1605 | 0.1620 |
| Pose | atypical pose (1) | 322 | 0.0745 | 0.0807 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 5138 | 0.0212 | 0.0218 |
| Blurry | 25–100 | 1439 | 0.2293 | 0.2342 |
| Soft | 100–400 | 1036 | 0.4739 | 0.4788 |
| Sharp | ≥ 400 | 466 | 0.7275 | 0.7253 |

