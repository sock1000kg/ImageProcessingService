# Benchmark Summary: 20261105-160810-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-05T16:09:00Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:bench-yolo26-20261105` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-05T16:08:12Z |
| **End Time** | 2026-11-05T16:10:28Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 102.79 s |
| **Throughput (end-to-end)** | **58.37 images/min** |
| **Drain Throughput** | **98.06 images/min** |
| **Throughput per Worker** | **29.19 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 775.0 ms | 1555.6 ms | 11625.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 70.25 s (70255 ms) | 81.69 s (81695 ms) | 83.01 s (83011 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 856 mCPU | 611 mCPU |
| **Memory (RAM)** | 648.0 MiB | 499.3 MiB |

**CPU (counters)**: 817 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 824.0 ms | 1703.8 ms |
| **VN plates** | 30 | 626.5 ms | 1041.7 ms |
