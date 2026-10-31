# Benchmark Summary: 20261031-065414-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
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
| **Start Time** | 2026-10-31T06:54:15Z |
| **End Time** | 2026-10-31T06:55:09Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.00 s |
| **Throughput (end-to-end)** | **1498.13 images/min** |
| **Drain Throughput** | **1518.22 images/min** |
| **Throughput per Worker** | **374.53 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 64.5 ms | 162.2 ms | 396.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.21 s (1206 ms) | 1.68 s (1678 ms) | 1.83 s (1835 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 358 mCPU | 116 mCPU |
| **Memory (RAM)** | 1200.0 MiB | 631.1 MiB |

**CPU (counters)**: 363 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 65.0 ms | 284.8 ms |
| **VN plates** | 30 | 62.5 ms | 95.6 ms |
