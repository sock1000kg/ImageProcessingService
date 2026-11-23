# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-192525-fixed-3w-web2cpu

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
| **Start Time** | 2026-11-22T19:25:27Z |
| **End Time** | 2026-11-22T19:28:12Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 150.94 s |
| **Throughput (end-to-end)** | **1481.16 images/min** |
| **Drain Throughput** | **1490.66 images/min** |
| **Throughput per Worker** | **493.72 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 65.0 ms | 201.8 ms | 2415.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 52.17 s (52173 ms) | 69.32 s (69316 ms) | 71.39 s (71386 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 891 mCPU | 753 mCPU |
| **Memory (RAM)** | 1274.0 MiB | 1218.7 MiB |

**CPU (counters)**: 797 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 67.0 ms | 193.1 ms |
| **VN plates** | 30 | 56.5 ms | 76.1 ms |
