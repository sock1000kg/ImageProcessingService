# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | GPU |
| **ONNX Execution Provider** | `CUDAExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | small |
| **Threshold** | 0.05 |
| **Scale** | full (native resolution) |
| **Images Count** | 100 |
| **Start Time** | 2026-10-31T07:39:22.664514+00:00 |
| **End Time** | 2026-10-31T07:39:47.560029+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 1.360 s |
| **Total Duration (100 images)** | 23.52 s |
| **Throughput** | **255.13 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 89.7 ms |
| **p95** | 1078.5 ms |
| **Max** | 3806.3 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
