# Benchmark Summary: 20261031-074022-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
| **Dataset** | large |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T07:40:41Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T07:40:23Z |
| **End Time** | 2026-10-31T07:41:44Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 71.05 s |
| **Throughput (end-to-end)** | **844.51 images/min** |
| **Drain Throughput** | **1193.65 images/min** |
| **Throughput per Worker** | **844.51 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 31.0 ms | 47.0 ms | 3948.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 42.31 s (42309 ms) | 54.99 s (54989 ms) | 56.88 s (56879 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 833 mCPU | 753 mCPU |
| **Memory (RAM)** | 1313.0 MiB | 1292.6 MiB |

**CPU (counters)**: 797 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 32.0 ms | 46.0 ms |
| **VN plates** | 300 | 27.0 ms | 64.0 ms |
