# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | CPU |
| **ONNX Execution Provider** | `CPUExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | large |
| **Images Count** | 1000 |
| **Start Time** | 2026-10-30T18:58:44.084456+00:00 |
| **End Time** | 2026-10-30T19:01:31.691204+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.178 s |
| **Total Duration (1000 images)** | 167.39 s |
| **Throughput** | **358.44 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 151.1 ms |
| **p95** | 332.4 ms |
| **Max** | 917.3 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
