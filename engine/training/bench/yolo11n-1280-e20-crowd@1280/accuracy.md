# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11n-1280-e20-crowd@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7413 | 0.7293 | 0.7331 | 0.7312 | 0.2905 | 0.8897 | 0.6712 | 0.7651 | **0.7667** |
| Plate | vn | 500 | 0.9692 | 0.9237 | 0.9680 | 0.9453 | 0.6325 | 0.9792 | 0.9400 | 0.9592 | **0.9680** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5654 | 0.6214 |
| Small | 16–32 | 10244 | 0.8564 | 0.8735 |
| Medium | 32–96 | 7823 | 0.9292 | 0.9366 |
| Large | > 96 | 1892 | 0.9524 | 0.9572 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9308 | 0.9376 |
| Blur | normal blur (1) | 10378 | 0.9178 | 0.9328 |
| Blur | heavy blur (2) | 23369 | 0.6057 | 0.6537 |
| Expression | typical expression (0) | 38712 | 0.7311 | 0.7650 |
| Expression | exaggerate expression (1) | 400 | 0.9250 | 0.9350 |
| Illumination | normal illumination (0) | 36832 | 0.7277 | 0.7624 |
| Illumination | extreme illumination (1) | 2280 | 0.8211 | 0.8368 |
| Occlusion | no occlusion (0) | 23428 | 0.8662 | 0.8829 |
| Occlusion | partial occlusion (1) | 7097 | 0.6334 | 0.6790 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4524 | 0.5221 |
| Pose | typical pose (0) | 37475 | 0.7375 | 0.7710 |
| Pose | atypical pose (1) | 1637 | 0.6329 | 0.6689 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6303 | 0.6769 |
| Blurry | 25–100 | 6506 | 0.8933 | 0.9078 |
| Soft | 100–400 | 4806 | 0.9363 | 0.9447 |
| Sharp | ≥ 400 | 2631 | 0.9494 | 0.9521 |

