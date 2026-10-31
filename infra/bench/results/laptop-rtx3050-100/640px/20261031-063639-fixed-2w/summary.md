# Benchmark Summary: 20261031-063639-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
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
| **Start Time** | 2026-10-31T06:36:40Z |
| **End Time** | 2026-10-31T06:37:27Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 3.52 s |
| **Throughput (end-to-end)** | **1706.97 images/min** |
| **Drain Throughput** | **1731.60 images/min** |
| **Throughput per Worker** | **853.49 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 33.0 ms | 74.1 ms | 140.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 0.79 s (785 ms) | 1.34 s (1342 ms) | 1.50 s (1501 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 329 mCPU | 164 mCPU |
| **Memory (RAM)** | 1185.0 MiB | 552.8 MiB |

**CPU (counters)**: 329 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 33.0 ms | 75.6 ms |
| **VN plates** | 30 | 31.0 ms | 60.9 ms |
