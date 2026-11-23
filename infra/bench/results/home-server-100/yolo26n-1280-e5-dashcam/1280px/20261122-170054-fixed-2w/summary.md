# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-170054-fixed-2w

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
| **Start Time** | 2026-11-22T17:00:57Z |
| **End Time** | 2026-11-22T17:02:49Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 62.07 s |
| **Throughput (end-to-end)** | **96.67 images/min** |
| **Drain Throughput** | **102.57 images/min** |
| **Throughput per Worker** | **48.33 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 964.5 ms | 1599.1 ms | 2784.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 26.02 s (26023 ms) | 34.82 s (34824 ms) | 36.25 s (36250 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 875 mCPU | 518 mCPU |
| **Memory (RAM)** | 848.0 MiB | 600.5 MiB |

**CPU (counters)**: 768 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 997.5 ms | 1624.8 ms |
| **VN plates** | 30 | 720.5 ms | 1141.0 ms |
