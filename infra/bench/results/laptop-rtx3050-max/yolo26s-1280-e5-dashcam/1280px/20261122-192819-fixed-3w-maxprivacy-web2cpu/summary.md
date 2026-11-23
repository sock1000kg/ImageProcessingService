# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-192819-fixed-3w-maxprivacy-web2cpu

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
| **Start Time** | 2026-11-22T19:28:21Z |
| **End Time** | 2026-11-22T19:32:12Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 190.44 s |
| **Throughput (end-to-end)** | **1173.91 images/min** |
| **Drain Throughput** | **1179.83 images/min** |
| **Throughput per Worker** | **391.30 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 103.0 ms | 254.0 ms | 4584.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 61.47 s (61466 ms) | 108.57 s (108566 ms) | 113.40 s (113399 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 954 mCPU | 759 mCPU |
| **Memory (RAM)** | 1347.0 MiB | 1256.4 MiB |

**CPU (counters)**: 839 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 106.0 ms | 351.9 ms |
| **VN plates** | 30 | 97.0 ms | 165.4 ms |
