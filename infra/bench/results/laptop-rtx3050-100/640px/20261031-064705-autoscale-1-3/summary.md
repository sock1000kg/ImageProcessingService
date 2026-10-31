# Benchmark Summary: 20261031-064705-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Dataset** | small |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T06:47:06Z |
| **End Time** | 2026-10-31T06:50:28Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.63 s |
| **Throughput (end-to-end)** | **1296.46 images/min** |
| **Drain Throughput** | **1303.21 images/min** |
| **Throughput per Worker** | **1296.46 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 28.0 ms | 55.0 ms | 76.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.24 s (1240 ms) | 1.74 s (1736 ms) | 1.98 s (1976 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 26 mCPU | 14 mCPU |
| **Memory (RAM)** | 551.0 MiB | 446.5 MiB |

**CPU (counters)**: 560 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 28.5 ms | 54.1 ms |
| **VN plates** | 30 | 27.0 ms | 51.8 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 1 |
| **Time to scale back to min (cooldown)** | 0.15 s |
