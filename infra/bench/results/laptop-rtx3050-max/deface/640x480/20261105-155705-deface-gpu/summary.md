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
| **Scale** | 640x480 |
| **Images Count** | 3726 |
| **Start Time** | 2026-11-05T15:57:06.221731+00:00 |
| **End Time** | 2026-11-05T15:59:07.097039+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 1.257 s |
| **Total Duration (3726 images)** | 119.46 s |
| **Throughput** | **1871.35 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 26.7 ms |
| **p95** | 60.7 ms |
| **Max** | 1605.6 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
