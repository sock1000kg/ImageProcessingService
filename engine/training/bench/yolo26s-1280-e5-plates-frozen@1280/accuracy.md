# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo26s-1280-e5-plates-frozen@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7696 | 0.8152 | 0.7492 | 0.7808 | 0.2395 | 0.8967 | 0.7127 | 0.7942 | **0.7796** |
| Plate | vn | 500 | 0.9795 | 0.9254 | 0.9680 | 0.9462 | 0.6334 | 0.9770 | 0.9360 | 0.9561 | **0.9680** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5770 | 0.6287 |
| Small | 16–32 | 10244 | 0.8821 | 0.8961 |
| Medium | 32–96 | 7823 | 0.9457 | 0.9516 |
| Large | > 96 | 1892 | 0.9614 | 0.9641 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9418 | 0.9467 |
| Blur | normal blur (1) | 10378 | 0.9365 | 0.9492 |
| Blur | heavy blur (2) | 23369 | 0.6218 | 0.6658 |
| Expression | typical expression (0) | 38712 | 0.7474 | 0.7779 |
| Expression | exaggerate expression (1) | 400 | 0.9300 | 0.9425 |
| Illumination | normal illumination (0) | 36832 | 0.7436 | 0.7747 |
| Illumination | extreme illumination (1) | 2280 | 0.8408 | 0.8575 |
| Occlusion | no occlusion (0) | 23428 | 0.8803 | 0.8941 |
| Occlusion | partial occlusion (1) | 7097 | 0.6444 | 0.6876 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4783 | 0.5431 |
| Pose | typical pose (0) | 37475 | 0.7518 | 0.7821 |
| Pose | atypical pose (1) | 1637 | 0.6915 | 0.7202 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6458 | 0.6887 |
| Blurry | 25–100 | 6506 | 0.9122 | 0.9241 |
| Soft | 100–400 | 4806 | 0.9534 | 0.9586 |
| Sharp | ≥ 400 | 2631 | 0.9624 | 0.9639 |

