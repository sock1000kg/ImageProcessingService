# Benchmark Summary: 20261030-183753-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | large |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-30T18:38:45Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-30T18:37:58Z |
| **End Time** | 2026-10-30T18:39:24Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 52.49 s |
| **Throughput (end-to-end)** | **1143.16 images/min** |
| **Drain Throughput** | **2111.41 images/min** |
| **Throughput per Worker** | **381.05 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 34.0 ms | 59.0 ms | 4535.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 34.49 s (34491 ms) | 35.93 s (35933 ms) | 36.47 s (36474 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 820 mCPU | 813 mCPU |
| **Memory (RAM)** | 1203.0 MiB | 1187.0 MiB |

**CPU (counters)**: 700 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 37.0 ms | 58.0 ms |
| **VN plates** | 300 | 30.0 ms | 69.2 ms |
