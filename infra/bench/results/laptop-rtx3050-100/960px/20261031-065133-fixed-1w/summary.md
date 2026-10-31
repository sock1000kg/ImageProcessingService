# Benchmark Summary: 20261031-065133-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
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
| **Start Time** | 2026-10-31T06:51:34Z |
| **End Time** | 2026-10-31T06:52:24Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.76 s |
| **Throughput (end-to-end)** | **1259.18 images/min** |
| **Drain Throughput** | **1265.56 images/min** |
| **Throughput per Worker** | **1259.18 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 32.0 ms | 52.1 ms | 86.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.78 s (1777 ms) | 3.01 s (3012 ms) | 3.24 s (3244 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 535 mCPU | 535 mCPU |
| **Memory (RAM)** | 1186.0 MiB | 1186.0 MiB |

**CPU (counters)**: 728 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 33.0 ms | 51.1 ms |
| **VN plates** | 30 | 31.5 ms | 53.1 ms |
