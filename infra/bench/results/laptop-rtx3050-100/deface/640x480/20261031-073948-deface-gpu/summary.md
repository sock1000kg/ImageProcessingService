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
| **Scale** | 640x480 |
| **Images Count** | 100 |
| **Start Time** | 2026-10-31T07:39:48.722950+00:00 |
| **End Time** | 2026-10-31T07:40:02.870192+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.597 s |
| **Total Duration (100 images)** | 13.52 s |
| **Throughput** | **443.63 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 34.7 ms |
| **p95** | 752.9 ms |
| **Max** | 3349.2 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
