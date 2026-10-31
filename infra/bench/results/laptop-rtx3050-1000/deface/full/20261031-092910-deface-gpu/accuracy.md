# Detection Accuracy & Privacy Recall Report

- **Tool**: `deface`
- **Run Directory**: `results/laptop-rtx3050-1000/deface/full/20261031-092910-deface-gpu`
- **Operating Threshold**: `0.2`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 8079 | 0.6486 | 0.6400 | 0.6435 | 0.6417 | 0.3314 | 0.8624 | 0.5811 | 0.6944 | **0.7230** |
| Plate | vn | 300 | not supported | not supported | 0.0000 | not supported | - | not supported | 0.0000 | not supported | not supported |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 3727 | 0.3453 | 0.4805 |
| Small | 16–32 | 2367 | 0.8623 | 0.9104 |
| Medium | 32–96 | 1632 | 0.9461 | 0.9559 |
| Large | > 96 | 353 | 0.9263 | 0.9490 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 1050 | 0.9095 | 0.9362 |
| Blur | normal blur (1) | 2219 | 0.8968 | 0.9324 |
| Blur | heavy blur (2) | 4810 | 0.4686 | 0.5798 |
| Expression | typical expression (0) | 8001 | 0.6409 | 0.7208 |
| Expression | exaggerate expression (1) | 78 | 0.9103 | 0.9487 |
| Illumination | normal illumination (0) | 7668 | 0.6372 | 0.7170 |
| Illumination | extreme illumination (1) | 411 | 0.7616 | 0.8345 |
| Occlusion | no occlusion (0) | 4980 | 0.7857 | 0.8343 |
| Occlusion | partial occlusion (1) | 1433 | 0.4878 | 0.6092 |
| Occlusion | heavy occlusion (2) | 1666 | 0.3523 | 0.4880 |
| Pose | typical pose (0) | 7757 | 0.6442 | 0.7224 |
| Pose | atypical pose (1) | 322 | 0.6273 | 0.7360 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 5138 | 0.4846 | 0.5960 |
| Blurry | 25–100 | 1439 | 0.9041 | 0.9333 |
| Soft | 100–400 | 1036 | 0.9373 | 0.9556 |
| Sharp | ≥ 400 | 466 | 0.9378 | 0.9571 |

