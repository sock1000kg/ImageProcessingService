# Benchmark Summary: 20261030-184107-fixed-5w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 5 |
| **Dataset** | large |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-30T18:42:01Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-30T18:41:13Z |
| **End Time** | 2026-10-30T18:42:43Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 58.76 s |
| **Throughput (end-to-end)** | **1021.09 images/min** |
| **Drain Throughput** | **1787.47 images/min** |
| **Throughput per Worker** | **204.22 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 50.0 ms | 98.0 ms | 6932.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 40.12 s (40118 ms) | 41.72 s (41725 ms) | 42.25 s (42249 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 821 mCPU | 745 mCPU |
| **Memory (RAM)** | 1185.0 MiB | 1162.8 MiB |

**CPU (counters)**: 684 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 54.0 ms | 96.1 ms |
| **VN plates** | 300 | 44.0 ms | 102.1 ms |
