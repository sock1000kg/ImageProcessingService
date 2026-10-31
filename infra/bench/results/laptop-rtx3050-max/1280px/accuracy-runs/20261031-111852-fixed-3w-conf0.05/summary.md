# Benchmark Summary: 20261031-111852-fixed-3w-conf0.05

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T11:20:02Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T11:18:54Z |
| **End Time** | 2026-10-31T11:22:16Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 173.10 s |
| **Throughput (end-to-end)** | **1291.51 images/min** |
| **Drain Throughput** | **1886.04 images/min** |
| **Throughput per Worker** | **430.50 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 72.0 ms | 106.0 ms | 3220.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 91.47 s (91466 ms) | 121.60 s (121604 ms) | 124.81 s (124812 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 877 mCPU | 863 mCPU |
| **Memory (RAM)** | 1287.0 MiB | 1219.0 MiB |

**CPU (counters)**: 841 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 74.0 ms | 115.9 ms |
| **VN plates** | 30 | 71.0 ms | 100.0 ms |
