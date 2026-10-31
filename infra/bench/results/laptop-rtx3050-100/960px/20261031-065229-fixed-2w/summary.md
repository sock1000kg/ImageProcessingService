# Benchmark Summary: 20261031-065229-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
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
| **Start Time** | 2026-10-31T06:52:30Z |
| **End Time** | 2026-10-31T06:53:17Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 3.55 s |
| **Throughput (end-to-end)** | **1690.62 images/min** |
| **Drain Throughput** | **1718.71 images/min** |
| **Throughput per Worker** | **845.31 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 40.5 ms | 70.1 ms | 100.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 0.97 s (972 ms) | 1.69 s (1692 ms) | 1.83 s (1834 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 203 mCPU | 102 mCPU |
| **Memory (RAM)** | 342.0 MiB | 342.0 MiB |

**CPU (counters)**: 283 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 42.5 ms | 71.6 ms |
| **VN plates** | 30 | 39.0 ms | 62.8 ms |
