# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-171324-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
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
| **Start Time** | 2026-11-05T17:13:25Z |
| **End Time** | 2026-11-05T17:16:20Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 152.13 s |
| **Throughput (end-to-end)** | **1469.51 images/min** |
| **Drain Throughput** | **1589.12 images/min** |
| **Throughput per Worker** | **489.84 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 68.0 ms | 96.0 ms | 6141.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 72.42 s (72416 ms) | 80.80 s (80804 ms) | 82.00 s (82000 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 824 mCPU | 454 mCPU |
| **Memory (RAM)** | 1306.0 MiB | 1248.6 MiB |

**CPU (counters)**: 454 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 68.5 ms | 97.3 ms |
| **VN plates** | 30 | 56.0 ms | 91.3 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 4.89 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 101.76 s |
