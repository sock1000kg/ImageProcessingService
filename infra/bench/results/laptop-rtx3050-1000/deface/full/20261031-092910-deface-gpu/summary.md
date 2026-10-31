# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | GPU |
| **ONNX Execution Provider** | `CUDAExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | large |
| **Threshold** | 0.05 |
| **Scale** | full (native resolution) |
| **Images Count** | 1000 |
| **Start Time** | 2026-10-31T09:29:10.893683+00:00 |
| **End Time** | 2026-10-31T09:32:24.994892+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 1.163 s |
| **Total Duration (1000 images)** | 192.79 s |
| **Throughput** | **311.21 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 91.3 ms |
| **p95** | 332.9 ms |
| **Max** | 13014.7 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
