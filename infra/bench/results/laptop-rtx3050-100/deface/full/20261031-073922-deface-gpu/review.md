# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-073922-deface-gpu`
- **Dataset**: `small` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 70
- **Ground Truth Targets**: 786 valid targets (487 with width ≥ 16 px)
- **Leaky Images (All)**: 24 / 70 (34.3%)
- **Leaky Images (≥16 px)**: 17 / 70 (24.3%)
- **Silent Misses (All)**: 0 / 24 leaky images (0.0%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 0 / 17 leaky images (0.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 24 | 0.0000 | 0.0000 | 0 / 17 | 0.0000 | 0.0000 |
| 0.40 | 17 | 0.2429 | 16 / 24 | 0.6667 | 0.9412 | 11 / 17 | 0.6471 | 0.6471 |
| 0.45 | 19 | 0.2714 | 17 / 24 | 0.7083 | 0.8947 | 12 / 17 | 0.7059 | 0.6316 |
| **0.50 (default)** | 20 | 0.2857 | 18 / 24 | 0.7500 | 0.9000 | 13 / 17 | 0.7647 | 0.6500 |
| 0.55 | 22 | 0.3143 | 18 / 24 | 0.7500 | 0.8182 | 13 / 17 | 0.7647 | 0.5909 |
| 0.60 | 27 | 0.3857 | 21 / 24 | 0.8750 | 0.7778 | 16 / 17 | 0.9412 | 0.5926 |
| 0.65 | 29 | 0.4143 | 22 / 24 | 0.9167 | 0.7586 | 17 / 17 | 1.0000 | 0.5862 |
| 0.70 | 35 | 0.5000 | 23 / 24 | 0.9583 | 0.6571 | 17 / 17 | 1.0000 | 0.4857 |
| 0.75 | 38 | 0.5429 | 23 / 24 | 0.9583 | 0.6053 | 17 / 17 | 1.0000 | 0.4474 |
| 0.80 | 45 | 0.6429 | 24 / 24 | 1.0000 | 0.5333 | 17 / 17 | 1.0000 | 0.3778 |
| 0.85 | 56 | 0.8000 | 24 / 24 | 1.0000 | 0.4286 | 17 / 17 | 1.0000 | 0.3036 |
| 0.90 | 64 | 0.9143 | 24 / 24 | 1.0000 | 0.3750 | 17 / 17 | 1.0000 | 0.2656 |
| 0.95 | 69 | 0.9857 | 24 / 24 | 1.0000 | 0.3478 | 17 / 17 | 1.0000 | 0.2464 |
| *What-If (0.20 ≤ conf < 0.50)* | *31* | *0.4429* | *24 / 24* | *1.0000* | *0.7742* | *17 / 17* | *1.0000* | *0.5484* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 4144 | 22 | 0.0053 | 169 | 0.0408 |
| 0.10–0.20 | 1510 | 36 | 0.0238 | 142 | 0.0940 |
| 0.20–0.30 | 272 | 44 | 0.1618 | 66 | 0.2426 |
| 0.30–0.40 | 128 | 42 | 0.3281 | 70 | 0.5469 |
| 0.40–0.50 | 80 | 52 | 0.6500 | 62 | 0.7750 |
| 0.50–0.60 | 88 | 76 | 0.8636 | 83 | 0.9432 |
| 0.60–0.70 | 93 | 89 | 0.9570 | 89 | 0.9570 |
| 0.70–0.80 | 102 | 102 | 1.0000 | 102 | 1.0000 |
| 0.80–0.90 | 122 | 122 | 1.0000 | 122 | 1.0000 |
| 0.90–1.00 | 37 | 37 | 1.0000 | 37 | 1.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 30
- **Ground Truth Targets**: 30 valid targets (30 with width ≥ 16 px)
- **Leaky Images (All)**: 30 / 30 (100.0%)
- **Leaky Images (≥16 px)**: 30 / 30 (100.0%)
- **Silent Misses (All)**: 30 / 30 leaky images (100.0%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 30 / 30 leaky images (100.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.40 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.45 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| **0.50 (default)** | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.55 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.60 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.65 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.70 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.75 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.80 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.85 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.90 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| 0.95 | 0 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 | 0 / 30 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *0* | *0.0000* | *0 / 30* | *0.0000* | *0.0000* | *0 / 30* | *0.0000* | *0.0000* |

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

