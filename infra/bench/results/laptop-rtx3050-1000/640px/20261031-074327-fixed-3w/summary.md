# Benchmark Summary: 20261031-074327-fixed-3w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | large |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T07:44:15Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T07:43:28Z |
| **End Time** | 2026-10-31T07:44:54Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 50.28 s |
| **Throughput (end-to-end)** | **1193.36 images/min** |
| **Drain Throughput** | **2150.31 images/min** |
| **Throughput per Worker** | **397.79 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 33.0 ms | 58.0 ms | 3237.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 32.52 s (32521 ms) | 33.64 s (33642 ms) | 33.87 s (33869 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 782 mCPU | 777 mCPU |
| **Memory (RAM)** | 1200.0 MiB | 1187.7 MiB |

**CPU (counters)**: 638 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 35.0 ms | 56.0 ms |
| **VN plates** | 300 | 30.0 ms | 71.0 ms |
