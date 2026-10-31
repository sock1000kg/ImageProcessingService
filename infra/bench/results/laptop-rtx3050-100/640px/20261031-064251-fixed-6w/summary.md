# Benchmark Summary: 20261031-064251-fixed-6w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 6 |
| **Dataset** | small |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T06:42:53Z |
| **End Time** | 2026-10-31T06:43:34Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 6.48 s |
| **Throughput (end-to-end)** | **925.78 images/min** |
| **Drain Throughput** | **952.08 images/min** |
| **Throughput per Worker** | **154.30 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 62.0 ms | 403.4 ms | 447.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.24 s (1240 ms) | 1.85 s (1850 ms) | 2.08 s (2077 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 420 mCPU | 365 mCPU |
| **Memory (RAM)** | 907.0 MiB | 661.7 MiB |

**CPU (counters)**: 284 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 72.0 ms | 420.2 ms |
| **VN plates** | 30 | 45.0 ms | 125.5 ms |
