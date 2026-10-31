# Benchmark Summary: 20261031-072428-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | small |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Node CPU Count** | 4 |
| **GPU** | none |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T07:24:29Z |
| **End Time** | 2026-10-31T07:32:17Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 326.27 s |
| **Throughput (end-to-end)** | **18.39 images/min** |
| **Drain Throughput** | **18.42 images/min** |
| **Throughput per Worker** | **9.19 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 5873.5 ms | 8383.0 ms | 9154.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 151.19 s (151194 ms) | 279.84 s (279844 ms) | 297.15 s (297148 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 969 mCPU | 905 mCPU |
| **Memory (RAM)** | 764.0 MiB | 642.2 MiB |

**CPU (counters)**: 908 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 5997.5 ms | 8413.7 ms |
| **VN plates** | 30 | 5749.5 ms | 8050.6 ms |
