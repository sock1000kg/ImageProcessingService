# Benchmark Summary: 20261030-183606-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | large |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-30T18:36:56Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-30T18:36:15Z |
| **End Time** | 2026-10-30T18:37:45Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 59.29 s |
| **Throughput (end-to-end)** | **1011.98 images/min** |
| **Drain Throughput** | **1647.94 images/min** |
| **Throughput per Worker** | **505.99 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 33.0 ms | 66.0 ms | 6841.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 36.86 s (36862 ms) | 43.85 s (43845 ms) | 44.58 s (44580 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 876 mCPU | 704 mCPU |
| **Memory (RAM)** | 1238.0 MiB | 972.4 MiB |

**CPU (counters)**: 739 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 36.0 ms | 65.0 ms |
| **VN plates** | 300 | 29.0 ms | 73.1 ms |
