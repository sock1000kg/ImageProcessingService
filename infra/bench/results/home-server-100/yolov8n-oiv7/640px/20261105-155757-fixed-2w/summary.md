# Benchmark Summary: 20261105-155757-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 1 |
| **Preload** | yes (workers released at 2026-11-05T15:58:24Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-11-05T15:57:59Z |
| **End Time** | 2026-11-05T16:00:29Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 144.26 s |
| **Throughput (end-to-end)** | **41.59 images/min** |
| **Drain Throughput** | **80.79 images/min** |
| **Throughput per Worker** | **20.80 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 901.0 ms | 1417.5 ms | 19733.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 106.87 s (106873 ms) | 121.97 s (121973 ms) | 123.20 s (123203 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 845 mCPU | 475 mCPU |
| **Memory (RAM)** | 791.0 MiB | 587.3 MiB |

**CPU (counters)**: 697 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 931.0 ms | 1464.9 ms |
| **VN plates** | 30 | 815.5 ms | 1139.1 ms |
