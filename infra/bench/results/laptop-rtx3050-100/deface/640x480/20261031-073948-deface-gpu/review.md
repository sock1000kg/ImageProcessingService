# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-073948-deface-gpu`
- **Dataset**: `small` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 70
- **Ground Truth Targets**: 786 valid targets (487 with width ≥ 16 px)
- **Leaky Images (All)**: 25 / 70 (35.7%)
- **Leaky Images (≥16 px)**: 19 / 70 (27.1%)
- **Silent Misses (All)**: 1 / 25 leaky images (4.0%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 0 / 19 leaky images (0.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 25 | 0.0000 | 0.0000 | 0 / 19 | 0.0000 | 0.0000 |
| 0.40 | 16 | 0.2286 | 13 / 25 | 0.5200 | 0.8125 | 12 / 19 | 0.6316 | 0.7500 |
| 0.45 | 20 | 0.2857 | 15 / 25 | 0.6000 | 0.7500 | 14 / 19 | 0.7368 | 0.7000 |
| **0.50 (default)** | 23 | 0.3286 | 17 / 25 | 0.6800 | 0.7391 | 16 / 19 | 0.8421 | 0.6957 |
| 0.55 | 27 | 0.3857 | 19 / 25 | 0.7600 | 0.7037 | 17 / 19 | 0.8947 | 0.6296 |
| 0.60 | 30 | 0.4286 | 21 / 25 | 0.8400 | 0.7000 | 19 / 19 | 1.0000 | 0.6333 |
| 0.65 | 33 | 0.4714 | 21 / 25 | 0.8400 | 0.6364 | 19 / 19 | 1.0000 | 0.5758 |
| 0.70 | 35 | 0.5000 | 22 / 25 | 0.8800 | 0.6286 | 19 / 19 | 1.0000 | 0.5429 |
| 0.75 | 42 | 0.6000 | 23 / 25 | 0.9200 | 0.5476 | 19 / 19 | 1.0000 | 0.4524 |
| 0.80 | 49 | 0.7000 | 23 / 25 | 0.9200 | 0.4694 | 19 / 19 | 1.0000 | 0.3878 |
| 0.85 | 56 | 0.8000 | 23 / 25 | 0.9200 | 0.4107 | 19 / 19 | 1.0000 | 0.3393 |
| 0.90 | 67 | 0.9571 | 23 / 25 | 0.9200 | 0.3433 | 19 / 19 | 1.0000 | 0.2836 |
| 0.95 | 68 | 0.9714 | 23 / 25 | 0.9200 | 0.3382 | 19 / 19 | 1.0000 | 0.2794 |
| *What-If (0.20 ≤ conf < 0.50)* | *34* | *0.4857* | *25 / 25* | *1.0000* | *0.7353* | *19 / 19* | *1.0000* | *0.5588* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 3997 | 19 | 0.0048 | 250 | 0.0625 |
| 0.10–0.20 | 1653 | 36 | 0.0218 | 245 | 0.1482 |
| 0.20–0.30 | 338 | 47 | 0.1391 | 112 | 0.3314 |
| 0.30–0.40 | 119 | 45 | 0.3782 | 70 | 0.5882 |
| 0.40–0.50 | 96 | 71 | 0.7396 | 85 | 0.8854 |
| 0.50–0.60 | 71 | 61 | 0.8592 | 66 | 0.9296 |
| 0.60–0.70 | 64 | 59 | 0.9219 | 63 | 0.9844 |
| 0.70–0.80 | 83 | 82 | 0.9880 | 83 | 1.0000 |
| 0.80–0.90 | 80 | 80 | 1.0000 | 80 | 1.0000 |
| 0.90–1.00 | 9 | 9 | 1.0000 | 9 | 1.0000 |

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

