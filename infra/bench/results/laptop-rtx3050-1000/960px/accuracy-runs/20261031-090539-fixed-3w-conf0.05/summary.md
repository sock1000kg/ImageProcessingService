# Benchmark Summary: 20261031-090539-fixed-3w-conf0.05

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 3 |
| **Dataset** | large |
| **YOLO Input Size** | 960px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T09:06:27Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T09:05:40Z |
| **End Time** | 2026-10-31T09:07:06Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 51.82 s |
| **Throughput (end-to-end)** | **1157.76 images/min** |
| **Drain Throughput** | **2041.58 images/min** |
| **Throughput per Worker** | **385.92 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 51.5 ms | 82.0 ms | 3389.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 31.16 s (31155 ms) | 34.46 s (34456 ms) | 34.89 s (34894 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 818 mCPU | 796 mCPU |
| **Memory (RAM)** | 1225.0 MiB | 1179.3 MiB |

**CPU (counters)**: 755 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 55.0 ms | 82.0 ms |
| **VN plates** | 300 | 45.0 ms | 80.1 ms |
