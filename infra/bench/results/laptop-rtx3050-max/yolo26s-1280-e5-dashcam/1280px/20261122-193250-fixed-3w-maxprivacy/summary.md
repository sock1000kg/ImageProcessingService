# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-193250-fixed-3w-maxprivacy

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T19:32:53Z |
| **End Time** | 2026-11-22T19:36:24Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 186.79 s |
| **Throughput (end-to-end)** | **1196.87 images/min** |
| **Drain Throughput** | **1207.60 images/min** |
| **Throughput per Worker** | **398.96 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 102.0 ms | 243.8 ms | 4312.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 58.20 s (58195 ms) | 100.68 s (100676 ms) | 104.75 s (104751 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 920 mCPU | 841 mCPU |
| **Memory (RAM)** | 1331.0 MiB | 1281.8 MiB |

**CPU (counters)**: 839 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 107.5 ms | 239.9 ms |
| **VN plates** | 30 | 84.0 ms | 158.0 ms |
