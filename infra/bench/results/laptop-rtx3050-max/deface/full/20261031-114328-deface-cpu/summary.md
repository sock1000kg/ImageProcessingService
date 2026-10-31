# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | CPU |
| **ONNX Execution Provider** | `CPUExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | max |
| **Threshold** | 0.2 |
| **Scale** | full (native resolution) |
| **Images Count** | 3726 |
| **Start Time** | 2026-10-31T11:43:28.304058+00:00 |
| **End Time** | 2026-10-31T11:55:03.530253+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.145 s |
| **Total Duration (3726 images)** | 694.93 s |
| **Throughput** | **321.70 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 161.8 ms |
| **p95** | 335.4 ms |
| **Max** | 2165.0 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
