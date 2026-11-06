# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-175432-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T17:54:34Z |
| **End Time** | 2026-11-05T17:57:31Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 149.05 s |
| **Throughput (end-to-end)** | **1499.93 images/min** |
| **Drain Throughput** | **1507.40 images/min** |
| **Throughput per Worker** | **499.98 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 74.0 ms | 106.0 ms | 3561.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 60.51 s (60514 ms) | 66.85 s (66854 ms) | 67.90 s (67904 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 817 mCPU | 261 mCPU |
| **Memory (RAM)** | 1339.0 MiB | 1282.1 MiB |

**CPU (counters)**: 681 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 72.5 ms | 104.0 ms |
| **VN plates** | 30 | 74.0 ms | 93.3 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 277.87 s |
