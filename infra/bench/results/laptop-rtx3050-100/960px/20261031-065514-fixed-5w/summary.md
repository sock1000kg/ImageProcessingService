# Benchmark Summary: 20261031-065514-fixed-5w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 5 |
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
| **Start Time** | 2026-10-31T06:55:15Z |
| **End Time** | 2026-10-31T06:56:20Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.88 s |
| **Throughput (end-to-end)** | **1230.77 images/min** |
| **Drain Throughput** | **1244.30 images/min** |
| **Throughput per Worker** | **246.15 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 74.0 ms | 203.2 ms | 451.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 0.69 s (694 ms) | 1.28 s (1278 ms) | 1.39 s (1394 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 383 mCPU | 123 mCPU |
| **Memory (RAM)** | 1111.0 MiB | 615.5 MiB |

**CPU (counters)**: 310 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 75.5 ms | 420.3 ms |
| **VN plates** | 30 | 69.0 ms | 114.7 ms |
