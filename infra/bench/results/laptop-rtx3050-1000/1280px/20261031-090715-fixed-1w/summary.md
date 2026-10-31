# Benchmark Summary: 20261031-090715-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
| **Dataset** | large |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:08:05Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T09:07:16Z |
| **End Time** | 2026-10-31T09:09:07Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 76.96 s |
| **Throughput (end-to-end)** | **779.65 images/min** |
| **Drain Throughput** | **1088.71 images/min** |
| **Throughput per Worker** | **779.65 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 36.0 ms | 53.0 ms | 2983.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 44.07 s (44074 ms) | 58.93 s (58930 ms) | 60.73 s (60734 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 826 mCPU | 782 mCPU |
| **Memory (RAM)** | 1218.0 MiB | 1213.7 MiB |

**CPU (counters)**: 824 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 38.0 ms | 51.0 ms |
| **VN plates** | 300 | 32.0 ms | 69.2 ms |
