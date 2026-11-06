# Benchmark Summary: 20261105-162259-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-05T16:23:53Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:bench-yolo26-20261105` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-05T16:23:01Z |
| **End Time** | 2026-11-05T16:25:32Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 120.93 s |
| **Throughput (end-to-end)** | **49.62 images/min** |
| **Drain Throughput** | **68.46 images/min** |
| **Throughput per Worker** | **24.81 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1489.0 ms | 2443.4 ms | 4430.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 68.65 s (68654 ms) | 95.03 s (95033 ms) | 98.11 s (98115 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 961 mCPU | 923 mCPU |
| **Memory (RAM)** | 912.0 MiB | 770.5 MiB |

**CPU (counters)**: 924 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1499.5 ms | 2447.9 ms |
| **VN plates** | 30 | 1317.0 ms | 2064.8 ms |
