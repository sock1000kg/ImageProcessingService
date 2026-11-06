# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-164948-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-05T16:50:47Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T16:49:50Z |
| **End Time** | 2026-11-05T16:53:12Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 180.48 s |
| **Throughput (end-to-end)** | **1238.70 images/min** |
| **Drain Throughput** | **1796.54 images/min** |
| **Throughput per Worker** | **412.90 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 50.0 ms | 84.0 ms | 8860.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 108.12 s (108124 ms) | 132.93 s (132934 ms) | 133.82 s (133824 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 779 mCPU | 665 mCPU |
| **Memory (RAM)** | 1262.0 MiB | 1150.6 MiB |

**CPU (counters)**: 632 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 50.5 ms | 82.6 ms |
| **VN plates** | 30 | 46.0 ms | 75.0 ms |
