# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-172902-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-05T17:29:52Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T17:29:03Z |
| **End Time** | 2026-11-05T17:31:58Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 163.76 s |
| **Throughput (end-to-end)** | **1365.13 images/min** |
| **Drain Throughput** | **1985.10 images/min** |
| **Throughput per Worker** | **455.04 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 48.0 ms | 74.0 ms | 5432.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 94.92 s (94920 ms) | 120.59 s (120586 ms) | 121.85 s (121854 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 800 mCPU | 746 mCPU |
| **Memory (RAM)** | 1305.0 MiB | 1266.6 MiB |

**CPU (counters)**: 670 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 50.0 ms | 76.1 ms |
| **VN plates** | 30 | 44.0 ms | 79.6 ms |
