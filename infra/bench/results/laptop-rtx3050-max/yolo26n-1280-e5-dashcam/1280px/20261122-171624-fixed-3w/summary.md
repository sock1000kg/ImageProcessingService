# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-171624-fixed-3w

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
| **Start Time** | 2026-11-22T17:16:26Z |
| **End Time** | 2026-11-22T17:19:47Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 157.31 s |
| **Throughput (end-to-end)** | **1421.11 images/min** |
| **Drain Throughput** | **1430.38 images/min** |
| **Throughput per Worker** | **473.70 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 65.0 ms | 214.0 ms | 2683.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 55.63 s (55628 ms) | 70.59 s (70589 ms) | 71.73 s (71735 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 906 mCPU | 683 mCPU |
| **Memory (RAM)** | 1337.0 MiB | 1186.5 MiB |

**CPU (counters)**: 778 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 64.0 ms | 199.8 ms |
| **VN plates** | 30 | 54.5 ms | 84.0 ms |
