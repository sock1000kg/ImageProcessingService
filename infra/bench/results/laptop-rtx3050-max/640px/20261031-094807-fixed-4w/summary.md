# Benchmark Summary: 20261031-094807-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:49:14Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T09:48:08Z |
| **End Time** | 2026-10-31T09:51:08Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 158.73 s |
| **Throughput (end-to-end)** | **1408.44 images/min** |
| **Drain Throughput** | **2192.60 images/min** |
| **Throughput per Worker** | **352.11 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 43.0 ms | 64.0 ms | 7640.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 92.11 s (92108 ms) | 108.52 s (108524 ms) | 109.69 s (109693 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 700 mCPU | 598 mCPU |
| **Memory (RAM)** | 1234.0 MiB | 1202.5 MiB |

**CPU (counters)**: 531 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 45.0 ms | 62.1 ms |
| **VN plates** | 30 | 39.5 ms | 65.3 ms |
