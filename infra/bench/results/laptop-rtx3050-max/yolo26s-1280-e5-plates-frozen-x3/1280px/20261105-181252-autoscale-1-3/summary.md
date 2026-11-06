# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-181252-autoscale-1-3

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
| **Start Time** | 2026-11-05T18:12:54Z |
| **End Time** | 2026-11-05T18:19:04Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 177.91 s |
| **Throughput (end-to-end)** | **1256.61 images/min** |
| **Drain Throughput** | **1261.80 images/min** |
| **Throughput per Worker** | **418.87 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 109.0 ms | 151.0 ms | 4091.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 65.88 s (65880 ms) | 98.75 s (98750 ms) | 102.39 s (102393 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 906 mCPU | 311 mCPU |
| **Memory (RAM)** | 1331.0 MiB | 1272.8 MiB |

**CPU (counters)**: 777 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 115.5 ms | 164.3 ms |
| **VN plates** | 30 | 111.5 ms | 152.1 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 294.03 s |
