# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-180231-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-05T18:03:22Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T18:02:32Z |
| **End Time** | 2026-11-05T18:06:24Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 217.25 s |
| **Throughput (end-to-end)** | **1029.04 images/min** |
| **Drain Throughput** | **1346.05 images/min** |
| **Throughput per Worker** | **343.01 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 110.0 ms | 149.0 ms | 6370.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 116.90 s (116904 ms) | 169.52 s (169518 ms) | 175.10 s (175102 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 902 mCPU | 861 mCPU |
| **Memory (RAM)** | 1306.0 MiB | 1286.3 MiB |

**CPU (counters)**: 872 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 110.0 ms | 149.6 ms |
| **VN plates** | 30 | 109.0 ms | 152.7 ms |
