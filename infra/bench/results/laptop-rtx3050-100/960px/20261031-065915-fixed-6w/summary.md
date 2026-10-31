# Benchmark Summary: 20261031-065915-fixed-6w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 6 |
| **Dataset** | small |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T06:59:16Z |
| **End Time** | 2026-10-31T06:59:58Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 6.84 s |
| **Throughput (end-to-end)** | **876.94 images/min** |
| **Drain Throughput** | **886.52 images/min** |
| **Throughput per Worker** | **146.16 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 74.0 ms | 309.6 ms | 370.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 0.79 s (794 ms) | 1.67 s (1671 ms) | 1.90 s (1902 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 682 mCPU | 512 mCPU |
| **Memory (RAM)** | 1004.0 MiB | 780.2 MiB |

**CPU (counters)**: 305 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 79.0 ms | 330.3 ms |
| **VN plates** | 30 | 69.5 ms | 129.7 ms |
