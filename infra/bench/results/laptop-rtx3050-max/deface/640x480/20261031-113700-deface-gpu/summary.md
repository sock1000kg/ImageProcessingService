# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | GPU |
| **ONNX Execution Provider** | `CUDAExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | max |
| **Threshold** | 0.05 |
| **Scale** | 640x480 |
| **Images Count** | 3726 |
| **Start Time** | 2026-10-31T11:37:00.633127+00:00 |
| **End Time** | 2026-10-31T11:43:26.832925+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 1.078 s |
| **Total Duration (3726 images)** | 384.56 s |
| **Throughput** | **581.33 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 39.6 ms |
| **p95** | 291.2 ms |
| **Max** | 9618.4 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
