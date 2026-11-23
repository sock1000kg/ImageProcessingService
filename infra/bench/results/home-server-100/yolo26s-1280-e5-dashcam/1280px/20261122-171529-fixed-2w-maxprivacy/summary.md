# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-171529-fixed-2w-maxprivacy

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-22T17:15:33Z |
| **End Time** | 2026-11-22T17:19:04Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 161.26 s |
| **Throughput (end-to-end)** | **37.21 images/min** |
| **Drain Throughput** | **38.10 images/min** |
| **Throughput per Worker** | **18.60 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 2846.0 ms | 4642.8 ms | 4984.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 78.00 s (78002 ms) | 133.63 s (133627 ms) | 139.88 s (139877 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 978 mCPU | 846 mCPU |
| **Memory (RAM)** | 1149.0 MiB | 826.9 MiB |

**CPU (counters)**: 908 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 2943.5 ms | 4710.6 ms |
| **VN plates** | 30 | 2471.5 ms | 3654.1 ms |
