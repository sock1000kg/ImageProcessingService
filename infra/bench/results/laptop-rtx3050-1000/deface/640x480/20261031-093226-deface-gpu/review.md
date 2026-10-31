# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-093226-deface-gpu`
- **Dataset**: `large` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 700
- **Ground Truth Targets**: 8079 valid targets (4352 with width ≥ 16 px)
- **Leaky Images (All)**: 295 / 700 (42.1%)
- **Leaky Images (≥16 px)**: 245 / 700 (35.0%)
- **Silent Misses (All)**: 12 / 295 leaky images (4.1%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 11 / 245 leaky images (4.5%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 295 | 0.0000 | 0.0000 | 0 / 245 | 0.0000 | 0.0000 |
| 0.40 | 144 | 0.2057 | 122 / 295 | 0.4136 | 0.8472 | 102 / 245 | 0.4163 | 0.7083 |
| 0.45 | 207 | 0.2957 | 163 / 295 | 0.5525 | 0.7874 | 135 / 245 | 0.5510 | 0.6522 |
| **0.50 (default)** | 255 | 0.3643 | 190 / 295 | 0.6441 | 0.7451 | 158 / 245 | 0.6449 | 0.6196 |
| 0.55 | 276 | 0.3943 | 200 / 295 | 0.6780 | 0.7246 | 166 / 245 | 0.6776 | 0.6014 |
| 0.60 | 312 | 0.4457 | 217 / 295 | 0.7356 | 0.6955 | 179 / 245 | 0.7306 | 0.5737 |
| 0.65 | 351 | 0.5014 | 225 / 295 | 0.7627 | 0.6410 | 187 / 245 | 0.7633 | 0.5328 |
| 0.70 | 387 | 0.5529 | 236 / 295 | 0.8000 | 0.6098 | 197 / 245 | 0.8041 | 0.5090 |
| 0.75 | 427 | 0.6100 | 243 / 295 | 0.8237 | 0.5691 | 203 / 245 | 0.8286 | 0.4754 |
| 0.80 | 481 | 0.6871 | 250 / 295 | 0.8475 | 0.5198 | 210 / 245 | 0.8571 | 0.4366 |
| 0.85 | 561 | 0.8014 | 254 / 295 | 0.8610 | 0.4528 | 213 / 245 | 0.8694 | 0.3797 |
| 0.90 | 628 | 0.8971 | 258 / 295 | 0.8746 | 0.4108 | 216 / 245 | 0.8816 | 0.3439 |
| 0.95 | 664 | 0.9486 | 260 / 295 | 0.8814 | 0.3916 | 217 / 245 | 0.8857 | 0.3268 |
| *What-If (0.20 ≤ conf < 0.50)* | *363* | *0.5186* | *261 / 295* | *0.8847* | *0.7190* | *215 / 245* | *0.8776* | *0.5923* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 31137 | 258 | 0.0083 | 1802 | 0.0579 |
| 0.10–0.20 | 10191 | 342 | 0.0336 | 1368 | 0.1342 |
| 0.20–0.30 | 1886 | 284 | 0.1506 | 585 | 0.3102 |
| 0.30–0.40 | 739 | 301 | 0.4073 | 411 | 0.5562 |
| 0.40–0.50 | 527 | 343 | 0.6509 | 399 | 0.7571 |
| 0.50–0.60 | 522 | 458 | 0.8774 | 479 | 0.9176 |
| 0.60–0.70 | 614 | 589 | 0.9593 | 600 | 0.9772 |
| 0.70–0.80 | 869 | 868 | 0.9988 | 867 | 0.9977 |
| 0.80–0.90 | 822 | 821 | 0.9988 | 821 | 0.9988 |
| 0.90–1.00 | 128 | 128 | 1.0000 | 128 | 1.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 300
- **Ground Truth Targets**: 300 valid targets (300 with width ≥ 16 px)
- **Leaky Images (All)**: 300 / 300 (100.0%)
- **Leaky Images (≥16 px)**: 300 / 300 (100.0%)
- **Silent Misses (All)**: 300 / 300 leaky images (100.0%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 300 / 300 leaky images (100.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.40 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.45 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| **0.50 (default)** | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.55 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.60 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.65 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.70 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.75 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.80 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.85 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.90 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| 0.95 | 0 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 | 0 / 300 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *0* | *0.0000* | *0 / 300* | *0.0000* | *0.0000* | *0 / 300* | *0.0000* | *0.0000* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.10–0.20 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.20–0.30 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.30–0.40 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.40–0.50 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.50–0.60 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.60–0.70 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.70–0.80 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.80–0.90 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.90–1.00 | 0 | 0 | 0.0000 | 0 | 0.0000 |

