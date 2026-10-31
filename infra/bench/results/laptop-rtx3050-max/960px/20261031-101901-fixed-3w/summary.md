# Benchmark Summary: 20261031-101901-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:20:06Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:19:03Z |
| **End Time** | 2026-10-31T10:21:54Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 157.28 s |
| **Throughput (end-to-end)** | **1421.46 images/min** |
| **Drain Throughput** | **2193.70 images/min** |
| **Throughput per Worker** | **473.82 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 51.0 ms | 71.0 ms | 3765.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 85.80 s (85804 ms) | 106.67 s (106665 ms) | 107.64 s (107637 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 819 mCPU | 753 mCPU |
| **Memory (RAM)** | 1254.0 MiB | 1225.8 MiB |

**CPU (counters)**: 751 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 53.0 ms | 71.5 ms |
| **VN plates** | 30 | 46.0 ms | 76.2 ms |
