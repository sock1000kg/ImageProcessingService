# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-225610-autoscale-0-3-maxprivacy

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T22:56:12Z |
| **End Time** | 2026-11-22T23:00:01Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 220.16 s |
| **Throughput (end-to-end)** | **1015.44 images/min** |
| **Drain Throughput** | **1079.65 images/min** |
| **Throughput per Worker** | **338.48 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 103.0 ms | 257.8 ms | 15044.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 98.26 s (98256 ms) | 134.56 s (134562 ms) | 138.95 s (138950 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 948 mCPU | 592 mCPU |
| **Memory (RAM)** | 1338.0 MiB | 1262.6 MiB |

**CPU (counters)**: 592 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 101.0 ms | 288.8 ms |
| **VN plates** | 30 | 105.0 ms | 159.1 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 11.16 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 118.00 s |
