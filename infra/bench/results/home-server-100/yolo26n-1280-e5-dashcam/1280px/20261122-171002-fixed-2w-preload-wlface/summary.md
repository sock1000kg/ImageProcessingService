# Benchmark Summary: yolo26n-1280-e5-dashcam/20261122-171002-fixed-2w-preload-wlface

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-22T17:10:44Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-22T17:10:05Z |
| **End Time** | 2026-11-22T17:12:34Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 126.44 s |
| **Throughput (end-to-end)** | **47.45 images/min** |
| **Drain Throughput** | **61.34 images/min** |
| **Throughput per Worker** | **23.73 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 1429.5 ms | 3105.0 ms | 7432.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 75.23 s (75229 ms) | 103.54 s (103542 ms) | 106.90 s (106898 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 963 mCPU | 922 mCPU |
| **Memory (RAM)** | 869.0 MiB | 778.6 MiB |

**CPU (counters)**: 912 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 1547.0 ms | 4566.5 ms |
| **VN plates** | 30 | 1263.5 ms | 1936.2 ms |
