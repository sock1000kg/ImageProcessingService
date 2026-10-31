# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | CPU |
| **ONNX Execution Provider** | `CPUExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | large |
| **Threshold** | 0.2 |
| **Scale** | full (native resolution) |
| **Images Count** | 1000 |
| **Start Time** | 2026-10-31T09:33:46.149028+00:00 |
| **End Time** | 2026-10-31T09:36:39.680415+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.140 s |
| **Total Duration (1000 images)** | 173.35 s |
| **Throughput** | **346.12 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 156.7 ms |
| **p95** | 348.2 ms |
| **Max** | 916.6 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
