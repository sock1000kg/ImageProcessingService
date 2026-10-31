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
| **Scale** | 640x480 |
| **Images Count** | 1000 |
| **Start Time** | 2026-10-31T09:32:26.549627+00:00 |
| **End Time** | 2026-10-31T09:33:45.265569+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.854 s |
| **Total Duration (1000 images)** | 77.73 s |
| **Throughput** | **771.91 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 37.0 ms |
| **p95** | 208.6 ms |
| **Max** | 2535.7 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
