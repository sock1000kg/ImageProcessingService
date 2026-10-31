# Benchmark Summary: 20261031-070843-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
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
| **Start Time** | 2026-10-31T07:08:44Z |
| **End Time** | 2026-10-31T07:09:30Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 3.65 s |
| **Throughput (end-to-end)** | **1645.19 images/min** |
| **Drain Throughput** | **1657.00 images/min** |
| **Throughput per Worker** | **822.59 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 50.5 ms | 85.0 ms | 101.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.13 s (1126 ms) | 1.65 s (1646 ms) | 1.74 s (1743 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 137 mCPU | 35 mCPU |
| **Memory (RAM)** | 1127.0 MiB | 538.2 MiB |

**CPU (counters)**: 35 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 47.5 ms | 84.5 ms |
| **VN plates** | 30 | 52.0 ms | 82.1 ms |
