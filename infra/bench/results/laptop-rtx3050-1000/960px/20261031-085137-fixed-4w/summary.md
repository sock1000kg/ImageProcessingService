# Benchmark Summary: 20261031-085137-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | large |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T08:52:24Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T08:51:39Z |
| **End Time** | 2026-10-31T08:53:06Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 50.80 s |
| **Throughput (end-to-end)** | **1181.01 images/min** |
| **Drain Throughput** | **2021.63 images/min** |
| **Throughput per Worker** | **295.25 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 61.0 ms | 96.0 ms | 5630.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 32.65 s (32653 ms) | 35.39 s (35388 ms) | 35.77 s (35774 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 777 mCPU | 746 mCPU |
| **Memory (RAM)** | 1236.0 MiB | 1188.1 MiB |

**CPU (counters)**: 739 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 64.0 ms | 96.0 ms |
| **VN plates** | 300 | 55.0 ms | 92.3 ms |
