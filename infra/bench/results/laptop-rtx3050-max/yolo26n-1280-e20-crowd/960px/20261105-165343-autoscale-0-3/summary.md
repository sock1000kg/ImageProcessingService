# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-165343-autoscale-0-3

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
| **Start Time** | 2026-11-05T16:53:44Z |
| **End Time** | 2026-11-05T16:56:42Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 161.82 s |
| **Throughput (end-to-end)** | **1381.55 images/min** |
| **Drain Throughput** | **1501.44 images/min** |
| **Throughput per Worker** | **460.52 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 55.0 ms | 88.0 ms | 7215.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 79.94 s (79943 ms) | 89.43 s (89428 ms) | 90.58 s (90578 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 726 mCPU | 374 mCPU |
| **Memory (RAM)** | 1280.0 MiB | 1212.7 MiB |

**CPU (counters)**: 374 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 57.0 ms | 90.6 ms |
| **VN plates** | 30 | 47.5 ms | 73.4 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 10.71 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 104.89 s |
