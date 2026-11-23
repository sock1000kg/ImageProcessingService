# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-182946-fixed-3w-preload-wlplate-web4cpu

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-22T18:31:09Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T18:29:48Z |
| **End Time** | 2026-11-22T18:41:00Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 620.64 s |
| **Throughput (end-to-end)** | **360.21 images/min** |
| **Drain Throughput** | **391.62 images/min** |
| **Throughput per Worker** | **120.07 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 66.0 ms | 1908.8 ms | 9904.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 163.04 s (163040 ms) | 463.10 s (463100 ms) | 578.34 s (578344 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1011 mCPU | 974 mCPU |
| **Memory (RAM)** | 1452.0 MiB | 1359.9 MiB |

**CPU (counters)**: 969 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 55.5 ms | 684.8 ms |
| **VN plates** | 30 | 1645.5 ms | 2406.5 ms |
