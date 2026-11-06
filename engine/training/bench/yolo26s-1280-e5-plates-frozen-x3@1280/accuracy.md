# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo26s-1280-e5-plates-frozen-x3@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7730 | 0.8201 | 0.7502 | 0.7836 | 0.2327 | 0.8975 | 0.7154 | 0.7961 | **0.7802** |
| Plate | vn | 500 | 0.9775 | 0.9283 | 0.9580 | 0.9429 | 0.6226 | 0.9750 | 0.9360 | 0.9551 | **0.9580** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5803 | 0.6303 |
| Small | 16–32 | 10244 | 0.8798 | 0.8954 |
| Medium | 32–96 | 7823 | 0.9449 | 0.9514 |
| Large | > 96 | 1892 | 0.9625 | 0.9656 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9432 | 0.9482 |
| Blur | normal blur (1) | 10378 | 0.9359 | 0.9495 |
| Blur | heavy blur (2) | 23369 | 0.6233 | 0.6664 |
| Expression | typical expression (0) | 38712 | 0.7483 | 0.7785 |
| Expression | exaggerate expression (1) | 400 | 0.9300 | 0.9425 |
| Illumination | normal illumination (0) | 36832 | 0.7444 | 0.7753 |
| Illumination | extreme illumination (1) | 2280 | 0.8425 | 0.8588 |
| Occlusion | no occlusion (0) | 23428 | 0.8809 | 0.8947 |
| Occlusion | partial occlusion (1) | 7097 | 0.6496 | 0.6921 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4767 | 0.5405 |
| Pose | typical pose (0) | 37475 | 0.7526 | 0.7823 |
| Pose | atypical pose (1) | 1637 | 0.6952 | 0.7318 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6477 | 0.6897 |
| Blurry | 25–100 | 6506 | 0.9107 | 0.9228 |
| Soft | 100–400 | 4806 | 0.9530 | 0.9596 |
| Sharp | ≥ 400 | 2631 | 0.9624 | 0.9654 |

