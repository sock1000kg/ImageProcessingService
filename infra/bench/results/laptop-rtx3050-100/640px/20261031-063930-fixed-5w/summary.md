# Benchmark Summary: 20261031-063930-fixed-5w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 5 |
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
| **Start Time** | 2026-10-31T06:39:31Z |
| **End Time** | 2026-10-31T06:40:35Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 3.89 s |
| **Throughput (end-to-end)** | **1541.62 images/min** |
| **Drain Throughput** | **1566.99 images/min** |
| **Throughput per Worker** | **308.32 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 53.5 ms | 132.9 ms | 338.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 0.52 s (522 ms) | 0.83 s (826 ms) | 0.91 s (914 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 290 mCPU | 182 mCPU |
| **Memory (RAM)** | 1091.0 MiB | 760.2 MiB |

**CPU (counters)**: 320 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 57.0 ms | 309.6 ms |
| **VN plates** | 30 | 46.5 ms | 102.0 ms |
