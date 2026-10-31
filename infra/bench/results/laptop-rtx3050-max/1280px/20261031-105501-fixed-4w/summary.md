# Benchmark Summary: 20261031-105501-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:56:02Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:55:02Z |
| **End Time** | 2026-10-31T11:02:20Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 420.78 s |
| **Throughput (end-to-end)** | **531.30 images/min** |
| **Drain Throughput** | **624.31 images/min** |
| **Throughput per Worker** | **132.83 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 68.0 ms | 1753.5 ms | 43969.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 231.72 s (231718 ms) | 352.21 s (352212 ms) | 365.03 s (365034 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1000 mCPU | 945 mCPU |
| **Memory (RAM)** | 1286.0 MiB | 1218.7 MiB |

**CPU (counters)**: 929 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 80.5 ms | 1541.7 ms |
| **VN plates** | 30 | 65.0 ms | 2253.3 ms |
