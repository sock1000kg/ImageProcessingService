# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-113700-deface-gpu`
- **Dataset**: `max` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 3226
- **Ground Truth Targets**: 39112 valid targets (19959 with width ≥ 16 px)
- **Leaky Images (All)**: 1319 / 3226 (40.9%)
- **Leaky Images (≥16 px)**: 1086 / 3226 (33.7%)
- **Silent Misses (All)**: 51 / 1319 leaky images (3.9%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 44 / 1086 leaky images (4.0%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 1319 | 0.0000 | 0.0000 | 0 / 1086 | 0.0000 | 0.0000 |
| 0.40 | 670 | 0.2077 | 558 / 1319 | 0.4230 | 0.8328 | 478 / 1086 | 0.4401 | 0.7134 |
| 0.45 | 944 | 0.2926 | 742 / 1319 | 0.5625 | 0.7860 | 623 / 1086 | 0.5737 | 0.6600 |
| **0.50 (default)** | 1131 | 0.3506 | 853 / 1319 | 0.6467 | 0.7542 | 717 / 1086 | 0.6602 | 0.6340 |
| 0.55 | 1278 | 0.3962 | 923 / 1319 | 0.6998 | 0.7222 | 765 / 1086 | 0.7044 | 0.5986 |
| 0.60 | 1432 | 0.4439 | 984 / 1319 | 0.7460 | 0.6872 | 815 / 1086 | 0.7505 | 0.5691 |
| 0.65 | 1578 | 0.4892 | 1025 / 1319 | 0.7771 | 0.6496 | 850 / 1086 | 0.7827 | 0.5387 |
| 0.70 | 1750 | 0.5425 | 1060 / 1319 | 0.8036 | 0.6057 | 878 / 1086 | 0.8085 | 0.5017 |
| 0.75 | 1961 | 0.6079 | 1085 / 1319 | 0.8226 | 0.5533 | 896 / 1086 | 0.8250 | 0.4569 |
| 0.80 | 2248 | 0.6968 | 1116 / 1319 | 0.8461 | 0.4964 | 923 / 1086 | 0.8499 | 0.4106 |
| 0.85 | 2601 | 0.8063 | 1143 / 1319 | 0.8666 | 0.4394 | 943 / 1086 | 0.8683 | 0.3626 |
| 0.90 | 2929 | 0.9079 | 1150 / 1319 | 0.8719 | 0.3926 | 949 / 1086 | 0.8738 | 0.3240 |
| 0.95 | 3055 | 0.9470 | 1152 / 1319 | 0.8734 | 0.3771 | 950 / 1086 | 0.8748 | 0.3110 |
| *What-If (0.20 ≤ conf < 0.50)* | *1645* | *0.5099* | *1154 / 1319* | *0.8749* | *0.7015* | *952 / 1086* | *0.8766* | *0.5787* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 148861 | 1303 | 0.0088 | 9939 | 0.0668 |
| 0.10–0.20 | 50218 | 1849 | 0.0368 | 7237 | 0.1441 |
| 0.20–0.30 | 9312 | 1480 | 0.1589 | 3012 | 0.3235 |
| 0.30–0.40 | 3755 | 1563 | 0.4162 | 2177 | 0.5798 |
| 0.40–0.50 | 2795 | 1913 | 0.6844 | 2244 | 0.8029 |
| 0.50–0.60 | 2642 | 2295 | 0.8687 | 2463 | 0.9322 |
| 0.60–0.70 | 2732 | 2627 | 0.9616 | 2674 | 0.9788 |
| 0.70–0.80 | 3904 | 3881 | 0.9941 | 3884 | 0.9949 |
| 0.80–0.90 | 3839 | 3833 | 0.9984 | 3831 | 0.9979 |
| 0.90–1.00 | 594 | 594 | 1.0000 | 594 | 1.0000 |

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

