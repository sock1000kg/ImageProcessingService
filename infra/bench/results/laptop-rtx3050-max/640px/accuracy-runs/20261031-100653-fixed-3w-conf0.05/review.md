# Review Warning Evaluation (`reviewThreshold` → `needsReview`)

- **Run**: `20261031-100653-fixed-3w-conf0.05`
- **Dataset**: `max` (640px input resolution)
- **Operating Threshold**: `0.35` (detections below are dropped by engine)
- **Default Review Threshold**: `0.5` (kept detections below raise `lowConfidence`)
- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)
- **Whitelist**: None (baseline benchmark without whitelist)

## Face Review Warning Evaluation (WIDER FACE subset)

### Overview
- **Images**: 3226
- **Ground Truth Targets**: 39112 valid targets (19959 with width ≥ 16 px)
- **Leaky Images (All)**: 2388 / 3226 (74.0%)
- **Leaky Images (≥16 px)**: 2313 / 3226 (71.7%)
- **Silent Misses (All)**: 839 / 2388 leaky images (35.1%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 768 / 2313 leaky images (33.2%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 2388 | 0.0000 | 0.0000 | 0 / 2313 | 0.0000 | 0.0000 |
| 0.40 | 303 | 0.0939 | 235 / 2388 | 0.0984 | 0.7756 | 231 / 2313 | 0.0999 | 0.7624 |
| 0.45 | 448 | 0.1389 | 313 / 2388 | 0.1311 | 0.6987 | 308 / 2313 | 0.1332 | 0.6875 |
| **0.50 (default)** | 562 | 0.1742 | 352 / 2388 | 0.1474 | 0.6263 | 346 / 2313 | 0.1496 | 0.6157 |
| 0.55 | 645 | 0.1999 | 369 / 2388 | 0.1545 | 0.5721 | 363 / 2313 | 0.1569 | 0.5628 |
| 0.60 | 737 | 0.2285 | 386 / 2388 | 0.1616 | 0.5237 | 380 / 2313 | 0.1643 | 0.5156 |
| 0.65 | 814 | 0.2523 | 400 / 2388 | 0.1675 | 0.4914 | 394 / 2313 | 0.1703 | 0.4840 |
| 0.70 | 905 | 0.2805 | 413 / 2388 | 0.1729 | 0.4564 | 407 / 2313 | 0.1760 | 0.4497 |
| 0.75 | 983 | 0.3047 | 417 / 2388 | 0.1746 | 0.4242 | 411 / 2313 | 0.1777 | 0.4181 |
| 0.80 | 1090 | 0.3379 | 421 / 2388 | 0.1763 | 0.3862 | 415 / 2313 | 0.1794 | 0.3807 |
| 0.85 | 1190 | 0.3689 | 422 / 2388 | 0.1767 | 0.3546 | 416 / 2313 | 0.1799 | 0.3496 |
| 0.90 | 1252 | 0.3881 | 423 / 2388 | 0.1771 | 0.3379 | 417 / 2313 | 0.1803 | 0.3331 |
| 0.95 | 1257 | 0.3896 | 423 / 2388 | 0.1771 | 0.3365 | 417 / 2313 | 0.1803 | 0.3317 |
| *What-If (0.20 ≤ conf < 0.50)* | *1046* | *0.3242* | *817 / 2388* | *0.3421* | *0.7811* | *811 / 2313* | *0.3506* | *0.7753* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 3437 | 2049 | 0.5962 | 2756 | 0.8019 |
| 0.10–0.20 | 2808 | 2262 | 0.8056 | 2519 | 0.8971 |
| 0.20–0.30 | 1413 | 1290 | 0.9130 | 1305 | 0.9236 |
| 0.30–0.40 | 1004 | 972 | 0.9681 | 970 | 0.9661 |
| 0.40–0.50 | 723 | 710 | 0.9820 | 710 | 0.9820 |
| 0.50–0.60 | 545 | 535 | 0.9817 | 532 | 0.9761 |
| 0.60–0.70 | 496 | 493 | 0.9940 | 494 | 0.9960 |
| 0.70–0.80 | 456 | 454 | 0.9956 | 454 | 0.9956 |
| 0.80–0.90 | 288 | 288 | 1.0000 | 288 | 1.0000 |
| 0.90–1.00 | 8 | 8 | 1.0000 | 8 | 1.0000 |

## License Plate Review Warning Evaluation (Vietnamese License Plates subset)

### Overview
- **Images**: 500
- **Ground Truth Targets**: 500 valid targets (500 with width ≥ 16 px)
- **Leaky Images (All)**: 431 / 500 (86.2%)
- **Leaky Images (≥16 px)**: 431 / 500 (86.2%)
- **Silent Misses (All)**: 111 / 431 leaky images (25.8%) have NO detection down to 0.05
- **Silent Misses (≥16 px)**: 111 / 431 leaky images (25.8%)

### Review Threshold Sweep

| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.35 | 0 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.40 | 17 | 0.0340 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.45 | 33 | 0.0660 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| **0.50 (default)** | 44 | 0.0880 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.55 | 52 | 0.1040 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.60 | 53 | 0.1060 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.65 | 62 | 0.1240 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.70 | 62 | 0.1240 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.75 | 67 | 0.1340 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.80 | 68 | 0.1360 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.85 | 68 | 0.1360 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.90 | 68 | 0.1360 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| 0.95 | 69 | 0.1380 | 0 / 431 | 0.0000 | 0.0000 | 0 / 431 | 0.0000 | 0.0000 |
| *What-If (0.20 ≤ conf < 0.50)* | *156* | *0.3120* | *111 / 431* | *0.2575* | *0.7115* | *111 / 431* | *0.2575* | *0.7115* |

*Note: The What-If row models the effect if detections between 0.20 and operating threshold (0.35) also raised the warning flag (clearly labelled scenario, not a recommendation).* 

### Calibration by Confidence Bin

| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |
| --- | --- | --- | --- | --- | --- |
| 0.05–0.10 | 161 | 90 | 0.5590 | 135 | 0.8385 |
| 0.10–0.20 | 150 | 115 | 0.7667 | 142 | 0.9467 |
| 0.20–0.30 | 84 | 77 | 0.9167 | 83 | 0.9881 |
| 0.30–0.40 | 54 | 50 | 0.9259 | 51 | 0.9444 |
| 0.40–0.50 | 27 | 27 | 1.0000 | 27 | 1.0000 |
| 0.50–0.60 | 10 | 9 | 0.9000 | 10 | 1.0000 |
| 0.60–0.70 | 9 | 9 | 1.0000 | 9 | 1.0000 |
| 0.70–0.80 | 6 | 6 | 1.0000 | 6 | 1.0000 |
| 0.80–0.90 | 0 | 0 | 0.0000 | 0 | 0.0000 |
| 0.90–1.00 | 1 | 1 | 1.0000 | 1 | 1.0000 |

