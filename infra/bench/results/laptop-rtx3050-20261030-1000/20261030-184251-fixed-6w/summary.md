# Benchmark Summary: 20261030-184251-fixed-6w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 6 |
| **Dataset** | large |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-30T18:43:44Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-30T18:42:57Z |
| **End Time** | 2026-10-30T18:44:40Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 64.19 s |
| **Throughput (end-to-end)** | **934.67 images/min** |
| **Drain Throughput** | **1557.59 images/min** |
| **Throughput per Worker** | **155.78 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 57.0 ms | 93.0 ms | 12126.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 46.81 s (46814 ms) | 49.05 s (49048 ms) | 49.61 s (49608 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 746 mCPU | 545 mCPU |
| **Memory (RAM)** | 1078.0 MiB | 1035.6 MiB |

**CPU (counters)**: 472 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 60.5 ms | 92.0 ms |
| **VN plates** | 300 | 48.0 ms | 101.2 ms |
