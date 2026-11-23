# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-171240-fixed-2w-preload-wlplate

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-22T17:13:37Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-22T17:12:43Z |
| **End Time** | 2026-11-22T17:15:15Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 113.29 s |
| **Throughput (end-to-end)** | **52.96 images/min** |
| **Drain Throughput** | **71.58 images/min** |
| **Throughput per Worker** | **26.48 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1288.0 ms | 2491.6 ms | 6331.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 67.17 s (67168 ms) | 91.35 s (91355 ms) | 94.37 s (94370 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 944 mCPU | 903 mCPU |
| **Memory (RAM)** | 893.0 MiB | 704.8 MiB |

**CPU (counters)**: 910 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1471.0 ms | 2518.1 ms |
| **VN plates** | 30 | 1170.0 ms | 2044.4 ms |
