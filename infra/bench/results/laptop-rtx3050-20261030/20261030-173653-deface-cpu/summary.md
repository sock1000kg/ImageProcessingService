# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | CPU |
| **ONNX Execution Provider** | `CPUExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Images Count** | 100 |
| **Start Time** | 2026-10-30T17:36:53.275412+00:00 |
| **End Time** | 2026-10-30T17:37:10.274042+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.134 s |
| **Total Duration (100 images)** | 16.86 s |
| **Throughput** | **355.86 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 149.9 ms |
| **p95** | 342.5 ms |
| **Max** | 481.9 ms |

> **Note**: faces only (no plates), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time.
