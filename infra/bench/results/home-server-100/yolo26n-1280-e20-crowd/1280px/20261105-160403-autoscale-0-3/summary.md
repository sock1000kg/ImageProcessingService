# Benchmark Summary: 20261105-160403-autoscale-0-3

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
| **Start Time** | 2026-11-05T16:04:05Z |
| **End Time** | 2026-11-05T16:06:04Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 71.66 s |
| **Throughput (end-to-end)** | **83.73 images/min** |
| **Drain Throughput** | **134.51 images/min** |
| **Throughput per Worker** | **27.91 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1041.0 ms | 1810.8 ms | 4403.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 42.47 s (42470 ms) | 47.54 s (47536 ms) | 48.96 s (48959 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 947 mCPU | 322 mCPU |
| **Memory (RAM)** | 925.0 MiB | 742.3 MiB |

**CPU (counters)**: 322 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1068.5 ms | 1787.5 ms |
| **VN plates** | 30 | 879.5 ms | 1813.0 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 16.23 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 121.57 s |
