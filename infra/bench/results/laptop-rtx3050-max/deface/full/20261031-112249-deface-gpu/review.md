# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-112249-deface-gpu`
- **Dataset**: `max` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 3226
- **Ground Truth Targets**: 39112 valid targets (19959 with width ≥ 16 px)
- **Leaky Images (All)**: 1141 / 3226 (35.4%)
- **Leaky Images (≥16 px)**: 854 / 3226 (26.5%)
- **Silent Misses (All)**: 44 / 1141 leaky images (3.9%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 45 / 854 leaky images (5.3%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 1141 | 0.0000 | 0.0000 | 0 / 854 | 0.0000 | 0.0000 |
| 0.40 | 694 | 0.2151 | 554 / 1141 | 0.4855 | 0.7983 | 386 / 854 | 0.4520 | 0.5562 |
| 0.45 | 929 | 0.2880 | 707 / 1141 | 0.6196 | 0.7610 | 501 / 854 | 0.5867 | 0.5393 |
| **0.50 (default)** | 1083 | 0.3357 | 788 / 1141 | 0.6906 | 0.7276 | 563 / 854 | 0.6593 | 0.5199 |
| 0.55 | 1220 | 0.3782 | 850 / 1141 | 0.7450 | 0.6967 | 616 / 854 | 0.7213 | 0.5049 |
| 0.60 | 1344 | 0.4166 | 899 / 1141 | 0.7879 | 0.6689 | 656 / 854 | 0.7681 | 0.4881 |
| 0.65 | 1475 | 0.4572 | 937 / 1141 | 0.8212 | 0.6353 | 685 / 854 | 0.8021 | 0.4644 |
| 0.70 | 1622 | 0.5028 | 969 / 1141 | 0.8493 | 0.5974 | 712 / 854 | 0.8337 | 0.4390 |
| 0.75 | 1822 | 0.5648 | 1005 / 1141 | 0.8808 | 0.5516 | 743 / 854 | 0.8700 | 0.4078 |
| 0.80 | 2086 | 0.6466 | 1039 / 1141 | 0.9106 | 0.4981 | 770 / 854 | 0.9016 | 0.3691 |
| 0.85 | 2436 | 0.7551 | 1061 / 1141 | 0.9299 | 0.4356 | 785 / 854 | 0.9192 | 0.3222 |
| 0.90 | 2835 | 0.8788 | 1080 / 1141 | 0.9465 | 0.3810 | 799 / 854 | 0.9356 | 0.2818 |
| 0.95 | 3099 | 0.9606 | 1082 / 1141 | 0.9483 | 0.3491 | 801 / 854 | 0.9379 | 0.2585 |
| *What-If (0.20 ≤ conf < 0.50)* | *1637* | *0.5074* | *1015 / 1141* | *0.8896* | *0.6200* | *744 / 854* | *0.8712* | *0.4545* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 174491 | 1484 | 0.0085 | 7396 | 0.0424 |
| 0.10–0.20 | 56550 | 2441 | 0.0432 | 6368 | 0.1126 |
| 0.20–0.30 | 11110 | 2121 | 0.1909 | 3313 | 0.2982 |
| 0.30–0.40 | 5148 | 2133 | 0.4143 | 2782 | 0.5404 |
| 0.40–0.50 | 3597 | 2445 | 0.6797 | 2813 | 0.7820 |
| 0.50–0.60 | 3334 | 2830 | 0.8488 | 3045 | 0.9133 |
| 0.60–0.70 | 3453 | 3289 | 0.9525 | 3353 | 0.9710 |
| 0.70–0.80 | 4629 | 4582 | 0.9898 | 4588 | 0.9911 |
| 0.80–0.90 | 5978 | 5958 | 0.9967 | 5959 | 0.9968 |
| 0.90–1.00 | 1685 | 1684 | 0.9994 | 1684 | 0.9994 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 500
- **Ground Truth Targets**: 500 valid targets (500 with width ≥ 16 px)
- **Leaky Images (All)**: 500 / 500 (100.0%)
- **Leaky Images (≥16 px)**: 500 / 500 (100.0%)
- **Silent Misses (All)**: 500 / 500 leaky images (100.0%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 500 / 500 leaky images (100.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.40 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.45 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| **0.50 (default)** | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.55 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.60 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.65 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.70 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.75 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.80 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.85 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.90 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| 0.95 | 0 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 | 0 / 500 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *0* | *0.0000* | *0 / 500* | *0.0000* | *0.0000* | *0 / 500* | *0.0000* | *0.0000* |

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

