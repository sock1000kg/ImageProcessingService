# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-180654-autoscale-0-3

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
| **Start Time** | 2026-11-05T18:06:55Z |
| **End Time** | 2026-11-05T18:10:31Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 193.88 s |
| **Throughput (end-to-end)** | **1153.11 images/min** |
| **Drain Throughput** | **1237.71 images/min** |
| **Throughput per Worker** | **384.37 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 112.0 ms | 154.0 ms | 5676.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 82.44 s (82439 ms) | 113.81 s (113811 ms) | 117.39 s (117394 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 907 mCPU | 527 mCPU |
| **Memory (RAM)** | 1292.0 MiB | 1254.2 MiB |

**CPU (counters)**: 527 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 114.5 ms | 156.1 ms |
| **VN plates** | 30 | 117.0 ms | 151.8 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 11.00 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 123.12 s |
