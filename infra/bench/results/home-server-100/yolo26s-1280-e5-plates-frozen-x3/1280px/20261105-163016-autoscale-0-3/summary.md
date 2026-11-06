# Benchmark Summary: 20261105-163016-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:bench-yolo26-20261105` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-05T16:30:19Z |
| **End Time** | 2026-11-05T16:32:19Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 112.68 s |
| **Throughput (end-to-end)** | **53.25 images/min** |
| **Drain Throughput** | **60.15 images/min** |
| **Throughput per Worker** | **17.75 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 2544.0 ms | 4037.6 ms | 7722.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 63.67 s (63672 ms) | 92.86 s (92862 ms) | 96.07 s (96069 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 979 mCPU | 508 mCPU |
| **Memory (RAM)** | 1035.0 MiB | 868.8 MiB |

**CPU (counters)**: 508 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 2633.0 ms | 4084.1 ms |
| **VN plates** | 30 | 2071.5 ms | 2979.2 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 10.87 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 113.20 s |
