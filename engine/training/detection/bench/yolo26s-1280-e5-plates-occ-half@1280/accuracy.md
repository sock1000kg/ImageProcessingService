# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `engine/training/detection/bench/yolo26s-1280-e5-plates-occ-half@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7774 | 0.7807 | 0.7637 | 0.7721 | 0.2660 | 0.8917 | 0.7201 | 0.7967 | **0.7977** |
| Plate | vn | 500 | 0.9859 | 0.8845 | 0.9800 | 0.9298 | 0.5317 | 0.9659 | 0.9640 | 0.9650 | **0.9800** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.6007 | 0.6580 |
| Small | 16–32 | 10244 | 0.8889 | 0.9043 |
| Medium | 32–96 | 7823 | 0.9504 | 0.9579 |
| Large | > 96 | 1892 | 0.9646 | 0.9720 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9454 | 0.9521 |
| Blur | normal blur (1) | 10378 | 0.9415 | 0.9556 |
| Blur | heavy blur (2) | 23369 | 0.6431 | 0.6921 |
| Expression | typical expression (0) | 38712 | 0.7620 | 0.7962 |
| Expression | exaggerate expression (1) | 400 | 0.9275 | 0.9400 |
| Illumination | normal illumination (0) | 36832 | 0.7581 | 0.7933 |
| Illumination | extreme illumination (1) | 2280 | 0.8539 | 0.8693 |
| Occlusion | no occlusion (0) | 23428 | 0.8877 | 0.9034 |
| Occlusion | partial occlusion (1) | 7097 | 0.6704 | 0.7182 |
| Occlusion | heavy occlusion (2) | 8587 | 0.5025 | 0.5751 |
| Pose | typical pose (0) | 37475 | 0.7656 | 0.7991 |
| Pose | atypical pose (1) | 1637 | 0.7208 | 0.7648 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6656 | 0.7131 |
| Blurry | 25–100 | 6506 | 0.9179 | 0.9305 |
| Soft | 100–400 | 4806 | 0.9588 | 0.9663 |
| Sharp | ≥ 400 | 2631 | 0.9650 | 0.9704 |

