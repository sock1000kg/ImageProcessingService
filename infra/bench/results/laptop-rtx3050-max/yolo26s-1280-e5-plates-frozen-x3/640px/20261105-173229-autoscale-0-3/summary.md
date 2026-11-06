# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-173229-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
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
| **Start Time** | 2026-11-05T17:32:31Z |
| **End Time** | 2026-11-05T17:35:31Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 160.96 s |
| **Throughput (end-to-end)** | **1388.96 images/min** |
| **Drain Throughput** | **1497.30 images/min** |
| **Throughput per Worker** | **462.99 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 54.0 ms | 83.8 ms | 5554.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 79.96 s (79963 ms) | 90.62 s (90621 ms) | 92.14 s (92139 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 702 mCPU | 377 mCPU |
| **Memory (RAM)** | 1326.0 MiB | 1246.8 MiB |

**CPU (counters)**: 377 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 52.5 ms | 85.5 ms |
| **VN plates** | 30 | 44.0 ms | 70.7 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 4.40 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 104.44 s |
