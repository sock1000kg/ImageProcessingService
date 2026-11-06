# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-163221-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-05T16:33:18Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T16:32:23Z |
| **End Time** | 2026-11-05T16:36:06Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 215.54 s |
| **Throughput (end-to-end)** | **1037.18 images/min** |
| **Drain Throughput** | **1457.18 images/min** |
| **Throughput per Worker** | **345.73 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 51.0 ms | 92.0 ms | 22173.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 132.22 s (132215 ms) | 163.35 s (163352 ms) | 164.80 s (164797 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 774 mCPU | 637 mCPU |
| **Memory (RAM)** | 1150.0 MiB | 1032.1 MiB |

**CPU (counters)**: 594 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 55.0 ms | 126.6 ms |
| **VN plates** | 30 | 41.5 ms | 70.7 ms |
