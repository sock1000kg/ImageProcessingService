# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | CPU |
| **ONNX Execution Provider** | `CPUExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | small |
| **Threshold** | 0.2 |
| **Scale** | full (native resolution) |
| **Images Count** | 100 |
| **Start Time** | 2026-10-31T07:40:03.651061+00:00 |
| **End Time** | 2026-10-31T07:40:22.238953+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.150 s |
| **Total Duration (100 images)** | 18.43 s |
| **Throughput** | **325.50 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 163.4 ms |
| **p95** | 389.9 ms |
| **Max** | 534.2 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
