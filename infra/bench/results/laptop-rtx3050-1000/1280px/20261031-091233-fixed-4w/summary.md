# Benchmark Summary: 20261031-091233-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | large |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:13:21Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T09:12:34Z |
| **End Time** | 2026-10-31T09:14:32Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 83.66 s |
| **Throughput (end-to-end)** | **717.21 images/min** |
| **Drain Throughput** | **997.77 images/min** |
| **Throughput per Worker** | **179.30 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 62.5 ms | 1377.6 ms | 3934.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 43.93 s (43930 ms) | 63.13 s (63125 ms) | 65.90 s (65904 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 999 mCPU | 924 mCPU |
| **Memory (RAM)** | 1218.0 MiB | 1201.1 MiB |

**CPU (counters)**: 932 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 68.0 ms | 1352.7 ms |
| **VN plates** | 300 | 47.0 ms | 1429.9 ms |
