# Benchmark Summary: 20261105-162540-autoscale-0-3

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
| **Start Time** | 2026-11-05T16:25:43Z |
| **End Time** | 2026-11-05T16:27:44Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 86.09 s |
| **Throughput (end-to-end)** | **69.69 images/min** |
| **Drain Throughput** | **91.08 images/min** |
| **Throughput per Worker** | **23.23 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1446.0 ms | 2480.8 ms | 5499.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 54.48 s (54484 ms) | 65.24 s (65243 ms) | 68.14 s (68142 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 971 mCPU | 455 mCPU |
| **Memory (RAM)** | 937.0 MiB | 795.7 MiB |

**CPU (counters)**: 455 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1568.5 ms | 2896.3 ms |
| **VN plates** | 30 | 1079.5 ms | 2110.3 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 16.90 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 103.81 s |
