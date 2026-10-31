# Benchmark Summary: 20261031-095137-autoscale-0-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→3 |
| **Dataset** | max |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 4 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `38b7224751152660aa274ffad0ccb365037aa72a78208e1146f71876770114f2` |
| **Start Time** | 2026-10-31T09:51:38Z |
| **End Time** | 2026-10-31T09:54:22Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 3726 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 141.34 s |
| **Throughput (end-to-end)** | **1581.77 images/min** |
| **Drain Throughput** | **1714.47 images/min** |
| **Throughput per Worker** | **527.26 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 40.0 ms | 69.0 ms | 5629.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 60.89 s (60892 ms) | 63.60 s (63603 ms) | 64.05 s (64051 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 660 mCPU | 306 mCPU |
| **Memory (RAM)** | 1396.0 MiB | 1265.2 MiB |

**CPU (counters)**: 306 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 44.0 ms | 68.0 ms |
| **VN plates** | 30 | 32.5 ms | 61.5 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 9.88 s |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 112.54 s |
