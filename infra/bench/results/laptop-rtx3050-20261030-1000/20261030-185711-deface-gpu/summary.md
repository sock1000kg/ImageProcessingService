# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | GPU |
| **ONNX Execution Provider** | `CUDAExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | large |
| **Images Count** | 1000 |
| **Start Time** | 2026-10-30T18:57:12.325532+00:00 |
| **End Time** | 2026-10-30T18:58:42.574390+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 1.805 s |
| **Total Duration (1000 images)** | 88.41 s |
| **Throughput** | **678.68 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 80.4 ms |
| **p95** | 137.8 ms |
| **Max** | 2730.3 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
