# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-111852-fixed-3w-conf0.05`
- **Dataset**: `max` (1280px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 3226
- **Ground Truth Targets**: 39112 valid targets (19959 with width ≥ 16 px)
- **Leaky Images (All)**: 1988 / 3226 (61.6%)
- **Leaky Images (≥16 px)**: 1904 / 3226 (59.0%)
- **Silent Misses (All)**: 310 / 1988 leaky images (15.6%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 253 / 1904 leaky images (13.3%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 1988 | 0.0000 | 0.0000 | 0 / 1904 | 0.0000 | 0.0000 |
| 0.40 | 518 | 0.1606 | 410 / 1988 | 0.2062 | 0.7915 | 406 / 1904 | 0.2132 | 0.7838 |
| 0.45 | 741 | 0.2297 | 540 / 1988 | 0.2716 | 0.7287 | 532 / 1904 | 0.2794 | 0.7179 |
| **0.50 (default)** | 890 | 0.2759 | 609 / 1988 | 0.3063 | 0.6843 | 599 / 1904 | 0.3146 | 0.6730 |
| 0.55 | 1015 | 0.3146 | 652 / 1988 | 0.3280 | 0.6424 | 642 / 1904 | 0.3372 | 0.6325 |
| 0.60 | 1138 | 0.3528 | 683 / 1988 | 0.3436 | 0.6002 | 671 / 1904 | 0.3524 | 0.5896 |
| 0.65 | 1257 | 0.3896 | 705 / 1988 | 0.3546 | 0.5609 | 692 / 1904 | 0.3634 | 0.5505 |
| 0.70 | 1382 | 0.4284 | 724 / 1988 | 0.3642 | 0.5239 | 711 / 1904 | 0.3734 | 0.5145 |
| 0.75 | 1525 | 0.4727 | 739 / 1988 | 0.3717 | 0.4846 | 724 / 1904 | 0.3803 | 0.4748 |
| 0.80 | 1685 | 0.5223 | 753 / 1988 | 0.3788 | 0.4469 | 738 / 1904 | 0.3876 | 0.4380 |
| 0.85 | 1890 | 0.5859 | 760 / 1988 | 0.3823 | 0.4021 | 745 / 1904 | 0.3913 | 0.3942 |
| 0.90 | 1994 | 0.6181 | 764 / 1988 | 0.3843 | 0.3831 | 749 / 1904 | 0.3934 | 0.3756 |
| 0.95 | 1998 | 0.6193 | 764 / 1988 | 0.3843 | 0.3824 | 749 / 1904 | 0.3934 | 0.3749 |
| *What-If (0.20 ≤ conf < 0.50)* | *1475* | *0.4572* | *1140 / 1988* | *0.5734* | *0.7729* | *1129 / 1904* | *0.5930* | *0.7654* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 5067 | 2741 | 0.5410 | 3629 | 0.7162 |
| 0.10–0.20 | 4360 | 3273 | 0.7507 | 3613 | 0.8287 |
| 0.20–0.30 | 2600 | 2259 | 0.8688 | 2320 | 0.8923 |
| 0.30–0.40 | 1887 | 1771 | 0.9385 | 1777 | 0.9417 |
| 0.40–0.50 | 1363 | 1300 | 0.9538 | 1306 | 0.9582 |
| 0.50–0.60 | 1130 | 1110 | 0.9823 | 1108 | 0.9805 |
| 0.60–0.70 | 1086 | 1075 | 0.9899 | 1072 | 0.9871 |
| 0.70–0.80 | 1066 | 1058 | 0.9925 | 1058 | 0.9925 |
| 0.80–0.90 | 715 | 715 | 1.0000 | 714 | 0.9986 |
| 0.90–1.00 | 7 | 7 | 1.0000 | 7 | 1.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 500
- **Ground Truth Targets**: 500 valid targets (500 with width ≥ 16 px)
- **Leaky Images (All)**: 366 / 500 (73.2%)
- **Leaky Images (≥16 px)**: 366 / 500 (73.2%)
- **Silent Misses (All)**: 98 / 366 leaky images (26.8%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 98 / 366 leaky images (26.8%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.40 | 12 | 0.0240 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.45 | 45 | 0.0900 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| **0.50 (default)** | 63 | 0.1260 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.55 | 93 | 0.1860 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.60 | 99 | 0.1980 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.65 | 110 | 0.2200 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.70 | 116 | 0.2320 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.75 | 121 | 0.2420 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.80 | 128 | 0.2560 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.85 | 132 | 0.2640 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.90 | 134 | 0.2680 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| 0.95 | 134 | 0.2680 | 0 / 366 | 0.0000 | 0.0000 | 0 / 366 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *179* | *0.3580* | *108 / 366* | *0.2951* | *0.6034* | *108 / 366* | *0.2951* | *0.6034* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 147 | 74 | 0.5034 | 126 | 0.8571 |
| 0.10–0.20 | 138 | 92 | 0.6667 | 131 | 0.9493 |
| 0.20–0.30 | 91 | 73 | 0.8022 | 88 | 0.9670 |
| 0.30–0.40 | 46 | 42 | 0.9130 | 46 | 1.0000 |
| 0.40–0.50 | 51 | 47 | 0.9216 | 51 | 1.0000 |
| 0.50–0.60 | 36 | 33 | 0.9167 | 36 | 1.0000 |
| 0.60–0.70 | 20 | 17 | 0.8500 | 20 | 1.0000 |
| 0.70–0.80 | 16 | 14 | 0.8750 | 15 | 0.9375 |
| 0.80–0.90 | 8 | 8 | 1.0000 | 8 | 1.0000 |
| 0.90–1.00 | 1 | 0 | 0.0000 | 0 | 0.0000 |

