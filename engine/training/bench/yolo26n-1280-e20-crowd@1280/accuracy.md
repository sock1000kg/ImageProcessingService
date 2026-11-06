# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo26n-1280-e20-crowd@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7511 | 0.7619 | 0.7376 | 0.7496 | 0.2490 | 0.8769 | 0.6943 | 0.7750 | **0.7731** |
| Plate | vn | 500 | 0.9870 | 0.9208 | 0.9760 | 0.9476 | 0.4142 | 0.9642 | 0.9700 | 0.9671 | **0.9760** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5628 | 0.6216 |
| Small | 16–32 | 10244 | 0.8685 | 0.8873 |
| Medium | 32–96 | 7823 | 0.9386 | 0.9473 |
| Large | > 96 | 1892 | 0.9672 | 0.9693 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9405 | 0.9458 |
| Blur | normal blur (1) | 10378 | 0.9246 | 0.9413 |
| Blur | heavy blur (2) | 23369 | 0.6080 | 0.6588 |
| Expression | typical expression (0) | 38712 | 0.7355 | 0.7713 |
| Expression | exaggerate expression (1) | 400 | 0.9425 | 0.9525 |
| Illumination | normal illumination (0) | 36832 | 0.7318 | 0.7684 |
| Illumination | extreme illumination (1) | 2280 | 0.8307 | 0.8491 |
| Occlusion | no occlusion (0) | 23428 | 0.8734 | 0.8916 |
| Occlusion | partial occlusion (1) | 7097 | 0.6294 | 0.6783 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4565 | 0.5284 |
| Pose | typical pose (0) | 37475 | 0.7400 | 0.7753 |
| Pose | atypical pose (1) | 1637 | 0.6836 | 0.7239 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6315 | 0.6812 |
| Blurry | 25–100 | 6506 | 0.9001 | 0.9148 |
| Soft | 100–400 | 4806 | 0.9488 | 0.9580 |
| Sharp | ≥ 400 | 2631 | 0.9647 | 0.9650 |

