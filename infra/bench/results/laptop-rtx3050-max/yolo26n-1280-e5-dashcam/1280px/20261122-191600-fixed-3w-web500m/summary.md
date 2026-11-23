# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-191600-fixed-3w-web500m

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T19:16:03Z |
| **End Time** | 2026-11-22T19:20:11Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 221.31 s |
| **Throughput (end-to-end)** | **1010.15 images/min** |
| **Drain Throughput** | **1024.76 images/min** |
| **Throughput per Worker** | **336.72 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 61.0 ms | 204.5 ms | 2275.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 81.47 s (81468 ms) | 101.29 s (101289 ms) | 103.56 s (103555 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 897 mCPU | 553 mCPU |
| **Memory (RAM)** | 1326.0 MiB | 1294.6 MiB |

**CPU (counters)**: 503 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 72.0 ms | 285.5 ms |
| **VN plates** | 30 | 57.5 ms | 83.1 ms |
