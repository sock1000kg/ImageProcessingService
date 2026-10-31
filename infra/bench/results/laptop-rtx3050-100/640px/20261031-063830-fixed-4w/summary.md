# Benchmark Summary: 20261031-063830-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
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
| **Start Time** | 2026-10-31T06:38:31Z |
| **End Time** | 2026-10-31T06:39:24Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.59 s |
| **Throughput (end-to-end)** | **1307.47 images/min** |
| **Drain Throughput** | **1324.21 images/min** |
| **Throughput per Worker** | **326.87 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 52.5 ms | 156.2 ms | 360.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 0.71 s (708 ms) | 1.22 s (1215 ms) | 1.30 s (1296 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 319 mCPU | 50 mCPU |
| **Memory (RAM)** | 1203.0 MiB | 497.6 MiB |

**CPU (counters)**: 305 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 54.0 ms | 262.3 ms |
| **VN plates** | 30 | 45.5 ms | 72.7 ms |
