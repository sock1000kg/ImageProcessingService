# Benchmark Summary: 20261031-100653-fixed-3w-conf0.05

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:08:04Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:06:54Z |
| **End Time** | 2026-10-31T10:09:53Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 156.06 s |
| **Throughput (end-to-end)** | **1432.54 images/min** |
| **Drain Throughput** | **2249.00 images/min** |
| **Throughput per Worker** | **477.51 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 41.0 ms | 64.8 ms | 4160.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 90.12 s (90123 ms) | 105.56 s (105558 ms) | 106.46 s (106464 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 799 mCPU | 770 mCPU |
| **Memory (RAM)** | 1241.0 MiB | 1202.7 MiB |

**CPU (counters)**: 674 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 41.0 ms | 61.0 ms |
| **VN plates** | 30 | 34.0 ms | 59.8 ms |
