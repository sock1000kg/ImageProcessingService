# Benchmark Summary: 20261031-101017-fixed-1w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 1 |
| **Dataset** | max |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T10:11:25Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T10:10:18Z |
| **End Time** | 2026-10-31T10:14:55Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 247.85 s |
| **Throughput (end-to-end)** | **902.00 images/min** |
| **Drain Throughput** | **1161.71 images/min** |
| **Throughput per Worker** | **902.00 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 35.0 ms | 48.0 ms | 3294.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 129.65 s (129650 ms) | 192.75 s (192745 ms) | 198.55 s (198548 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 841 mCPU | 804 mCPU |
| **Memory (RAM)** | 1282.0 MiB | 1247.2 MiB |

**CPU (counters)**: 785 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 36.0 ms | 48.5 ms |
| **VN plates** | 30 | 30.0 ms | 50.9 ms |
