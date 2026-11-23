# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-170255-autoscale-0-2

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
| **Start Time** | 2026-11-22T17:02:58Z |
| **End Time** | 2026-11-22T17:05:08Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 95.42 s |
| **Throughput (end-to-end)** | **62.88 images/min** |
| **Drain Throughput** | **76.09 images/min** |
| **Throughput per Worker** | **31.44 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1202.5 ms | 2583.5 ms | 4182.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 56.56 s (56565 ms) | 72.38 s (72384 ms) | 76.21 s (76209 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 970 mCPU | 429 mCPU |
| **Memory (RAM)** | 827.0 MiB | 716.3 MiB |

**CPU (counters)**: 429 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1425.5 ms | 2688.7 ms |
| **VN plates** | 30 | 995.0 ms | 1824.5 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 11.42 s |
| **Max Replicas Reached** | 2 |
| **Time to scale back to min (cooldown)** | 117.00 s |
