# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | CPU |
| **ONNX Execution Provider** | `CPUExecutionProvider` |
| **Machine / Node** | laptop-rtx3050 (16 CPU threads) |
| **Dataset** | max |
| **Threshold** | 0.2 |
| **Scale** | full (native resolution) |
| **Images Count** | 3726 |
| **Start Time** | 2026-11-05T15:59:08.833883+00:00 |
| **End Time** | 2026-11-05T16:11:50.717440+00:00 |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | 0.320 s |
| **Total Duration (3726 images)** | 761.44 s |
| **Throughput** | **293.60 images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | 171.4 ms |
| **p95** | 374.7 ms |
| **Max** | 1519.9 ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
