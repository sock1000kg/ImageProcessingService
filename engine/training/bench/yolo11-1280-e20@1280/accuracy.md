# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11-1280-e20@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7127 | 0.7785 | 0.6886 | 0.7308 | 0.2102 | 0.8570 | 0.6571 | 0.7439 | **0.7204** |
| Plate | vn | 500 | 0.9796 | 0.8932 | 0.9700 | 0.9300 | 0.7782 | 0.9915 | 0.9380 | 0.9640 | **0.9700** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.4910 | 0.5424 |
| Small | 16–32 | 10244 | 0.8329 | 0.8504 |
| Medium | 32–96 | 7823 | 0.9201 | 0.9287 |
| Large | > 96 | 1892 | 0.9498 | 0.9567 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9232 | 0.9305 |
| Blur | normal blur (1) | 10378 | 0.9016 | 0.9194 |
| Blur | heavy blur (2) | 23369 | 0.5401 | 0.5838 |
| Expression | typical expression (0) | 38712 | 0.6864 | 0.7184 |
| Expression | exaggerate expression (1) | 400 | 0.9000 | 0.9125 |
| Illumination | normal illumination (0) | 36832 | 0.6816 | 0.7142 |
| Illumination | extreme illumination (1) | 2280 | 0.8013 | 0.8206 |
| Occlusion | no occlusion (0) | 23428 | 0.8379 | 0.8546 |
| Occlusion | partial occlusion (1) | 7097 | 0.5664 | 0.6115 |
| Occlusion | heavy occlusion (2) | 8587 | 0.3821 | 0.4442 |
| Pose | typical pose (0) | 37475 | 0.6922 | 0.7235 |
| Pose | atypical pose (1) | 1637 | 0.6042 | 0.6500 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.5682 | 0.6121 |
| Blurry | 25–100 | 6506 | 0.8717 | 0.8846 |
| Soft | 100–400 | 4806 | 0.9309 | 0.9395 |
| Sharp | ≥ 400 | 2631 | 0.9449 | 0.9506 |

