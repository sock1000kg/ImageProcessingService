# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-171956-autoscale-0-3

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
| **Start Time** | 2026-11-22T17:19:58Z |
| **End Time** | 2026-11-22T17:23:17Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 169.03 s |
| **Throughput (end-to-end)** | **1322.58 images/min** |
| **Drain Throughput** | **1428.31 images/min** |
| **Throughput per Worker** | **440.86 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 64.0 ms | 211.0 ms | 4115.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 68.70 s (68700 ms) | 86.26 s (86262 ms) | 88.72 s (88716 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 884 mCPU | 495 mCPU |
| **Memory (RAM)** | 1300.0 MiB | 1260.8 MiB |

**CPU (counters)**: 495 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 68.5 ms | 286.5 ms |
| **VN plates** | 30 | 57.0 ms | 77.3 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 11.38 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 117.35 s |
