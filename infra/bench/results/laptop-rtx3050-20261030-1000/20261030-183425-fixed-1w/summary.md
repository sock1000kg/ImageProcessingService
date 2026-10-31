# Benchmark Summary: 20261030-183425-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
| **Dataset** | large |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-30T18:34:53Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-30T18:34:32Z |
| **End Time** | 2026-10-30T18:35:58Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 80.81 s |
| **Throughput (end-to-end)** | **742.50 images/min** |
| **Drain Throughput** | **1131.29 images/min** |
| **Throughput per Worker** | **742.50 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 31.0 ms | 47.0 ms | 6546.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 48.25 s (48250 ms) | 61.01 s (61007 ms) | 63.17 s (63172 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 825 mCPU | 653 mCPU |
| **Memory (RAM)** | 1383.0 MiB | 1138.2 MiB |

**CPU (counters)**: 765 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 32.0 ms | 45.0 ms |
| **VN plates** | 300 | 29.0 ms | 62.2 ms |
