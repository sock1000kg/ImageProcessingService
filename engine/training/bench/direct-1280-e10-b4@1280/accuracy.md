# Detection Accuracy & Privacy Recall Report

- **Tool**: `engine`
- **Run Directory**: `/home/dat/projects/ImageProcessing/engine/training/bench/direct-1280-e10-b4@1280`
- **Operating Threshold**: `0.15`

## Overall Detection Metrics

| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Face | wider | 39112 | 0.6940 | 0.7875 | 0.6668 | 0.7221 | 0.1933 | 0.8479 | 0.6412 | 0.7302 | **0.6970** |
| Plate | vn | 500 | 0.9646 | 0.9320 | 0.9600 | 0.9458 | 0.5626 | 0.9772 | 0.9420 | 0.9593 | **0.9600** |

## Face Detection by Size

| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Tiny | < 16 | 19153 | 0.4644 | 0.5146 |
| Small | 16–32 | 10244 | 0.8041 | 0.8191 |
| Medium | 32–96 | 7823 | 0.9155 | 0.9236 |
| Large | > 96 | 1892 | 0.9434 | 0.9466 |

## Face Detection by WIDER Attribute

| Attribute | Value | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Blur | clear (0) | 5365 | 0.9200 | 0.9262 |
| Blur | normal blur (1) | 10378 | 0.8878 | 0.9031 |
| Blur | heavy blur (2) | 23369 | 0.5105 | 0.5530 |
| Expression | typical expression (0) | 38712 | 0.6644 | 0.6949 |
| Expression | exaggerate expression (1) | 400 | 0.8975 | 0.9050 |
| Illumination | normal illumination (0) | 36832 | 0.6597 | 0.6911 |
| Illumination | extreme illumination (1) | 2280 | 0.7816 | 0.7925 |
| Occlusion | no occlusion (0) | 23428 | 0.8221 | 0.8383 |
| Occlusion | partial occlusion (1) | 7097 | 0.5357 | 0.5793 |
| Occlusion | heavy occlusion (2) | 8587 | 0.3513 | 0.4091 |
| Pose | typical pose (0) | 37475 | 0.6702 | 0.7001 |
| Pose | atypical pose (1) | 1637 | 0.5883 | 0.6280 |

## Face Detection by Measured Sharpness

| Sharpness Bucket | Variance Range | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |
| --- | --- | --- | --- | --- |
| Very blurry | < 25 | 25169 | 0.5398 | 0.5819 |
| Blurry | 25–100 | 6506 | 0.8584 | 0.8697 |
| Soft | 100–400 | 4806 | 0.9224 | 0.9311 |
| Sharp | ≥ 400 | 2631 | 0.9403 | 0.9441 |

