# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-092722-fixed-3w-conf0.05`
- **Dataset**: `large` (1280px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 700
- **Ground Truth Targets**: 8079 valid targets (4352 with width ≥ 16 px)
- **Leaky Images (All)**: 457 / 700 (65.3%)
- **Leaky Images (≥16 px)**: 437 / 700 (62.4%)
- **Silent Misses (All)**: 80 / 457 leaky images (17.5%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 68 / 437 leaky images (15.6%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 457 | 0.0000 | 0.0000 | 0 / 437 | 0.0000 | 0.0000 |
| 0.40 | 113 | 0.1614 | 93 / 457 | 0.2035 | 0.8230 | 92 / 437 | 0.2105 | 0.8142 |
| 0.45 | 161 | 0.2300 | 119 / 457 | 0.2604 | 0.7391 | 118 / 437 | 0.2700 | 0.7329 |
| **0.50 (default)** | 184 | 0.2629 | 128 / 457 | 0.2801 | 0.6957 | 126 / 437 | 0.2883 | 0.6848 |
| 0.55 | 215 | 0.3071 | 138 / 457 | 0.3020 | 0.6419 | 136 / 437 | 0.3112 | 0.6326 |
| 0.60 | 249 | 0.3557 | 151 / 457 | 0.3304 | 0.6064 | 148 / 437 | 0.3387 | 0.5944 |
| 0.65 | 272 | 0.3886 | 154 / 457 | 0.3370 | 0.5662 | 150 / 437 | 0.3432 | 0.5515 |
| 0.70 | 288 | 0.4114 | 156 / 457 | 0.3414 | 0.5417 | 152 / 437 | 0.3478 | 0.5278 |
| 0.75 | 315 | 0.4500 | 159 / 457 | 0.3479 | 0.5048 | 154 / 437 | 0.3524 | 0.4889 |
| 0.80 | 345 | 0.4929 | 164 / 457 | 0.3589 | 0.4754 | 159 / 437 | 0.3638 | 0.4609 |
| 0.85 | 384 | 0.5486 | 166 / 457 | 0.3632 | 0.4323 | 161 / 437 | 0.3684 | 0.4193 |
| 0.90 | 409 | 0.5843 | 169 / 457 | 0.3698 | 0.4132 | 164 / 437 | 0.3753 | 0.4010 |
| 0.95 | 411 | 0.5871 | 169 / 457 | 0.3698 | 0.4112 | 164 / 437 | 0.3753 | 0.3990 |
| *What-If (0.20 ≤ conf < 0.50)* | *323* | *0.4614* | *254 / 457* | *0.5558* | *0.7864* | *251 / 437* | *0.5744* | *0.7771* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 1031 | 548 | 0.5315 | 746 | 0.7236 |
| 0.10–0.20 | 906 | 701 | 0.7737 | 766 | 0.8455 |
| 0.20–0.30 | 568 | 503 | 0.8856 | 511 | 0.8996 |
| 0.30–0.40 | 447 | 421 | 0.9418 | 425 | 0.9508 |
| 0.40–0.50 | 307 | 291 | 0.9479 | 293 | 0.9544 |
| 0.50–0.60 | 251 | 247 | 0.9841 | 247 | 0.9841 |
| 0.60–0.70 | 193 | 188 | 0.9741 | 188 | 0.9741 |
| 0.70–0.80 | 200 | 200 | 1.0000 | 200 | 1.0000 |
| 0.80–0.90 | 146 | 146 | 1.0000 | 145 | 0.9932 |
| 0.90–1.00 | 2 | 2 | 1.0000 | 2 | 1.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 300
- **Ground Truth Targets**: 300 valid targets (300 with width ≥ 16 px)
- **Leaky Images (All)**: 227 / 300 (75.7%)
- **Leaky Images (≥16 px)**: 227 / 300 (75.7%)
- **Silent Misses (All)**: 63 / 227 leaky images (27.8%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 63 / 227 leaky images (27.8%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.40 | 8 | 0.0267 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.45 | 27 | 0.0900 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| **0.50 (default)** | 39 | 0.1300 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.55 | 54 | 0.1800 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.60 | 57 | 0.1900 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.65 | 63 | 0.2100 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.70 | 65 | 0.2167 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.75 | 68 | 0.2267 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.80 | 71 | 0.2367 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.85 | 72 | 0.2400 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.90 | 73 | 0.2433 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| 0.95 | 73 | 0.2433 | 0 / 227 | 0.0000 | 0.0000 | 0 / 227 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *111* | *0.3700* | *67 / 227* | *0.2952* | *0.6036* | *67 / 227* | *0.2952* | *0.6036* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 83 | 40 | 0.4819 | 70 | 0.8434 |
| 0.10–0.20 | 88 | 60 | 0.6818 | 84 | 0.9545 |
| 0.20–0.30 | 53 | 43 | 0.8113 | 51 | 0.9623 |
| 0.30–0.40 | 33 | 30 | 0.9091 | 33 | 1.0000 |
| 0.40–0.50 | 31 | 28 | 0.9032 | 31 | 1.0000 |
| 0.50–0.60 | 18 | 16 | 0.8889 | 18 | 1.0000 |
| 0.60–0.70 | 10 | 8 | 0.8000 | 10 | 1.0000 |
| 0.70–0.80 | 8 | 7 | 0.8750 | 7 | 0.8750 |
| 0.80–0.90 | 3 | 3 | 1.0000 | 3 | 1.0000 |
| 0.90–1.00 | 1 | 0 | 0.0000 | 0 | 0.0000 |

