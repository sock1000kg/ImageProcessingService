# Benchmark Summary: 20261031-093639-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:37:33Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T09:36:40Z |
| **End Time** | 2026-10-31T09:40:51Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 234.60 s |
| **Throughput (end-to-end)** | **952.94 images/min** |
| **Drain Throughput** | **1248.28 images/min** |
| **Throughput per Worker** | **952.94 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 32.0 ms | 45.0 ms | 3580.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 122.23 s (122234 ms) | 179.73 s (179726 ms) | 186.34 s (186340 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 831 mCPU | 815 mCPU |
| **Memory (RAM)** | 1251.0 MiB | 1239.5 MiB |

**CPU (counters)**: 817 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 33.0 ms | 43.0 ms |
| **VN plates** | 30 | 29.0 ms | 52.6 ms |
