# Benchmark Summary: 20261031-074646-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
| **Dataset** | large |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T07:46:47Z |
| **End Time** | 2026-10-31T07:48:01Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 39.54 s |
| **Throughput (end-to-end)** | **1517.60 images/min** |
| **Drain Throughput** | **2080.95 images/min** |
| **Throughput per Worker** | **505.87 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 35.0 ms | 62.0 ms | 4833.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 22.35 s (22353 ms) | 25.31 s (25313 ms) | 25.54 s (25536 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 841 mCPU | 214 mCPU |
| **Memory (RAM)** | 1439.0 MiB | 1284.4 MiB |

**CPU (counters)**: 214 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 36.0 ms | 62.0 ms |
| **VN plates** | 300 | 31.0 ms | 67.2 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 9.48 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 116.94 s |
