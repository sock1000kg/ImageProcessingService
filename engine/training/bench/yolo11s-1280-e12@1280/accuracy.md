# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/yolo11s-1280-e12@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.7427 | 0.7830 | 0.7252 | 0.7530 | 0.2552 | 0.8881 | 0.6790 | 0.7696 | **0.7563** |
| Plate | vn | 500 | 0.9845 | 0.9385 | 0.9760 | 0.9569 | 0.3995 | 0.9566 | 0.9700 | 0.9633 | **0.9760** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.5499 | 0.6013 |
| Small | 16–32 | 10244 | 0.8570 | 0.8732 |
| Medium | 32–96 | 7823 | 0.9288 | 0.9372 |
| Large | > 96 | 1892 | 0.9440 | 0.9434 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9271 | 0.9338 |
| Blur | normal blur (1) | 10378 | 0.9231 | 0.9360 |
| Blur | heavy blur (2) | 23369 | 0.5909 | 0.6357 |
| Expression | typical expression (0) | 38712 | 0.7232 | 0.7545 |
| Expression | exaggerate expression (1) | 400 | 0.9150 | 0.9250 |
| Illumination | normal illumination (0) | 36832 | 0.7195 | 0.7515 |
| Illumination | extreme illumination (1) | 2280 | 0.8167 | 0.8325 |
| Occlusion | no occlusion (0) | 23428 | 0.8625 | 0.8774 |
| Occlusion | partial occlusion (1) | 7097 | 0.6146 | 0.6596 |
| Occlusion | heavy occlusion (2) | 8587 | 0.4419 | 0.5058 |
| Pose | typical pose (0) | 37475 | 0.7297 | 0.7603 |
| Pose | atypical pose (1) | 1637 | 0.6213 | 0.6646 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.6176 | 0.6610 |
| Blurry | 25–100 | 6506 | 0.8929 | 0.9064 |
| Soft | 100–400 | 4806 | 0.9411 | 0.9476 |
| Sharp | ≥ 400 | 2631 | 0.9449 | 0.9468 |

