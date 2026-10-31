# Benchmark Summary: 20261031-070007-autoscale-0-2

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→2 |
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
| **Start Time** | 2026-10-31T07:00:08Z |
| **End Time** | 2026-10-31T07:01:19Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 27.15 s |
| **Throughput (end-to-end)** | **220.97 images/min** |
| **Drain Throughput** | **676.06 images/min** |
| **Throughput per Worker** | **110.49 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 39.0 ms | 77.2 ms | 5499.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 23.90 s (23904 ms) | 24.54 s (24536 ms) | 24.63 s (24633 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 594 mCPU | 97 mCPU |
| **Memory (RAM)** | 1373.0 MiB | 1305.7 MiB |

**CPU (counters)**: 97 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 40.0 ms | 79.7 ms |
| **VN plates** | 30 | 37.5 ms | 61.5 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 16.01 s |
| **Max Replicas Reached** | 2 |
| **Time to scale back to min (cooldown)** | 110.86 s |
