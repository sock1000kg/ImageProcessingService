# Benchmark Summary: 20261031-074152-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | large |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T07:42:40Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T07:41:53Z |
| **End Time** | 2026-10-31T07:43:19Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 49.41 s |
| **Throughput (end-to-end)** | **1214.35 images/min** |
| **Drain Throughput** | **2215.00 images/min** |
| **Throughput per Worker** | **607.18 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 30.0 ms | 50.0 ms | 3145.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 30.01 s (30012 ms) | 32.00 s (32000 ms) | 32.59 s (32592 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 791 mCPU | 787 mCPU |
| **Memory (RAM)** | 1193.0 MiB | 1186.8 MiB |

**CPU (counters)**: 661 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 32.0 ms | 49.0 ms |
| **VN plates** | 300 | 26.0 ms | 61.1 ms |
