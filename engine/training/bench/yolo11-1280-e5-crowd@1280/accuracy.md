# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11-1280-e5-crowd@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7194 | 0.7583 | 0.7024 | 0.7292 | 0.2391 | 0.8699 | 0.6570 | 0.7486 | **0.7367** |
| Plate | vn | 500 | 0.9876 | 0.8962 | 0.9840 | 0.9380 | 0.6015 | 0.9719 | 0.9700 | 0.9710 | **0.9840** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5117 | 0.5681 |
| Small | 16–32 | 10244 | 0.8426 | 0.8615 |
| Medium | 32–96 | 7823 | 0.9253 | 0.9326 |
| Large | > 96 | 1892 | 0.9508 | 0.9572 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9254 | 0.9325 |
| Blur | normal blur (1) | 10378 | 0.9080 | 0.9263 |
| Blur | heavy blur (2) | 23369 | 0.5598 | 0.6075 |
| Expression | typical expression (0) | 38712 | 0.7003 | 0.7348 |
| Expression | exaggerate expression (1) | 400 | 0.9050 | 0.9150 |
| Illumination | normal illumination (0) | 36832 | 0.6959 | 0.7312 |
| Illumination | extreme illumination (1) | 2280 | 0.8075 | 0.8250 |
| Occlusion | no occlusion (0) | 23428 | 0.8474 | 0.8653 |
| Occlusion | partial occlusion (1) | 7097 | 0.5839 | 0.6310 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4047 | 0.4730 |
| Pose | typical pose (0) | 37475 | 0.7061 | 0.7403 |
| Pose | atypical pose (1) | 1637 | 0.6176 | 0.6536 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.5863 | 0.6339 |
| Blurry | 25–100 | 6506 | 0.8818 | 0.8953 |
| Soft | 100–400 | 4806 | 0.9342 | 0.9426 |
| Sharp | ≥ 400 | 2631 | 0.9456 | 0.9510 |

