# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-174923-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
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
| **Start Time** | 2026-11-05T17:49:25Z |
| **End Time** | 2026-11-05T17:52:18Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 153.74 s |
| **Throughput (end-to-end)** | **1454.15 images/min** |
| **Drain Throughput** | **1569.71 images/min** |
| **Throughput per Worker** | **484.72 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 74.0 ms | 102.0 ms | 5749.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 72.78 s (72784 ms) | 82.44 s (82441 ms) | 83.72 s (83724 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 847 mCPU | 461 mCPU |
| **Memory (RAM)** | 1335.0 MiB | 1275.3 MiB |

**CPU (counters)**: 461 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 76.5 ms | 100.0 ms |
| **VN plates** | 30 | 71.5 ms | 97.1 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 4.93 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 111.19 s |
