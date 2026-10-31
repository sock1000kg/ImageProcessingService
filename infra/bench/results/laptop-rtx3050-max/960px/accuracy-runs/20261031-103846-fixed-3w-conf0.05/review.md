# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-103846-fixed-3w-conf0.05`
- **Dataset**: `max` (960px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 3226
- **Ground Truth Targets**: 39112 valid targets (19959 with width ≥ 16 px)
- **Leaky Images (All)**: 2159 / 3226 (66.9%)
- **Leaky Images (≥16 px)**: 2082 / 3226 (64.5%)
- **Silent Misses (All)**: 492 / 2159 leaky images (22.8%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 426 / 2082 leaky images (20.5%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 2159 | 0.0000 | 0.0000 | 0 / 2082 | 0.0000 | 0.0000 |
| 0.40 | 403 | 0.1249 | 301 / 2159 | 0.1394 | 0.7469 | 300 / 2082 | 0.1441 | 0.7444 |
| 0.45 | 609 | 0.1888 | 428 / 2159 | 0.1982 | 0.7028 | 424 / 2082 | 0.2037 | 0.6962 |
| **0.50 (default)** | 747 | 0.2316 | 483 / 2159 | 0.2237 | 0.6466 | 477 / 2082 | 0.2291 | 0.6386 |
| 0.55 | 864 | 0.2678 | 514 / 2159 | 0.2381 | 0.5949 | 508 / 2082 | 0.2440 | 0.5880 |
| 0.60 | 959 | 0.2973 | 535 / 2159 | 0.2478 | 0.5579 | 527 / 2082 | 0.2531 | 0.5495 |
| 0.65 | 1045 | 0.3239 | 555 / 2159 | 0.2571 | 0.5311 | 547 / 2082 | 0.2627 | 0.5234 |
| 0.70 | 1166 | 0.3614 | 565 / 2159 | 0.2617 | 0.4846 | 557 / 2082 | 0.2675 | 0.4777 |
| 0.75 | 1276 | 0.3955 | 578 / 2159 | 0.2677 | 0.4530 | 570 / 2082 | 0.2738 | 0.4467 |
| 0.80 | 1424 | 0.4414 | 590 / 2159 | 0.2733 | 0.4143 | 582 / 2082 | 0.2795 | 0.4087 |
| 0.85 | 1557 | 0.4826 | 595 / 2159 | 0.2756 | 0.3821 | 587 / 2082 | 0.2819 | 0.3770 |
| 0.90 | 1655 | 0.5130 | 596 / 2159 | 0.2761 | 0.3601 | 588 / 2082 | 0.2824 | 0.3553 |
| 0.95 | 1659 | 0.5143 | 596 / 2159 | 0.2761 | 0.3593 | 588 / 2082 | 0.2824 | 0.3544 |
| *What-If (0.20 ≤ conf < 0.50)* | *1309* | *0.4058* | *1006 / 2159* | *0.4660* | *0.7685* | *1000 / 2082* | *0.4803* | *0.7639* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 4452 | 2611 | 0.5865 | 3404 | 0.7646 |
| 0.10–0.20 | 3738 | 2966 | 0.7935 | 3220 | 0.8614 |
| 0.20–0.30 | 2209 | 2017 | 0.9131 | 2052 | 0.9289 |
| 0.30–0.40 | 1382 | 1299 | 0.9399 | 1304 | 0.9436 |
| 0.40–0.50 | 1018 | 978 | 0.9607 | 980 | 0.9627 |
| 0.50–0.60 | 816 | 797 | 0.9767 | 796 | 0.9755 |
| 0.60–0.70 | 789 | 783 | 0.9924 | 781 | 0.9899 |
| 0.70–0.80 | 761 | 759 | 0.9974 | 757 | 0.9947 |
| 0.80–0.90 | 470 | 469 | 0.9979 | 469 | 0.9979 |
| 0.90–1.00 | 7 | 7 | 1.0000 | 7 | 1.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 500
- **Ground Truth Targets**: 500 valid targets (500 with width ≥ 16 px)
- **Leaky Images (All)**: 387 / 500 (77.4%)
- **Leaky Images (≥16 px)**: 387 / 500 (77.4%)
- **Silent Misses (All)**: 81 / 387 leaky images (20.9%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 81 / 387 leaky images (20.9%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.40 | 33 | 0.0660 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.45 | 50 | 0.1000 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| **0.50 (default)** | 68 | 0.1360 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.55 | 81 | 0.1620 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.60 | 89 | 0.1780 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.65 | 95 | 0.1900 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.70 | 102 | 0.2040 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.75 | 112 | 0.2240 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.80 | 113 | 0.2260 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.85 | 113 | 0.2260 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.90 | 113 | 0.2260 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| 0.95 | 113 | 0.2260 | 0 / 387 | 0.0000 | 0.0000 | 0 / 387 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *198* | *0.3960* | *126 / 387* | *0.3256* | *0.6364* | *126 / 387* | *0.3256* | *0.6364* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 159 | 69 | 0.4340 | 140 | 0.8805 |
| 0.10–0.20 | 144 | 113 | 0.7847 | 138 | 0.9583 |
| 0.20–0.30 | 95 | 82 | 0.8632 | 92 | 0.9684 |
| 0.30–0.40 | 75 | 70 | 0.9333 | 75 | 1.0000 |
| 0.40–0.50 | 39 | 35 | 0.8974 | 39 | 1.0000 |
| 0.50–0.60 | 21 | 21 | 1.0000 | 21 | 1.0000 |
| 0.60–0.70 | 16 | 15 | 0.9375 | 16 | 1.0000 |
| 0.70–0.80 | 11 | 10 | 0.9091 | 11 | 1.0000 |
| 0.80–0.90 | 1 | 1 | 1.0000 | 1 | 1.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

