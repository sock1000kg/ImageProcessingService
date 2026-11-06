# Benchmark Summary: 20261105-161036-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
| **Dataset** | small |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:bench-yolo26-20261105` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-05T16:10:38Z |
| **End Time** | 2026-11-05T16:12:07Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 51.97 s |
| **Throughput (end-to-end)** | **115.45 images/min** |
| **Drain Throughput** | **147.68 images/min** |
| **Throughput per Worker** | **38.48 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 732.5 ms | 1541.0 ms | 4307.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 27.40 s (27398 ms) | 29.16 s (29160 ms) | 30.57 s (30567 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 926 mCPU | 282 mCPU |
| **Memory (RAM)** | 730.0 MiB | 622.0 MiB |

**CPU (counters)**: 282 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 811.5 ms | 1608.1 ms |
| **VN plates** | 30 | 534.0 ms | 1078.2 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 10.27 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 117.30 s |
