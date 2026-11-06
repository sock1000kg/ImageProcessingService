# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-171822-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T17:18:24Z |
| **End Time** | 2026-11-05T17:24:00Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 149.56 s |
| **Throughput (end-to-end)** | **1494.75 images/min** |
| **Drain Throughput** | **1502.57 images/min** |
| **Throughput per Worker** | **498.25 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 69.0 ms | 96.0 ms | 3951.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 63.84 s (63840 ms) | 71.45 s (71448 ms) | 72.72 s (72723 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 833 mCPU | 245 mCPU |
| **Memory (RAM)** | 1302.0 MiB | 1241.3 MiB |

**CPU (counters)**: 685 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 73.0 ms | 100.1 ms |
| **VN plates** | 30 | 59.5 ms | 84.0 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 274.44 s |
