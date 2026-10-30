# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | GPU |
| **ONNX Execution Provider** | `CUDAExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Images Count** | 100 |
| **Start Time** | 2026-10-30T17:36:30.330477+00:00 |
| **End Time** | 2026-10-30T17:36:41.025659+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 1.184 s |
| **Total Duration (100 images)** | 9.51 s |
| **Throughput** | **631.15 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 78.5 ms |
| **p95** | 140.0 ms |
| **Max** | 1134.1 ms |

> **Note**: faces only (no plates), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time.
