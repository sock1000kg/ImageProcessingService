# Benchmark Summary: 20261031-065322-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
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
| **Start Time** | 2026-10-31T06:53:23Z |
| **End Time** | 2026-10-31T06:54:09Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 3.49 s |
| **Throughput (end-to-end)** | **1720.18 images/min** |
| **Drain Throughput** | **1734.10 images/min** |
| **Throughput per Worker** | **573.39 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 51.5 ms | 79.1 ms | 110.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.11 s (1110 ms) | 1.63 s (1629 ms) | 1.81 s (1811 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 203 mCPU | 76 mCPU |
| **Memory (RAM)** | 1133.0 MiB | 604.3 MiB |

**CPU (counters)**: 122 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 52.5 ms | 78.5 ms |
| **VN plates** | 30 | 50.5 ms | 79.2 ms |
