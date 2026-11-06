# Benchmark Summary: 20261105-160036-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-05T16:01:42Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:bench-yolo26-20261105` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-05T16:00:38Z |
| **End Time** | 2026-11-05T16:03:54Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 148.92 s |
| **Throughput (end-to-end)** | **40.29 images/min** |
| **Drain Throughput** | **72.77 images/min** |
| **Throughput per Worker** | **20.14 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1034.0 ms | 2000.2 ms | 19215.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 108.10 s (108100 ms) | 127.07 s (127072 ms) | 129.00 s (129005 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 924 mCPU | 543 mCPU |
| **Memory (RAM)** | 1092.0 MiB | 659.1 MiB |

**CPU (counters)**: 762 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1062.0 ms | 1977.5 ms |
| **VN plates** | 30 | 1009.0 ms | 1862.3 ms |
