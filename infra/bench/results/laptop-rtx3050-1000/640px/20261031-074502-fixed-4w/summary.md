# Benchmark Summary: 20261031-074502-fixed-4w

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | fixed 4 |
| **Dataset** | large |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | yes (workers released at 2026-10-31T07:45:55Z) |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `bdcb1efed368ce48bf835d74ef90b9702d9e810b1d653cc3a80f50209989e604` |
| **Start Time** | 2026-10-31T07:45:03Z |
| **End Time** | 2026-10-31T07:46:36Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 1000 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 56.27 s |
| **Throughput (end-to-end)** | **1066.29 images/min** |
| **Drain Throughput** | **1883.48 images/min** |
| **Throughput per Worker** | **266.57 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 42.0 ms | 83.0 ms | 6925.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 37.57 s (37569 ms) | 39.18 s (39182 ms) | 39.69 s (39685 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 812 mCPU | 752 mCPU |
| **Memory (RAM)** | 1208.0 MiB | 1164.0 MiB |

**CPU (counters)**: 687 mCPU per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 700 | 45.0 ms | 86.0 ms |
| **VN plates** | 300 | 35.0 ms | 74.1 ms |
