# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-181559-fixed-3w-preload-wlface-web4cpu

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-22T18:17:16Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T18:16:01Z |
| **End Time** | 2026-11-22T18:29:39Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 774.37 s |
| **Throughput (end-to-end)** | **288.70 images/min** |
| **Drain Throughput** | **308.76 images/min** |
| **Throughput per Worker** | **96.23 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 310.0 ms | 1523.5 ms | 10830.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 496.82 s (496816 ms) | 720.69 s (720693 ms) | 730.15 s (730147 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1004 mCPU | 996 mCPU |
| **Memory (RAM)** | 1532.0 MiB | 1436.2 MiB |

**CPU (counters)**: 994 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 358.5 ms | 1631.0 ms |
| **VN plates** | 30 | 112.5 ms | 359.4 ms |
