# Benchmark Summary: 20261031-085315-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
| **Dataset** | large |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T08:53:16Z |
| **End Time** | 2026-10-31T08:54:34Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 40.02 s |
| **Throughput (end-to-end)** | **1499.10 images/min** |
| **Drain Throughput** | **1896.45 images/min** |
| **Throughput per Worker** | **499.70 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 49.0 ms | 76.0 ms | 4833.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 21.35 s (21354 ms) | 24.61 s (24610 ms) | 25.28 s (25277 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 823 mCPU | 212 mCPU |
| **Memory (RAM)** | 1390.0 MiB | 1262.4 MiB |

**CPU (counters)**: 212 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 51.0 ms | 75.0 ms |
| **VN plates** | 300 | 45.0 ms | 79.5 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 3.24 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 113.22 s |
