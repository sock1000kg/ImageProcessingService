# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-090539-fixed-3w-conf0.05`
- **Dataset**: `large` (960px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 700
- **Ground Truth Targets**: 8079 valid targets (4352 with width ≥ 16 px)
- **Leaky Images (All)**: 488 / 700 (69.7%)
- **Leaky Images (≥16 px)**: 470 / 700 (67.1%)
- **Silent Misses (All)**: 120 / 488 leaky images (24.6%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 105 / 470 leaky images (22.3%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 488 | 0.0000 | 0.0000 | 0 / 470 | 0.0000 | 0.0000 |
| 0.40 | 89 | 0.1271 | 61 / 488 | 0.1250 | 0.6854 | 61 / 470 | 0.1298 | 0.6854 |
| 0.45 | 136 | 0.1943 | 89 / 488 | 0.1824 | 0.6544 | 88 / 470 | 0.1872 | 0.6471 |
| **0.50 (default)** | 168 | 0.2400 | 100 / 488 | 0.2049 | 0.5952 | 98 / 470 | 0.2085 | 0.5833 |
| 0.55 | 185 | 0.2643 | 106 / 488 | 0.2172 | 0.5730 | 104 / 470 | 0.2213 | 0.5622 |
| 0.60 | 200 | 0.2857 | 108 / 488 | 0.2213 | 0.5400 | 105 / 470 | 0.2234 | 0.5250 |
| 0.65 | 215 | 0.3071 | 112 / 488 | 0.2295 | 0.5209 | 109 / 470 | 0.2319 | 0.5070 |
| 0.70 | 240 | 0.3429 | 113 / 488 | 0.2316 | 0.4708 | 110 / 470 | 0.2340 | 0.4583 |
| 0.75 | 263 | 0.3757 | 116 / 488 | 0.2377 | 0.4411 | 113 / 470 | 0.2404 | 0.4297 |
| 0.80 | 283 | 0.4043 | 119 / 488 | 0.2439 | 0.4205 | 116 / 470 | 0.2468 | 0.4099 |
| 0.85 | 306 | 0.4371 | 120 / 488 | 0.2459 | 0.3922 | 117 / 470 | 0.2489 | 0.3824 |
| 0.90 | 331 | 0.4729 | 121 / 488 | 0.2480 | 0.3656 | 118 / 470 | 0.2511 | 0.3565 |
| 0.95 | 332 | 0.4743 | 121 / 488 | 0.2480 | 0.3645 | 118 / 470 | 0.2511 | 0.3554 |
| *What-If (0.20 ≤ conf < 0.50)* | *293* | *0.4186* | *221 / 488* | *0.4529* | *0.7543* | *219 / 470* | *0.4660* | *0.7474* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 864 | 515 | 0.5961 | 670 | 0.7755 |
| 0.10–0.20 | 823 | 675 | 0.8202 | 721 | 0.8761 |
| 0.20–0.30 | 495 | 464 | 0.9374 | 467 | 0.9434 |
| 0.30–0.40 | 309 | 288 | 0.9320 | 290 | 0.9385 |
| 0.40–0.50 | 219 | 208 | 0.9498 | 207 | 0.9452 |
| 0.50–0.60 | 131 | 126 | 0.9618 | 126 | 0.9618 |
| 0.60–0.70 | 154 | 152 | 0.9870 | 152 | 0.9870 |
| 0.70–0.80 | 167 | 166 | 0.9940 | 165 | 0.9880 |
| 0.80–0.90 | 87 | 87 | 1.0000 | 87 | 1.0000 |
| 0.90–1.00 | 1 | 1 | 1.0000 | 1 | 1.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 300
- **Ground Truth Targets**: 300 valid targets (300 with width ≥ 16 px)
- **Leaky Images (All)**: 237 / 300 (79.0%)
- **Leaky Images (≥16 px)**: 237 / 300 (79.0%)
- **Silent Misses (All)**: 56 / 237 leaky images (23.6%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 56 / 237 leaky images (23.6%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.40 | 16 | 0.0533 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.45 | 29 | 0.0967 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| **0.50 (default)** | 39 | 0.1300 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.55 | 45 | 0.1500 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.60 | 48 | 0.1600 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.65 | 53 | 0.1767 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.70 | 57 | 0.1900 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.75 | 63 | 0.2100 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.80 | 63 | 0.2100 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.85 | 63 | 0.2100 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.90 | 63 | 0.2100 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| 0.95 | 63 | 0.2100 | 0 / 237 | 0.0000 | 0.0000 | 0 / 237 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *121* | *0.4033* | *80 / 237* | *0.3376* | *0.6612* | *80 / 237* | *0.3376* | *0.6612* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 94 | 42 | 0.4468 | 81 | 0.8617 |
| 0.10–0.20 | 79 | 59 | 0.7468 | 75 | 0.9494 |
| 0.20–0.30 | 60 | 54 | 0.9000 | 60 | 1.0000 |
| 0.30–0.40 | 42 | 40 | 0.9524 | 42 | 1.0000 |
| 0.40–0.50 | 24 | 23 | 0.9583 | 24 | 1.0000 |
| 0.50–0.60 | 9 | 9 | 1.0000 | 9 | 1.0000 |
| 0.60–0.70 | 10 | 10 | 1.0000 | 10 | 1.0000 |
| 0.70–0.80 | 6 | 5 | 0.8333 | 6 | 1.0000 |
| 0.80–0.90 | 1 | 1 | 1.0000 | 1 | 1.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

