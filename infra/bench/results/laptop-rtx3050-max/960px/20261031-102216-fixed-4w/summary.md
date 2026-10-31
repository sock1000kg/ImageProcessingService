# Benchmark Summary: 20261031-102216-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:23:26Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:22:17Z |
| **End Time** | 2026-10-31T10:25:23Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 166.89 s |
| **Throughput (end-to-end)** | **1339.57 images/min** |
| **Drain Throughput** | **2081.99 images/min** |
| **Throughput per Worker** | **334.89 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 65.0 ms | 90.0 ms | 7387.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 101.21 s (101214 ms) | 114.65 s (114653 ms) | 115.40 s (115400 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 809 mCPU | 755 mCPU |
| **Memory (RAM)** | 1232.0 MiB | 1168.3 MiB |

**CPU (counters)**: 699 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 64.5 ms | 85.0 ms |
| **VN plates** | 30 | 54.5 ms | 86.7 ms |
