# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-190132-fixed-3w-preload-maxprivacy-wlplate-web4cpu

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-22T19:02:59Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T19:01:34Z |
| **End Time** | 2026-11-22T19:15:17Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 772.36 s |
| **Throughput (end-to-end)** | **289.45 images/min** |
| **Drain Throughput** | **309.23 images/min** |
| **Throughput per Worker** | **96.48 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 106.0 ms | 2192.8 ms | 10632.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 242.44 s (242444 ms) | 609.05 s (609048 ms) | 728.87 s (728871 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1006 mCPU | 982 mCPU |
| **Memory (RAM)** | 1464.0 MiB | 1401.9 MiB |

**CPU (counters)**: 981 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 94.0 ms | 1008.2 ms |
| **VN plates** | 30 | 1702.0 ms | 3550.6 ms |
