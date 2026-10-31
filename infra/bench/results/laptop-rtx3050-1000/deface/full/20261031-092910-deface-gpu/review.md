# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-092910-deface-gpu`
- **Dataset**: `large` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 700
- **Ground Truth Targets**: 8079 valid targets (4352 with width ≥ 16 px)
- **Leaky Images (All)**: 254 / 700 (36.3%)
- **Leaky Images (≥16 px)**: 193 / 700 (27.6%)
- **Silent Misses (All)**: 12 / 254 leaky images (4.7%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 11 / 193 leaky images (5.7%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 254 | 0.0000 | 0.0000 | 0 / 193 | 0.0000 | 0.0000 |
| 0.40 | 148 | 0.2114 | 120 / 254 | 0.4724 | 0.8108 | 88 / 193 | 0.4560 | 0.5946 |
| 0.45 | 203 | 0.2900 | 157 / 254 | 0.6181 | 0.7734 | 116 / 193 | 0.6010 | 0.5714 |
| **0.50 (default)** | 240 | 0.3429 | 178 / 254 | 0.7008 | 0.7417 | 132 / 193 | 0.6839 | 0.5500 |
| 0.55 | 273 | 0.3900 | 191 / 254 | 0.7520 | 0.6996 | 144 / 193 | 0.7461 | 0.5275 |
| 0.60 | 298 | 0.4257 | 203 / 254 | 0.7992 | 0.6812 | 155 / 193 | 0.8031 | 0.5201 |
| 0.65 | 324 | 0.4629 | 211 / 254 | 0.8307 | 0.6512 | 160 / 193 | 0.8290 | 0.4938 |
| 0.70 | 359 | 0.5129 | 221 / 254 | 0.8701 | 0.6156 | 168 / 193 | 0.8705 | 0.4680 |
| 0.75 | 404 | 0.5771 | 229 / 254 | 0.9016 | 0.5668 | 174 / 193 | 0.9016 | 0.4307 |
| 0.80 | 463 | 0.6614 | 236 / 254 | 0.9291 | 0.5097 | 179 / 193 | 0.9275 | 0.3866 |
| 0.85 | 526 | 0.7514 | 238 / 254 | 0.9370 | 0.4525 | 181 / 193 | 0.9378 | 0.3441 |
| 0.90 | 617 | 0.8814 | 245 / 254 | 0.9646 | 0.3971 | 187 / 193 | 0.9689 | 0.3031 |
| 0.95 | 682 | 0.9743 | 247 / 254 | 0.9724 | 0.3622 | 189 / 193 | 0.9793 | 0.2771 |
| *What-If (0.20 ≤ conf < 0.50)* | *366* | *0.5229* | *231 / 254* | *0.9094* | *0.6311* | *172 / 193* | *0.8912* | *0.4699* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 37768 | 293 | 0.0078 | 1573 | 0.0416 |
| 0.10–0.20 | 11747 | 422 | 0.0359 | 1148 | 0.0977 |
| 0.20–0.30 | 2292 | 394 | 0.1719 | 595 | 0.2596 |
| 0.30–0.40 | 1019 | 414 | 0.4063 | 518 | 0.5083 |
| 0.40–0.50 | 743 | 482 | 0.6487 | 564 | 0.7591 |
| 0.50–0.60 | 668 | 554 | 0.8293 | 598 | 0.8952 |
| 0.60–0.70 | 730 | 694 | 0.9507 | 709 | 0.9712 |
| 0.70–0.80 | 1017 | 1008 | 0.9912 | 1008 | 0.9912 |
| 0.80–0.90 | 1291 | 1285 | 0.9954 | 1286 | 0.9961 |
| 0.90–1.00 | 368 | 368 | 1.0000 | 368 | 1.0000 |

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

