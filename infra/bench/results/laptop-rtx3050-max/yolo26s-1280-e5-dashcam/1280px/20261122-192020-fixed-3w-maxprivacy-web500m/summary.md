# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-192020-fixed-3w-maxprivacy-web500m

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
| **Start Time** | 2026-11-22T19:20:22Z |
| **End Time** | 2026-11-22T19:24:46Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 222.34 s |
| **Throughput (end-to-end)** | **1005.51 images/min** |
| **Drain Throughput** | **1018.97 images/min** |
| **Throughput per Worker** | **335.17 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 104.0 ms | 243.8 ms | 4626.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 89.33 s (89325 ms) | 95.36 s (95362 ms) | 96.86 s (96855 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 927 mCPU | 736 mCPU |
| **Memory (RAM)** | 1376.0 MiB | 1274.2 MiB |

**CPU (counters)**: 735 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 110.0 ms | 350.1 ms |
| **VN plates** | 30 | 100.5 ms | 159.8 ms |
