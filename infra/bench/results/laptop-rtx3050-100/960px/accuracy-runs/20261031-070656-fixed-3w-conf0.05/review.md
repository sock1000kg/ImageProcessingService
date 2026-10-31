# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-070656-fixed-3w-conf0.05`
- **Dataset**: `small` (960px input resolution)
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
- **Silent Misses (All)**: 12 / 47 leaky images (25.5%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 8 / 43 leaky images (18.6%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 47 | 0.0000 | 0.0000 | 0 / 43 | 0.0000 | 0.0000 |
| 0.40 | 8 | 0.1143 | 6 / 47 | 0.1277 | 0.7500 | 6 / 43 | 0.1395 | 0.7500 |
| 0.45 | 9 | 0.1286 | 7 / 47 | 0.1489 | 0.7778 | 7 / 43 | 0.1628 | 0.7778 |
| **0.50 (default)** | 12 | 0.1714 | 8 / 47 | 0.1702 | 0.6667 | 8 / 43 | 0.1860 | 0.6667 |
| 0.55 | 14 | 0.2000 | 9 / 47 | 0.1915 | 0.6429 | 9 / 43 | 0.2093 | 0.6429 |
| 0.60 | 19 | 0.2714 | 11 / 47 | 0.2340 | 0.5789 | 11 / 43 | 0.2558 | 0.5789 |
| 0.65 | 20 | 0.2857 | 11 / 47 | 0.2340 | 0.5500 | 11 / 43 | 0.2558 | 0.5500 |
| 0.70 | 22 | 0.3143 | 11 / 47 | 0.2340 | 0.5000 | 11 / 43 | 0.2558 | 0.5000 |
| 0.75 | 22 | 0.3143 | 11 / 47 | 0.2340 | 0.5000 | 11 / 43 | 0.2558 | 0.5000 |
| 0.80 | 29 | 0.4143 | 11 / 47 | 0.2340 | 0.3793 | 11 / 43 | 0.2558 | 0.3793 |
| 0.85 | 33 | 0.4714 | 11 / 47 | 0.2340 | 0.3333 | 11 / 43 | 0.2558 | 0.3333 |
| 0.90 | 33 | 0.4714 | 11 / 47 | 0.2340 | 0.3333 | 11 / 43 | 0.2558 | 0.3333 |
| 0.95 | 34 | 0.4857 | 11 / 47 | 0.2340 | 0.3235 | 11 / 43 | 0.2558 | 0.3235 |
| *What-If (0.20 ≤ conf < 0.50)* | *25* | *0.3571* | *21 / 47* | *0.4468* | *0.8400* | *21 / 43* | *0.4884* | *0.8400* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 88 | 49 | 0.5568 | 69 | 0.7841 |
| 0.10–0.20 | 103 | 92 | 0.8932 | 97 | 0.9417 |
| 0.20–0.30 | 35 | 30 | 0.8571 | 33 | 0.9429 |
| 0.30–0.40 | 24 | 22 | 0.9167 | 22 | 0.9167 |
| 0.40–0.50 | 11 | 10 | 0.9091 | 10 | 0.9091 |
| 0.50–0.60 | 19 | 18 | 0.9474 | 18 | 0.9474 |
| 0.60–0.70 | 11 | 11 | 1.0000 | 11 | 1.0000 |
| 0.70–0.80 | 15 | 15 | 1.0000 | 15 | 1.0000 |
| 0.80–0.90 | 11 | 11 | 1.0000 | 11 | 1.0000 |
| 0.90–1.00 | 1 | 1 | 1.0000 | 1 | 1.0000 |

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
| 0.40 | 1 | 0.0333 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.45 | 2 | 0.0667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| **0.50 (default)** | 4 | 0.1333 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.55 | 4 | 0.1333 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.60 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.65 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.70 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.75 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.80 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.85 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.90 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| 0.95 | 5 | 0.1667 | 0 / 25 | 0.0000 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *10* | *0.3333* | *6 / 25* | *0.2400* | *0.6000* | *6 / 25* | *0.2400* | *0.6000* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 12 | 7 | 0.5833 | 12 | 1.0000 |
| 0.10–0.20 | 7 | 7 | 1.0000 | 7 | 1.0000 |
| 0.20–0.30 | 6 | 5 | 0.8333 | 6 | 1.0000 |
| 0.30–0.40 | 2 | 2 | 1.0000 | 2 | 1.0000 |
| 0.40–0.50 | 3 | 3 | 1.0000 | 3 | 1.0000 |
| 0.50–0.60 | 1 | 1 | 1.0000 | 1 | 1.0000 |
| 0.60–0.70 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.70–0.80 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.80–0.90 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

