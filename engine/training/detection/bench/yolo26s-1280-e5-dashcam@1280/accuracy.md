# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `engine/training/detection/bench/yolo26s-1280-e5-dashcam@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7730 | 0.8052 | 0.7559 | 0.7797 | 0.2518 | 0.8947 | 0.7176 | 0.7965 | **0.7874** |
| Plate | vn | 500 | 0.9677 | 0.8020 | 0.9640 | 0.8756 | 0.7705 | 0.9827 | 0.9080 | 0.9439 | **0.9640** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5870 | 0.6405 |
| Small | 16–32 | 10244 | 0.8852 | 0.9002 |
| Medium | 32–96 | 7823 | 0.9494 | 0.9558 |
| Large | > 96 | 1892 | 0.9651 | 0.9678 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9443 | 0.9500 |
| Blur | normal blur (1) | 10378 | 0.9399 | 0.9532 |
| Blur | heavy blur (2) | 23369 | 0.6309 | 0.6765 |
| Expression | typical expression (0) | 38712 | 0.7540 | 0.7858 |
| Expression | exaggerate expression (1) | 400 | 0.9375 | 0.9475 |
| Illumination | normal illumination (0) | 36832 | 0.7504 | 0.7827 |
| Illumination | extreme illumination (1) | 2280 | 0.8447 | 0.8632 |
| Occlusion | no occlusion (0) | 23428 | 0.8841 | 0.8985 |
| Occlusion | partial occlusion (1) | 7097 | 0.6563 | 0.7024 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4884 | 0.5546 |
| Pose | typical pose (0) | 37475 | 0.7580 | 0.7894 |
| Pose | atypical pose (1) | 1637 | 0.7074 | 0.7416 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6545 | 0.6988 |
| Blurry | 25–100 | 6506 | 0.9153 | 0.9276 |
| Soft | 100–400 | 4806 | 0.9565 | 0.9632 |
| Sharp | ≥ 400 | 2631 | 0.9654 | 0.9677 |

