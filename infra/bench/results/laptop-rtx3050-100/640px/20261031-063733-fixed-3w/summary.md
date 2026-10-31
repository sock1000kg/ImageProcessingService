# Benchmark Summary: 20261031-063733-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
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
| **Start Time** | 2026-10-31T06:37:34Z |
| **End Time** | 2026-10-31T06:38:24Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 3.77 s |
| **Throughput (end-to-end)** | **1590.25 images/min** |
| **Drain Throughput** | **1612.47 images/min** |
| **Throughput per Worker** | **530.08 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 43.5 ms | 121.0 ms | 170.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 0.55 s (551 ms) | 0.94 s (935 ms) | 0.99 s (990 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1 mCPU | 1 mCPU |
| **Memory (RAM)** | 367.0 MiB | 365.7 MiB |

**CPU (counters)**: 413 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 48.5 ms | 121.5 ms |
| **VN plates** | 30 | 39.0 ms | 64.6 ms |
