# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolov8n-oiv7@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.3689 | 0.9228 | 0.2752 | 0.4240 | 0.0500 | 0.7938 | 0.3914 | 0.5243 | **0.2846** |
| Plate | vn | 500 | 0.6971 | 0.8428 | 0.5360 | 0.6553 | 0.0565 | 0.7411 | 0.7900 | 0.7648 | **0.5460** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.0127 | 0.0205 |
| Small | 16–32 | 10244 | 0.2794 | 0.2928 |
| Medium | 32–96 | 7823 | 0.7550 | 0.7644 |
| Large | > 96 | 1892 | 0.9265 | 0.9297 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.8004 | 0.8043 |
| Blur | normal blur (1) | 10378 | 0.4800 | 0.4907 |
| Blur | heavy blur (2) | 23369 | 0.0638 | 0.0737 |
| Expression | typical expression (0) | 38712 | 0.2711 | 0.2804 |
| Expression | exaggerate expression (1) | 400 | 0.6800 | 0.6900 |
| Illumination | normal illumination (0) | 36832 | 0.2747 | 0.2842 |
| Illumination | extreme illumination (1) | 2280 | 0.2842 | 0.2912 |
| Occlusion | no occlusion (0) | 23428 | 0.3937 | 0.3977 |
| Occlusion | partial occlusion (1) | 7097 | 0.1165 | 0.1271 |
| Occlusion | heavy occlusion (2) | 8587 | 0.0833 | 0.1060 |
| Pose | typical pose (0) | 37475 | 0.2752 | 0.2844 |
| Pose | atypical pose (1) | 1637 | 0.2767 | 0.2883 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.0757 | 0.0850 |
| Blurry | 25–100 | 6506 | 0.4676 | 0.4814 |
| Soft | 100–400 | 4806 | 0.7326 | 0.7412 |
| Sharp | ≥ 400 | 2631 | 0.8727 | 0.8727 |

