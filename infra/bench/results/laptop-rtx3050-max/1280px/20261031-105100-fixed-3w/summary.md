# Benchmark Summary: 20261031-105100-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:52:09Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:51:01Z |
| **End Time** | 2026-10-31T10:54:25Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 173.72 s |
| **Throughput (end-to-end)** | **1286.91 images/min** |
| **Drain Throughput** | **1892.99 images/min** |
| **Throughput per Worker** | **428.97 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 71.0 ms | 99.0 ms | 3427.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 90.71 s (90708 ms) | 120.24 s (120244 ms) | 123.60 s (123599 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 866 mCPU | 837 mCPU |
| **Memory (RAM)** | 1297.0 MiB | 1216.1 MiB |

**CPU (counters)**: 809 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 71.0 ms | 103.3 ms |
| **VN plates** | 30 | 68.5 ms | 99.4 ms |
