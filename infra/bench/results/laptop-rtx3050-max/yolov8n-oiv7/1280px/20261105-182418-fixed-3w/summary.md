# Benchmark Summary: 20261105-182418-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-05T18:25:12Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T18:24:20Z |
| **End Time** | 2026-11-05T18:27:31Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 173.10 s |
| **Throughput (end-to-end)** | **1291.47 images/min** |
| **Drain Throughput** | **1857.09 images/min** |
| **Throughput per Worker** | **430.49 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 73.0 ms | 99.0 ms | 5492.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 94.87 s (94866 ms) | 126.77 s (126772 ms) | 130.24 s (130243 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 858 mCPU | 796 mCPU |
| **Memory (RAM)** | 1299.0 MiB | 1259.6 MiB |

**CPU (counters)**: 837 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 78.0 ms | 100.7 ms |
| **VN plates** | 30 | 67.0 ms | 113.3 ms |
