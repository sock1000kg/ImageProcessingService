# Benchmark Summary: 20261105-161407-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-05T16:14:50Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:bench-yolo26-20261105` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-05T16:14:10Z |
| **End Time** | 2026-11-05T16:18:07Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 213.66 s |
| **Throughput (end-to-end)** | **28.08 images/min** |
| **Drain Throughput** | **32.63 images/min** |
| **Throughput per Worker** | **14.04 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 3414.0 ms | 5479.0 ms | 7583.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 129.71 s (129713 ms) | 187.79 s (187790 ms) | 194.03 s (194031 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 990 mCPU | 963 mCPU |
| **Memory (RAM)** | 1102.0 MiB | 852.6 MiB |

**CPU (counters)**: 958 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 3772.5 ms | 5879.2 ms |
| **VN plates** | 30 | 2581.5 ms | 4003.7 ms |
