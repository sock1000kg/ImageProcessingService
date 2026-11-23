# Benchmark Summary: yolo26s-1280-e5-dashcam/20261122-225609-fixed-2w-preload-maxprivacy

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-22T22:56:33Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:6b5c9b16d641a5932c36f3bd87f0ec2de181d698` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-22T22:56:14Z |
| **End Time** | 2026-11-22T22:59:36Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 197.51 s |
| **Throughput (end-to-end)** | **30.38 images/min** |
| **Drain Throughput** | **34.97 images/min** |
| **Throughput per Worker** | **15.19 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 2989.5 ms | 4828.7 ms | 6786.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 105.21 s (105213 ms) | 171.28 s (171278 ms) | 181.17 s (181166 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 984 mCPU | 957 mCPU |
| **Memory (RAM)** | 962.0 MiB | 831.1 MiB |

**CPU (counters)**: 959 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 3077.5 ms | 4772.2 ms |
| **VN plates** | 30 | 2882.5 ms | 5155.5 ms |
