# Benchmark Summary: 20261031-070319-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Dataset** | small |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T07:03:20Z |
| **End Time** | 2026-10-31T07:06:51Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.70 s |
| **Throughput (end-to-end)** | **1277.96 images/min** |
| **Drain Throughput** | **1289.49 images/min** |
| **Throughput per Worker** | **1277.96 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 30.0 ms | 53.0 ms | 76.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.35 s (1350 ms) | 2.14 s (2143 ms) | 2.36 s (2358 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1 mCPU | 1 mCPU |
| **Memory (RAM)** | 342.0 MiB | 342.0 MiB |

**CPU (counters)**: 402 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 31.5 ms | 53.0 ms |
| **VN plates** | 30 | 29.0 ms | 53.0 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 1 |
| **Time to scale back to min (cooldown)** | N/A |
