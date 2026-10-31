# Benchmark Summary: 20261031-070749-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
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
| **Start Time** | 2026-10-31T07:07:50Z |
| **End Time** | 2026-10-31T07:08:39Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 5.22 s |
| **Throughput (end-to-end)** | **1149.43 images/min** |
| **Drain Throughput** | **1154.29 images/min** |
| **Throughput per Worker** | **1149.43 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 37.0 ms | 61.0 ms | 82.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 2.07 s (2066 ms) | 3.45 s (3454 ms) | 3.70 s (3697 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 0 mCPU | 0 mCPU |
| **Memory (RAM)** | 0.0 MiB | 0.0 MiB |

**CPU (counters)**: 773 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 37.0 ms | 60.5 ms |
| **VN plates** | 30 | 35.0 ms | 58.7 ms |
