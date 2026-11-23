# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-184540-fixed-3w-preload-maxprivacy-wlface-web4cpu

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-22T18:46:55Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T18:45:42Z |
| **End Time** | 2026-11-22T19:01:25Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 901.50 s |
| **Throughput (end-to-end)** | **247.99 images/min** |
| **Drain Throughput** | **262.32 images/min** |
| **Throughput per Worker** | **82.66 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 314.0 ms | 1760.2 ms | 10404.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 537.54 s (537544 ms) | 773.98 s (773984 ms) | 865.85 s (865853 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1004 mCPU | 929 mCPU |
| **Memory (RAM)** | 1532.0 MiB | 1445.8 MiB |

**CPU (counters)**: 324 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 383.0 ms | 2045.4 ms |
| **VN plates** | 30 | 129.0 ms | 401.6 ms |
