# Benchmark Summary: 20261031-071028-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T07:10:29Z |
| **End Time** | 2026-10-31T07:11:20Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 3.91 s |
| **Throughput (end-to-end)** | **1535.71 images/min** |
| **Drain Throughput** | **1563.31 images/min** |
| **Throughput per Worker** | **383.93 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 91.5 ms | 140.3 ms | 853.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.04 s (1038 ms) | 1.44 s (1441 ms) | 1.59 s (1595 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1 mCPU | 1 mCPU |
| **Memory (RAM)** | 345.0 MiB | 344.0 MiB |

**CPU (counters)**: 368 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 95.0 ms | 129.6 ms |
| **VN plates** | 30 | 89.0 ms | 357.9 ms |
