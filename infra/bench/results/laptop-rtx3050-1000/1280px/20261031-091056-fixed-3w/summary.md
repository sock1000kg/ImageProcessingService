# Benchmark Summary: 20261031-091056-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | large |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:11:45Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T09:10:57Z |
| **End Time** | 2026-10-31T09:12:24Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 54.11 s |
| **Throughput (end-to-end)** | **1108.87 images/min** |
| **Drain Throughput** | **1814.94 images/min** |
| **Throughput per Worker** | **369.62 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 71.5 ms | 99.0 ms | 3093.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 31.23 s (31233 ms) | 37.13 s (37132 ms) | 38.11 s (38106 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 850 mCPU | 835 mCPU |
| **Memory (RAM)** | 1210.0 MiB | 1192.7 MiB |

**CPU (counters)**: 864 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 73.0 ms | 97.0 ms |
| **VN plates** | 300 | 69.0 ms | 107.1 ms |
