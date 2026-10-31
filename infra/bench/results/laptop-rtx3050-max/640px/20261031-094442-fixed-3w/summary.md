# Benchmark Summary: 20261031-094442-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:45:56Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T09:44:44Z |
| **End Time** | 2026-10-31T09:47:44Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 160.94 s |
| **Throughput (end-to-end)** | **1389.12 images/min** |
| **Drain Throughput** | **2258.82 images/min** |
| **Throughput per Worker** | **463.04 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 37.0 ms | 56.0 ms | 4153.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 88.16 s (88164 ms) | 104.05 s (104051 ms) | 105.00 s (105000 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 740 mCPU | 687 mCPU |
| **Memory (RAM)** | 1216.0 MiB | 1186.8 MiB |

**CPU (counters)**: 610 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 37.0 ms | 54.0 ms |
| **VN plates** | 30 | 33.0 ms | 52.9 ms |
