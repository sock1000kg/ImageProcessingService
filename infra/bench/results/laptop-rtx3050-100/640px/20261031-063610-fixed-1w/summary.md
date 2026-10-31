# Benchmark Summary: 20261031-063610-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
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
| **Start Time** | 2026-10-31T06:36:11Z |
| **End Time** | 2026-10-31T06:36:34Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.67 s |
| **Throughput (end-to-end)** | **1285.07 images/min** |
| **Drain Throughput** | **1292.82 images/min** |
| **Throughput per Worker** | **1285.07 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 27.5 ms | 52.0 ms | 109.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.59 s (1588 ms) | 2.86 s (2856 ms) | 3.12 s (3116 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 0 mCPU | 0 mCPU |
| **Memory (RAM)** | 0.0 MiB | 0.0 MiB |

**CPU (counters)**: 733 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 27.0 ms | 51.0 ms |
| **VN plates** | 30 | 28.0 ms | 56.9 ms |
