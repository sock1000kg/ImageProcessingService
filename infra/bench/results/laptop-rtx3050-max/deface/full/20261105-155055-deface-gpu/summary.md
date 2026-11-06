# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | GPU |
| **ONNX Execution Provider** | `CUDAExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | max |
| **Threshold** | 0.2 |
| **Scale** | full (native resolution) |
| **Images Count** | 3726 |
| **Start Time** | 2026-11-05T15:50:56.412521+00:00 |
| **End Time** | 2026-11-05T15:57:03.669111+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 2.874 s |
| **Total Duration (3726 images)** | 364.25 s |
| **Throughput** | **613.76 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 88.6 ms |
| **p95** | 153.0 ms |
| **Max** | 3310.5 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
