# Benchmark Summary: 20261031-090915-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | large |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:10:03Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T09:09:16Z |
| **End Time** | 2026-10-31T09:10:48Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 57.10 s |
| **Throughput (end-to-end)** | **1050.75 images/min** |
| **Drain Throughput** | **1664.40 images/min** |
| **Throughput per Worker** | **525.38 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 51.0 ms | 76.0 ms | 2942.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 32.43 s (32428 ms) | 40.04 s (40044 ms) | 41.43 s (41434 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 877 mCPU | 871 mCPU |
| **Memory (RAM)** | 1224.0 MiB | 1205.5 MiB |

**CPU (counters)**: 796 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 52.0 ms | 76.0 ms |
| **VN plates** | 300 | 49.0 ms | 88.1 ms |
