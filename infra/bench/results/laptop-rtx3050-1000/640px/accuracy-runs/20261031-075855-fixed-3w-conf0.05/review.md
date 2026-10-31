# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-075855-fixed-3w-conf0.05`
- **Dataset**: `large` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 700
- **Ground Truth Targets**: 8079 valid targets (4352 with width ≥ 16 px)
- **Leaky Images (All)**: 535 / 700 (76.4%)
- **Leaky Images (≥16 px)**: 517 / 700 (73.9%)
- **Silent Misses (All)**: 207 / 535 leaky images (38.7%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 191 / 517 leaky images (36.9%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 535 | 0.0000 | 0.0000 | 0 / 517 | 0.0000 | 0.0000 |
| 0.40 | 61 | 0.0871 | 47 / 535 | 0.0879 | 0.7705 | 45 / 517 | 0.0870 | 0.7377 |
| 0.45 | 85 | 0.1214 | 59 / 535 | 0.1103 | 0.6941 | 57 / 517 | 0.1103 | 0.6706 |
| **0.50 (default)** | 109 | 0.1557 | 68 / 535 | 0.1271 | 0.6239 | 65 / 517 | 0.1257 | 0.5963 |
| 0.55 | 125 | 0.1786 | 72 / 535 | 0.1346 | 0.5760 | 69 / 517 | 0.1335 | 0.5520 |
| 0.60 | 148 | 0.2114 | 75 / 535 | 0.1402 | 0.5068 | 72 / 517 | 0.1393 | 0.4865 |
| 0.65 | 161 | 0.2300 | 77 / 535 | 0.1439 | 0.4783 | 74 / 517 | 0.1431 | 0.4596 |
| 0.70 | 180 | 0.2571 | 82 / 535 | 0.1533 | 0.4556 | 79 / 517 | 0.1528 | 0.4389 |
| 0.75 | 194 | 0.2771 | 82 / 535 | 0.1533 | 0.4227 | 79 / 517 | 0.1528 | 0.4072 |
| 0.80 | 213 | 0.3043 | 82 / 535 | 0.1533 | 0.3850 | 79 / 517 | 0.1528 | 0.3709 |
| 0.85 | 234 | 0.3343 | 82 / 535 | 0.1533 | 0.3504 | 79 / 517 | 0.1528 | 0.3376 |
| 0.90 | 247 | 0.3529 | 83 / 535 | 0.1551 | 0.3360 | 80 / 517 | 0.1547 | 0.3239 |
| 0.95 | 247 | 0.3529 | 83 / 535 | 0.1551 | 0.3360 | 80 / 517 | 0.1547 | 0.3239 |
| *What-If (0.20 ≤ conf < 0.50)* | *217* | *0.3100* | *170 / 535* | *0.3178* | *0.7834* | *167 / 517* | *0.3230* | *0.7696* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 765 | 469 | 0.6131 | 612 | 0.8000 |
| 0.10–0.20 | 626 | 515 | 0.8227 | 568 | 0.9073 |
| 0.20–0.30 | 312 | 282 | 0.9038 | 286 | 0.9167 |
| 0.30–0.40 | 198 | 188 | 0.9495 | 189 | 0.9545 |
| 0.40–0.50 | 119 | 117 | 0.9832 | 117 | 0.9832 |
| 0.50–0.60 | 109 | 105 | 0.9633 | 106 | 0.9725 |
| 0.60–0.70 | 113 | 112 | 0.9912 | 112 | 0.9912 |
| 0.70–0.80 | 95 | 95 | 1.0000 | 95 | 1.0000 |
| 0.80–0.90 | 51 | 51 | 1.0000 | 51 | 1.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 300
- **Ground Truth Targets**: 300 valid targets (300 with width ≥ 16 px)
- **Leaky Images (All)**: 259 / 300 (86.3%)
- **Leaky Images (≥16 px)**: 259 / 300 (86.3%)
- **Silent Misses (All)**: 67 / 259 leaky images (25.9%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 67 / 259 leaky images (25.9%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.40 | 11 | 0.0367 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.45 | 21 | 0.0700 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| **0.50 (default)** | 26 | 0.0867 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.55 | 32 | 0.1067 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.60 | 33 | 0.1100 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.65 | 37 | 0.1233 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.70 | 37 | 0.1233 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.75 | 39 | 0.1300 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.80 | 40 | 0.1333 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.85 | 40 | 0.1333 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.90 | 40 | 0.1333 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| 0.95 | 41 | 0.1367 | 0 / 259 | 0.0000 | 0.0000 | 0 / 259 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *88* | *0.2933* | *62 / 259* | *0.2394* | *0.7045* | *62 / 259* | *0.2394* | *0.7045* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 99 | 52 | 0.5253 | 80 | 0.8081 |
| 0.10–0.20 | 92 | 73 | 0.7935 | 89 | 0.9674 |
| 0.20–0.30 | 45 | 42 | 0.9333 | 45 | 1.0000 |
| 0.30–0.40 | 34 | 31 | 0.9118 | 32 | 0.9412 |
| 0.40–0.50 | 15 | 15 | 1.0000 | 15 | 1.0000 |
| 0.50–0.60 | 7 | 7 | 1.0000 | 7 | 1.0000 |
| 0.60–0.70 | 4 | 4 | 1.0000 | 4 | 1.0000 |
| 0.70–0.80 | 3 | 3 | 1.0000 | 3 | 1.0000 |
| 0.80–0.90 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.90–1.00 | 1 | 1 | 1.0000 | 1 | 1.0000 |

