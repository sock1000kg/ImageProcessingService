# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-073824-fixed-3w-conf0.05`
- **Dataset**: `small` (1280px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 70
- **Ground Truth Targets**: 786 valid targets (487 with width ≥ 16 px)
- **Leaky Images (All)**: 47 / 70 (67.1%)
- **Leaky Images (≥16 px)**: 43 / 70 (61.4%)
- **Silent Misses (All)**: 7 / 47 leaky images (14.9%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 3 / 43 leaky images (7.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 47 | 0.0000 | 0.0000 | 0 / 43 | 0.0000 | 0.0000 |
| 0.40 | 12 | 0.1714 | 11 / 47 | 0.2340 | 0.9167 | 11 / 43 | 0.2558 | 0.9167 |
| 0.45 | 14 | 0.2000 | 12 / 47 | 0.2553 | 0.8571 | 12 / 43 | 0.2791 | 0.8571 |
| **0.50 (default)** | 15 | 0.2143 | 13 / 47 | 0.2766 | 0.8667 | 13 / 43 | 0.3023 | 0.8667 |
| 0.55 | 17 | 0.2429 | 13 / 47 | 0.2766 | 0.7647 | 13 / 43 | 0.3023 | 0.7647 |
| 0.60 | 19 | 0.2714 | 13 / 47 | 0.2766 | 0.6842 | 13 / 43 | 0.3023 | 0.6842 |
| 0.65 | 22 | 0.3143 | 16 / 47 | 0.3404 | 0.7273 | 16 / 43 | 0.3721 | 0.7273 |
| 0.70 | 26 | 0.3714 | 16 / 47 | 0.3404 | 0.6154 | 16 / 43 | 0.3721 | 0.6154 |
| 0.75 | 27 | 0.3857 | 17 / 47 | 0.3617 | 0.6296 | 17 / 43 | 0.3953 | 0.6296 |
| 0.80 | 33 | 0.4714 | 17 / 47 | 0.3617 | 0.5152 | 17 / 43 | 0.3953 | 0.5152 |
| 0.85 | 39 | 0.5571 | 17 / 47 | 0.3617 | 0.4359 | 17 / 43 | 0.3953 | 0.4359 |
| 0.90 | 40 | 0.5714 | 17 / 47 | 0.3617 | 0.4250 | 17 / 43 | 0.3953 | 0.4250 |
| 0.95 | 40 | 0.5714 | 17 / 47 | 0.3617 | 0.4250 | 17 / 43 | 0.3953 | 0.4250 |
| *What-If (0.20 ≤ conf < 0.50)* | *31* | *0.4429* | *28 / 47* | *0.5957* | *0.9032* | *28 / 43* | *0.6512* | *0.9032* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 160 | 109 | 0.6813 | 134 | 0.8375 |
| 0.10–0.20 | 98 | 68 | 0.6939 | 79 | 0.8061 |
| 0.20–0.30 | 68 | 60 | 0.8824 | 65 | 0.9559 |
| 0.30–0.40 | 39 | 35 | 0.8974 | 36 | 0.9231 |
| 0.40–0.50 | 20 | 19 | 0.9500 | 20 | 1.0000 |
| 0.50–0.60 | 13 | 12 | 0.9231 | 12 | 0.9231 |
| 0.60–0.70 | 23 | 22 | 0.9565 | 22 | 0.9565 |
| 0.70–0.80 | 19 | 19 | 1.0000 | 19 | 1.0000 |
| 0.80–0.90 | 16 | 16 | 1.0000 | 16 | 1.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 30
- **Ground Truth Targets**: 30 valid targets (30 with width ≥ 16 px)
- **Leaky Images (All)**: 24 / 30 (80.0%)
- **Leaky Images (≥16 px)**: 24 / 30 (80.0%)
- **Silent Misses (All)**: 3 / 24 leaky images (12.5%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 3 / 24 leaky images (12.5%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.40 | 1 | 0.0333 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.45 | 1 | 0.0333 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| **0.50 (default)** | 2 | 0.0667 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.55 | 4 | 0.1333 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.60 | 4 | 0.1333 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.65 | 5 | 0.1667 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.70 | 5 | 0.1667 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.75 | 5 | 0.1667 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.80 | 6 | 0.2000 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.85 | 6 | 0.2000 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.90 | 6 | 0.2000 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| 0.95 | 6 | 0.2000 | 0 / 24 | 0.0000 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *12* | *0.4000* | *10 / 24* | *0.4167* | *0.8333* | *10 / 24* | *0.4167* | *0.8333* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 8 | 6 | 0.7500 | 8 | 1.0000 |
| 0.10–0.20 | 6 | 5 | 0.8333 | 6 | 1.0000 |
| 0.20–0.30 | 6 | 6 | 1.0000 | 6 | 1.0000 |
| 0.30–0.40 | 5 | 5 | 1.0000 | 5 | 1.0000 |
| 0.40–0.50 | 1 | 1 | 1.0000 | 1 | 1.0000 |
| 0.50–0.60 | 2 | 2 | 1.0000 | 2 | 1.0000 |
| 0.60–0.70 | 1 | 1 | 1.0000 | 1 | 1.0000 |
| 0.70–0.80 | 1 | 1 | 1.0000 | 1 | 1.0000 |
| 0.80–0.90 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

