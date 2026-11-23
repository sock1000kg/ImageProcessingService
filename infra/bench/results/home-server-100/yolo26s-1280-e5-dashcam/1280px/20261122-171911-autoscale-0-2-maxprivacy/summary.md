# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-171911-autoscale-0-2-maxprivacy

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-22T17:19:14Z |
| **End Time** | 2026-11-22T17:22:53Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 181.46 s |
| **Throughput (end-to-end)** | **33.07 images/min** |
| **Drain Throughput** | **36.81 images/min** |
| **Throughput per Worker** | **16.53 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 2907.5 ms | 5068.9 ms | 7905.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 97.87 s (97874 ms) | 154.11 s (154111 ms) | 160.44 s (160435 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 992 mCPU | 617 mCPU |
| **Memory (RAM)** | 1014.0 MiB | 898.7 MiB |

**CPU (counters)**: 617 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 2963.0 ms | 5268.7 ms |
| **VN plates** | 30 | 2835.0 ms | 4092.5 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 11.06 s |
| **Max Replicas Reached** | 2 |
| **Time to scale back to min (cooldown)** | 114.60 s |
