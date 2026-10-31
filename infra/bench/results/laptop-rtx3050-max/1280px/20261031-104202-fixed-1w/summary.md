# Benchmark Summary: 20261031-104202-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:43:17Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:42:03Z |
| **End Time** | 2026-10-31T10:46:52Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 264.07 s |
| **Throughput (end-to-end)** | **846.59 images/min** |
| **Drain Throughput** | **1110.52 images/min** |
| **Throughput per Worker** | **846.59 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 37.0 ms | 52.0 ms | 3411.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 138.44 s (138444 ms) | 200.99 s (200987 ms) | 207.63 s (207630 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 839 mCPU | 824 mCPU |
| **Memory (RAM)** | 1291.0 MiB | 1233.4 MiB |

**CPU (counters)**: 829 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 37.0 ms | 48.1 ms |
| **VN plates** | 30 | 33.5 ms | 58.5 ms |
