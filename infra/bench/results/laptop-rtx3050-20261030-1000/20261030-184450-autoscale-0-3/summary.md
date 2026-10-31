# Benchmark Summary: 20261030-184450-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
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
| **Start Time** | 2026-10-30T18:44:55Z |
| **End Time** | 2026-10-30T18:46:22Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 43.48 s |
| **Throughput (end-to-end)** | **1380.04 images/min** |
| **Drain Throughput** | **1953.57 images/min** |
| **Throughput per Worker** | **460.01 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 36.0 ms | 62.0 ms | 6474.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 26.42 s (26418 ms) | 28.49 s (28491 ms) | 28.72 s (28720 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 819 mCPU | 208 mCPU |
| **Memory (RAM)** | 1366.0 MiB | 1258.0 MiB |

**CPU (counters)**: 208 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 39.0 ms | 62.0 ms |
| **VN plates** | 300 | 30.0 ms | 64.2 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 9.73 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 111.25 s |
