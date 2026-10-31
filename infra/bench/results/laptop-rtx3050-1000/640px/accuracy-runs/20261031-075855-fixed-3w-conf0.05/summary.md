# Benchmark Summary: 20261031-075855-fixed-3w-conf0.05

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | large |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T07:59:42Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T07:58:56Z |
| **End Time** | 2026-10-31T08:00:22Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 50.08 s |
| **Throughput (end-to-end)** | **1198.06 images/min** |
| **Drain Throughput** | **2183.88 images/min** |
| **Throughput per Worker** | **399.35 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 37.0 ms | 65.0 ms | 3295.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 31.73 s (31735 ms) | 33.67 s (33672 ms) | 34.00 s (33996 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 775 mCPU | 756 mCPU |
| **Memory (RAM)** | 1201.0 MiB | 1194.7 MiB |

**CPU (counters)**: 677 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 40.0 ms | 65.0 ms |
| **VN plates** | 300 | 31.0 ms | 69.1 ms |
