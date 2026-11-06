# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-164140-autoscale-1-3

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
| **Start Time** | 2026-11-05T16:41:42Z |
| **End Time** | 2026-11-05T16:45:04Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 161.23 s |
| **Throughput (end-to-end)** | **1386.59 images/min** |
| **Drain Throughput** | **1394.45 images/min** |
| **Throughput per Worker** | **462.20 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 56.0 ms | 95.0 ms | 4806.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 59.22 s (59218 ms) | 68.46 s (68463 ms) | 70.12 s (70125 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 725 mCPU | 214 mCPU |
| **Memory (RAM)** | 1230.0 MiB | 1165.7 MiB |

**CPU (counters)**: 502 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 58.0 ms | 119.3 ms |
| **VN plates** | 30 | 38.0 ms | 69.9 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 265.12 s |
