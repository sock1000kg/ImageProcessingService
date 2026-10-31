# Benchmark Summary: 20261031-101519-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:16:24Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:15:20Z |
| **End Time** | 2026-10-31T10:18:35Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 166.09 s |
| **Throughput (end-to-end)** | **1346.02 images/min** |
| **Drain Throughput** | **1983.23 images/min** |
| **Throughput per Worker** | **673.01 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 40.0 ms | 61.0 ms | 3093.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 85.97 s (85967 ms) | 114.71 s (114711 ms) | 118.38 s (118382 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 824 mCPU | 809 mCPU |
| **Memory (RAM)** | 1242.0 MiB | 1214.8 MiB |

**CPU (counters)**: 781 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 40.0 ms | 62.5 ms |
| **VN plates** | 30 | 40.0 ms | 84.7 ms |
