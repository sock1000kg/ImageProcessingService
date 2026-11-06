# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-163638-autoscale-0-3

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
| **Start Time** | 2026-11-05T16:36:39Z |
| **End Time** | 2026-11-05T16:39:45Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 167.03 s |
| **Throughput (end-to-end)** | **1338.44 images/min** |
| **Drain Throughput** | **1443.87 images/min** |
| **Throughput per Worker** | **446.15 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 51.0 ms | 83.0 ms | 10759.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 82.33 s (82328 ms) | 90.00 s (90002 ms) | 91.71 s (91714 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 778 mCPU | 381 mCPU |
| **Memory (RAM)** | 1185.0 MiB | 1110.2 MiB |

**CPU (counters)**: 381 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 53.0 ms | 80.6 ms |
| **VN plates** | 30 | 38.5 ms | 72.6 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 4.49 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 87.46 s |
