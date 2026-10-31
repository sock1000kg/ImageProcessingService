# Detection Accuracy & Privacy Recall Report

- **Tool**: `deface`
- **Run Directory**: `results/laptop-rtx3050-1000/deface/640x480/20261031-093226-deface-gpu`
- **Operating Threshold**: `0.2`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 8079 | 0.4755 | 0.6209 | 0.4694 | 0.5346 | 0.3221 | 0.8569 | 0.4285 | 0.5713 | **0.5420** |
| Plate | vn | 300 | not supported | not supported | 0.0000 | not supported | - | not supported | 0.0000 | not supported | not supported |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 3727 | 0.0969 | 0.1937 |
| Small | 16–32 | 2367 | 0.6806 | 0.7600 |
| Medium | 32–96 | 1632 | 0.9167 | 0.9387 |
| Large | > 96 | 353 | 0.9178 | 0.9235 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 1050 | 0.8410 | 0.8629 |
| Blur | normal blur (1) | 2219 | 0.7986 | 0.8616 |
| Blur | heavy blur (2) | 4810 | 0.2364 | 0.3245 |
| Expression | typical expression (0) | 8001 | 0.4661 | 0.5391 |
| Expression | exaggerate expression (1) | 78 | 0.8077 | 0.8462 |
| Illumination | normal illumination (0) | 7668 | 0.4675 | 0.5395 |
| Illumination | extreme illumination (1) | 411 | 0.5036 | 0.5888 |
| Occlusion | no occlusion (0) | 4980 | 0.6127 | 0.6691 |
| Occlusion | partial occlusion (1) | 1433 | 0.2749 | 0.3608 |
| Occlusion | heavy occlusion (2) | 1666 | 0.2083 | 0.3181 |
| Pose | typical pose (0) | 7757 | 0.4686 | 0.5387 |
| Pose | atypical pose (1) | 322 | 0.4876 | 0.6211 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 5138 | 0.2363 | 0.3274 |
| Blurry | 25–100 | 1439 | 0.8277 | 0.8902 |
| Soft | 100–400 | 1036 | 0.9180 | 0.9392 |
| Sharp | ≥ 400 | 466 | 0.9356 | 0.9506 |

