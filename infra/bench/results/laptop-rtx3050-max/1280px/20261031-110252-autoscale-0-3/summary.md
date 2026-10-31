# Benchmark Summary: 20261031-110252-autoscale-0-3

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
| **Start Time** | 2026-10-31T11:02:53Z |
| **End Time** | 2026-10-31T11:05:43Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 150.96 s |
| **Throughput (end-to-end)** | **1480.97 images/min** |
| **Drain Throughput** | **1604.13 images/min** |
| **Throughput per Worker** | **493.66 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 73.0 ms | 99.0 ms | 6503.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 60.36 s (60357 ms) | 76.04 s (76044 ms) | 77.81 s (77809 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 862 mCPU | 417 mCPU |
| **Memory (RAM)** | 1400.0 MiB | 1280.7 MiB |

**CPU (counters)**: 417 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 71.5 ms | 94.6 ms |
| **VN plates** | 30 | 64.0 ms | 95.0 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 4.18 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 120.22 s |
