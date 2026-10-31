# Benchmark Summary: 20261031-103100-autoscale-1-3

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
| **Start Time** | 2026-10-31T10:31:02Z |
| **End Time** | 2026-10-31T10:33:38Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 132.21 s |
| **Throughput (end-to-end)** | **1691.00 images/min** |
| **Drain Throughput** | **1693.02 images/min** |
| **Throughput per Worker** | **563.67 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 52.0 ms | 73.0 ms | 4218.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 44.73 s (44728 ms) | 51.55 s (51552 ms) | 52.71 s (52709 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 738 mCPU | 197 mCPU |
| **Memory (RAM)** | 1265.0 MiB | 1230.8 MiB |

**CPU (counters)**: 562 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 54.0 ms | 70.2 ms |
| **VN plates** | 30 | 48.0 ms | 68.0 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 284.33 s |
