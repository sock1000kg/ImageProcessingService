# Benchmark Summary: 20261031-092722-fixed-3w-conf0.05

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | large |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:28:12Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T09:27:23Z |
| **End Time** | 2026-10-31T09:29:00Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 57.15 s |
| **Throughput (end-to-end)** | **1049.92 images/min** |
| **Drain Throughput** | **1690.24 images/min** |
| **Throughput per Worker** | **349.97 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 73.0 ms | 108.0 ms | 3998.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 34.19 s (34188 ms) | 40.49 s (40485 ms) | 41.84 s (41845 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 866 mCPU | 834 mCPU |
| **Memory (RAM)** | 1224.0 MiB | 1203.8 MiB |

**CPU (counters)**: 812 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 74.0 ms | 107.0 ms |
| **VN plates** | 300 | 69.0 ms | 112.1 ms |
