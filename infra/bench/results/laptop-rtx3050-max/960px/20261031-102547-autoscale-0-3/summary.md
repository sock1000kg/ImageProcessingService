# Benchmark Summary: 20261031-102547-autoscale-0-3

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
| **Start Time** | 2026-10-31T10:25:48Z |
| **End Time** | 2026-10-31T10:28:53Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 152.16 s |
| **Throughput (end-to-end)** | **1469.23 images/min** |
| **Drain Throughput** | **1661.69 images/min** |
| **Throughput per Worker** | **489.74 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 53.0 ms | 82.0 ms | 5205.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 69.39 s (69390 ms) | 79.48 s (79476 ms) | 80.25 s (80255 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 809 mCPU | 378 mCPU |
| **Memory (RAM)** | 1373.0 MiB | 1266.6 MiB |

**CPU (counters)**: 378 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 54.5 ms | 77.1 ms |
| **VN plates** | 30 | 49.5 ms | 74.5 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 15.15 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 107.99 s |
