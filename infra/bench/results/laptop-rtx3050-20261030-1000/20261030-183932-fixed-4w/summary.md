# Benchmark Summary: 20261030-183932-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | large |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-30T18:40:19Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-30T18:39:39Z |
| **End Time** | 2026-10-30T18:40:58Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 48.04 s |
| **Throughput (end-to-end)** | **1249.06 images/min** |
| **Drain Throughput** | **2096.14 images/min** |
| **Throughput per Worker** | **312.27 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 42.0 ms | 80.0 ms | 4003.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 31.47 s (31471 ms) | 34.02 s (34023 ms) | 34.49 s (34492 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 792 mCPU | 744 mCPU |
| **Memory (RAM)** | 1205.0 MiB | 1186.4 MiB |

**CPU (counters)**: 536 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 45.0 ms | 80.0 ms |
| **VN plates** | 300 | 35.0 ms | 80.1 ms |
