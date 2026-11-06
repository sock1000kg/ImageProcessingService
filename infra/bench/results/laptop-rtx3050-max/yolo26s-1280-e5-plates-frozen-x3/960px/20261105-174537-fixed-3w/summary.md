# Benchmark Summary: yolo26s-1280-e5-plates-frozen-x3/20261105-174537-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-05T17:46:30Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-05T17:45:38Z |
| **End Time** | 2026-11-05T17:48:52Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 172.10 s |
| **Throughput (end-to-end)** | **1299.02 images/min** |
| **Drain Throughput** | **1850.72 images/min** |
| **Throughput per Worker** | **433.01 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 68.0 ms | 99.0 ms | 6162.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 95.76 s (95764 ms) | 127.00 s (127001 ms) | 130.36 s (130358 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 844 mCPU | 800 mCPU |
| **Memory (RAM)** | 1314.0 MiB | 1283.3 MiB |

**CPU (counters)**: 795 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 72.0 ms | 93.5 ms |
| **VN plates** | 30 | 71.5 ms | 94.6 ms |
