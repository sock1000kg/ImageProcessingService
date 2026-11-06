# Benchmark Summary: yolo26n-1280-e20-crowd/20261105-170936-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-05T17:10:30Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T17:09:38Z |
| **End Time** | 2026-11-05T17:12:53Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 175.56 s |
| **Throughput (end-to-end)** | **1273.39 images/min** |
| **Drain Throughput** | **1811.79 images/min** |
| **Throughput per Worker** | **424.46 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 64.0 ms | 91.0 ms | 9578.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 101.20 s (101202 ms) | 131.95 s (131948 ms) | 133.13 s (133130 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 835 mCPU | 756 mCPU |
| **Memory (RAM)** | 1280.0 MiB | 1258.1 MiB |

**CPU (counters)**: 766 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 65.0 ms | 94.1 ms |
| **VN plates** | 30 | 56.0 ms | 95.5 ms |
