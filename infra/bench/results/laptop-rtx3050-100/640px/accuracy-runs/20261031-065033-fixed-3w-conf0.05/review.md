# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-065033-fixed-3w-conf0.05`
- **Dataset**: `small` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 70
- **Ground Truth Targets**: 786 valid targets (487 with width ≥ 16 px)
- **Leaky Images (All)**: 51 / 70 (72.9%)
- **Leaky Images (≥16 px)**: 47 / 70 (67.1%)
- **Silent Misses (All)**: 21 / 51 leaky images (41.2%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 18 / 47 leaky images (38.3%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 51 | 0.0000 | 0.0000 | 0 / 47 | 0.0000 | 0.0000 |
| 0.40 | 5 | 0.0714 | 5 / 51 | 0.0980 | 1.0000 | 5 / 47 | 0.1064 | 1.0000 |
| 0.45 | 10 | 0.1429 | 7 / 51 | 0.1373 | 0.7000 | 7 / 47 | 0.1489 | 0.7000 |
| **0.50 (default)** | 11 | 0.1571 | 8 / 51 | 0.1569 | 0.7273 | 8 / 47 | 0.1702 | 0.7273 |
| 0.55 | 12 | 0.1714 | 8 / 51 | 0.1569 | 0.6667 | 8 / 47 | 0.1702 | 0.6667 |
| 0.60 | 14 | 0.2000 | 9 / 51 | 0.1765 | 0.6429 | 9 / 47 | 0.1915 | 0.6429 |
| 0.65 | 15 | 0.2143 | 9 / 51 | 0.1765 | 0.6000 | 9 / 47 | 0.1915 | 0.6000 |
| 0.70 | 16 | 0.2286 | 9 / 51 | 0.1765 | 0.5625 | 9 / 47 | 0.1915 | 0.5625 |
| 0.75 | 22 | 0.3143 | 9 / 51 | 0.1765 | 0.4091 | 9 / 47 | 0.1915 | 0.4091 |
| 0.80 | 23 | 0.3286 | 9 / 51 | 0.1765 | 0.3913 | 9 / 47 | 0.1915 | 0.3913 |
| 0.85 | 26 | 0.3714 | 9 / 51 | 0.1765 | 0.3462 | 9 / 47 | 0.1915 | 0.3462 |
| 0.90 | 28 | 0.4000 | 9 / 51 | 0.1765 | 0.3214 | 9 / 47 | 0.1915 | 0.3214 |
| 0.95 | 28 | 0.4000 | 9 / 51 | 0.1765 | 0.3214 | 9 / 47 | 0.1915 | 0.3214 |
| *What-If (0.20 ≤ conf < 0.50)* | *19* | *0.2714* | *16 / 51* | *0.3137* | *0.8421* | *16 / 47* | *0.3404* | *0.8421* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 85 | 50 | 0.5882 | 71 | 0.8353 |
| 0.10–0.20 | 60 | 42 | 0.7000 | 53 | 0.8833 |
| 0.20–0.30 | 33 | 29 | 0.8788 | 28 | 0.8485 |
| 0.30–0.40 | 9 | 9 | 1.0000 | 9 | 1.0000 |
| 0.40–0.50 | 10 | 10 | 1.0000 | 10 | 1.0000 |
| 0.50–0.60 | 12 | 11 | 0.9167 | 12 | 1.0000 |
| 0.60–0.70 | 6 | 6 | 1.0000 | 6 | 1.0000 |
| 0.70–0.80 | 19 | 19 | 1.0000 | 19 | 1.0000 |
| 0.80–0.90 | 7 | 7 | 1.0000 | 7 | 1.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 30
- **Ground Truth Targets**: 30 valid targets (30 with width ≥ 16 px)
- **Leaky Images (All)**: 25 / 30 (83.3%)
- **Leaky Images (≥16 px)**: 25 / 30 (83.3%)
- **Silent Misses (All)**: 5 / 25 leaky images (20.0%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 5 / 25 leaky images (20.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.40 | 2 | 0.0667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.45 | 4 | 0.1333 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| **0.50 (default)** | 4 | 0.1333 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.55 | 4 | 0.1333 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.60 | 4 | 0.1333 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.65 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.70 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.75 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.80 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.85 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.90 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.95 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *12* | *0.4000* | *8 / 25* | *0.3200* | *0.6667* | *8 / 25* | *0.3200* | *0.6667* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 10 | 6 | 0.6000 | 8 | 0.8000 |
| 0.10–0.20 | 7 | 6 | 0.8571 | 7 | 1.0000 |
| 0.20–0.30 | 6 | 6 | 1.0000 | 6 | 1.0000 |
| 0.30–0.40 | 4 | 4 | 1.0000 | 4 | 1.0000 |
| 0.40–0.50 | 2 | 2 | 1.0000 | 2 | 1.0000 |
| 0.50–0.60 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.60–0.70 | 1 | 1 | 1.0000 | 1 | 1.0000 |
| 0.70–0.80 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.80–0.90 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

