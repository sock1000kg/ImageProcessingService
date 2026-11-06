# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-165855-autoscale-1-3

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
| **Start Time** | 2026-11-05T16:58:57Z |
| **End Time** | 2026-11-05T17:04:47Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 160.01 s |
| **Throughput (end-to-end)** | **1397.20 images/min** |
| **Drain Throughput** | **1404.37 images/min** |
| **Throughput per Worker** | **465.73 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 59.0 ms | 97.0 ms | 7164.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 66.46 s (66458 ms) | 78.45 s (78451 ms) | 79.97 s (79975 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 784 mCPU | 246 mCPU |
| **Memory (RAM)** | 1408.0 MiB | 1207.8 MiB |

**CPU (counters)**: 586 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 60.0 ms | 95.5 ms |
| **VN plates** | 30 | 44.5 ms | 65.3 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 262.67 s |
