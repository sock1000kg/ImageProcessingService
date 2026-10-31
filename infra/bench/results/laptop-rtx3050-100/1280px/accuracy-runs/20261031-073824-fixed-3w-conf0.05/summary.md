# Benchmark Summary: 20261031-073824-fixed-3w-conf0.05

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T07:39:02Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T07:38:25Z |
| **End Time** | 2026-10-31T07:39:15Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 12.43 s |
| **Throughput (end-to-end)** | **482.66 images/min** |
| **Drain Throughput** | **924.78 images/min** |
| **Throughput per Worker** | **160.89 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 82.0 ms | 130.7 ms | 3231.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 10.72 s (10718 ms) | 11.65 s (11651 ms) | 11.75 s (11748 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 0 mCPU | 0 mCPU |
| **Memory (RAM)** | 0.0 MiB | 0.0 MiB |

**CPU (counters)**: 791 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 84.0 ms | 148.2 ms |
| **VN plates** | 30 | 79.5 ms | 117.4 ms |
