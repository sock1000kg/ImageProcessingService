# Benchmark Summary: 20261031-085004-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | large |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T08:50:50Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T08:50:05Z |
| **End Time** | 2026-10-31T08:51:30Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 51.41 s |
| **Throughput (end-to-end)** | **1167.07 images/min** |
| **Drain Throughput** | **2003.47 images/min** |
| **Throughput per Worker** | **389.02 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 50.0 ms | 70.0 ms | 5527.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 32.28 s (32282 ms) | 35.29 s (35285 ms) | 35.57 s (35566 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 823 mCPU | 781 mCPU |
| **Memory (RAM)** | 1226.0 MiB | 1210.3 MiB |

**CPU (counters)**: 763 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 51.0 ms | 69.0 ms |
| **VN plates** | 300 | 45.0 ms | 76.2 ms |
