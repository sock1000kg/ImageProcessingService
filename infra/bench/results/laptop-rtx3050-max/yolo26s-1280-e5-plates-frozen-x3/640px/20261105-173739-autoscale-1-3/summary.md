# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-173739-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T17:37:41Z |
| **End Time** | 2026-11-05T17:40:37Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 144.02 s |
| **Throughput (end-to-end)** | **1552.30 images/min** |
| **Drain Throughput** | **1560.76 images/min** |
| **Throughput per Worker** | **517.43 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 55.0 ms | 83.0 ms | 3838.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 56.86 s (56862 ms) | 65.12 s (65115 ms) | 66.30 s (66298 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 934 mCPU | 215 mCPU |
| **Memory (RAM)** | 1350.0 MiB | 1262.3 MiB |

**CPU (counters)**: 535 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 56.0 ms | 94.3 ms |
| **VN plates** | 30 | 45.5 ms | 62.3 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 282.18 s |
