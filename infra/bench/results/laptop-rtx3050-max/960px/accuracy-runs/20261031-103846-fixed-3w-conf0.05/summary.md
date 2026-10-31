# Benchmark Summary: 20261031-103846-fixed-3w-conf0.05

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:39:48Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:38:47Z |
| **End Time** | 2026-10-31T10:41:38Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 159.37 s |
| **Throughput (end-to-end)** | **1402.74 images/min** |
| **Drain Throughput** | **2187.09 images/min** |
| **Throughput per Worker** | **467.58 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 52.0 ms | 78.0 ms | 3946.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 87.94 s (87935 ms) | 108.41 s (108410 ms) | 109.22 s (109218 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 840 mCPU | 821 mCPU |
| **Memory (RAM)** | 1274.0 MiB | 1231.8 MiB |

**CPU (counters)**: 789 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 54.0 ms | 83.3 ms |
| **VN plates** | 30 | 47.5 ms | 75.5 ms |
