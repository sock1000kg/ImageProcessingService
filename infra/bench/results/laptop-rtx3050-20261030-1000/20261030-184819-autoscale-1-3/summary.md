# Benchmark Summary: 20261030-184819-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Dataset** | large |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-30T18:48:25Z |
| **End Time** | 2026-10-30T18:52:21Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 37.90 s |
| **Throughput (end-to-end)** | **1583.07 images/min** |
| **Drain Throughput** | **1591.30 images/min** |
| **Throughput per Worker** | **527.69 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 35.0 ms | 64.0 ms | 3525.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 16.30 s (16296 ms) | 18.99 s (18989 ms) | 20.10 s (20101 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 627 mCPU | 69 mCPU |
| **Memory (RAM)** | 1217.0 MiB | 1186.8 MiB |

**CPU (counters)**: 516 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 38.0 ms | 62.0 ms |
| **VN plates** | 300 | 30.0 ms | 70.0 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 283.69 s |
