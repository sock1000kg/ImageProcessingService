# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-184107-fixed-3w-preload-maxprivacy-web4cpu

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | max |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-11-22T18:42:23Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-11-22T18:41:09Z |
| **End Time** | 2026-11-22T18:45:33Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 231.60 s |
| **Throughput (end-to-end)** | **965.28 images/min** |
| **Drain Throughput** | **1232.43 images/min** |
| **Throughput per Worker** | **321.76 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 103.0 ms | 241.8 ms | 5123.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 120.66 s (120661 ms) | 182.08 s (182077 ms) | 187.68 s (187675 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 930 mCPU | 895 mCPU |
| **Memory (RAM)** | 1350.0 MiB | 1309.8 MiB |

**CPU (counters)**: 898 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 105.0 ms | 320.1 ms |
| **VN plates** | 30 | 105.5 ms | 148.2 ms |
