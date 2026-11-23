# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-170754-fixed-2w-preload

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-22T17:08:18Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-22T17:07:57Z |
| **End Time** | 2026-11-22T17:09:41Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 98.03 s |
| **Throughput (end-to-end)** | **61.21 images/min** |
| **Drain Throughput** | **85.35 images/min** |
| **Throughput per Worker** | **30.60 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1047.5 ms | 2104.5 ms | 4390.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 55.57 s (55569 ms) | 76.39 s (76393 ms) | 79.13 s (79126 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 940 mCPU | 890 mCPU |
| **Memory (RAM)** | 870.0 MiB | 697.6 MiB |

**CPU (counters)**: 892 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1051.0 ms | 2114.6 ms |
| **VN plates** | 30 | 1033.0 ms | 1753.8 ms |
