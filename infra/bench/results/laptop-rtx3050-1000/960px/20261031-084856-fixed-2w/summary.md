# Benchmark Summary: 20261031-084856-fixed-2w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 2 |
| **Dataset** | large |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T08:49:17Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T08:48:57Z |
| **End Time** | 2026-10-31T08:49:56Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 51.22 s |
| **Throughput (end-to-end)** | **1171.46 images/min** |
| **Drain Throughput** | **2018.71 images/min** |
| **Throughput per Worker** | **585.73 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 38.0 ms | 57.0 ms | 2838.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 30.91 s (30910 ms) | 33.85 s (33851 ms) | 34.89 s (34890 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 848 mCPU | 846 mCPU |
| **Memory (RAM)** | 1232.0 MiB | 1218.0 MiB |

**CPU (counters)**: 812 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 39.0 ms | 56.0 ms |
| **VN plates** | 300 | 35.0 ms | 66.1 ms |
