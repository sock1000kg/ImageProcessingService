# Benchmark Summary: 20261031-104714-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:48:21Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:47:16Z |
| **End Time** | 2026-10-31T10:50:40Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 184.67 s |
| **Throughput (end-to-end)** | **1210.59 images/min** |
| **Drain Throughput** | **1707.23 images/min** |
| **Throughput per Worker** | **605.29 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 52.0 ms | 74.0 ms | 2951.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 96.83 s (96832 ms) | 132.13 s (132131 ms) | 136.46 s (136464 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 858 mCPU | 842 mCPU |
| **Memory (RAM)** | 1272.0 MiB | 1222.2 MiB |

**CPU (counters)**: 844 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 53.0 ms | 73.5 ms |
| **VN plates** | 30 | 50.5 ms | 76.8 ms |
