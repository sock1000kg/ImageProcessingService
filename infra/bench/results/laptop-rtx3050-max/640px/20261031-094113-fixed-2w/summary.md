# Benchmark Summary: 20261031-094113-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:42:23Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T09:41:15Z |
| **End Time** | 2026-10-31T09:44:20Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 154.99 s |
| **Throughput (end-to-end)** | **1442.43 images/min** |
| **Drain Throughput** | **2273.18 images/min** |
| **Throughput per Worker** | **721.22 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 33.0 ms | 48.0 ms | 3428.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 80.12 s (80124 ms) | 101.45 s (101446 ms) | 103.90 s (103896 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 793 mCPU | 781 mCPU |
| **Memory (RAM)** | 1235.0 MiB | 1196.5 MiB |

**CPU (counters)**: 757 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 34.5 ms | 45.5 ms |
| **VN plates** | 30 | 27.5 ms | 53.7 ms |
