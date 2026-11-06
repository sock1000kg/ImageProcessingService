# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo26s-1280-e20-crowd@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7722 | 0.7993 | 0.7543 | 0.7762 | 0.2606 | 0.9000 | 0.7104 | 0.7941 | **0.7856** |
| Plate | vn | 500 | 0.9634 | 0.9212 | 0.9580 | 0.9392 | 0.6834 | 0.9829 | 0.9180 | 0.9493 | **0.9580** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5867 | 0.6391 |
| Small | 16–32 | 10244 | 0.8809 | 0.8955 |
| Medium | 32–96 | 7823 | 0.9478 | 0.9558 |
| Large | > 96 | 1892 | 0.9662 | 0.9709 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9422 | 0.9491 |
| Blur | normal blur (1) | 10378 | 0.9373 | 0.9514 |
| Blur | heavy blur (2) | 23369 | 0.6300 | 0.6744 |
| Expression | typical expression (0) | 38712 | 0.7525 | 0.7840 |
| Expression | exaggerate expression (1) | 400 | 0.9350 | 0.9450 |
| Illumination | normal illumination (0) | 36832 | 0.7488 | 0.7810 |
| Illumination | extreme illumination (1) | 2280 | 0.8434 | 0.8605 |
| Occlusion | no occlusion (0) | 23428 | 0.8832 | 0.8975 |
| Occlusion | partial occlusion (1) | 7097 | 0.6548 | 0.7004 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4850 | 0.5507 |
| Pose | typical pose (0) | 37475 | 0.7566 | 0.7875 |
| Pose | atypical pose (1) | 1637 | 0.7031 | 0.7434 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6529 | 0.6965 |
| Blurry | 25–100 | 6506 | 0.9128 | 0.9250 |
| Soft | 100–400 | 4806 | 0.9551 | 0.9623 |
| Sharp | ≥ 400 | 2631 | 0.9658 | 0.9704 |

