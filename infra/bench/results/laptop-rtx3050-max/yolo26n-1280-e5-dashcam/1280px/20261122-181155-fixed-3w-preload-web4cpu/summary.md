# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-181155-fixed-3w-preload-web4cpu

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-22T18:13:22Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T18:11:57Z |
| **End Time** | 2026-11-22T18:15:52Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 189.95 s |
| **Throughput (end-to-end)** | **1176.92 images/min** |
| **Drain Throughput** | **1645.67 images/min** |
| **Throughput per Worker** | **392.31 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 61.0 ms | 207.0 ms | 5882.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 102.71 s (102714 ms) | 140.63 s (140635 ms) | 143.24 s (143239 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 916 mCPU | 879 mCPU |
| **Memory (RAM)** | 1313.0 MiB | 1285.2 MiB |

**CPU (counters)**: 865 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 61.5 ms | 251.6 ms |
| **VN plates** | 30 | 59.0 ms | 95.3 ms |
