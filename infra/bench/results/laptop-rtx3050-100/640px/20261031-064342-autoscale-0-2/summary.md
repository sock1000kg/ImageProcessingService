# Benchmark Summary: 20261031-064342-autoscale-0-2

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→2 |
| **Dataset** | small |
| **YOLO Input Size** | 640px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T06:43:43Z |
| **End Time** | 2026-10-31T06:44:59Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 26.59 s |
| **Throughput (end-to-end)** | **225.67 images/min** |
| **Drain Throughput** | **562.27 images/min** |
| **Throughput per Worker** | **112.84 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 35.5 ms | 77.4 ms | 7151.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 23.42 s (23420 ms) | 24.11 s (24112 ms) | 24.20 s (24199 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 431 mCPU | 70 mCPU |
| **Memory (RAM)** | 1353.0 MiB | 1223.6 MiB |

**CPU (counters)**: 70 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 37.0 ms | 82.5 ms |
| **VN plates** | 30 | 31.5 ms | 52.0 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 10.45 s |
| **Max Replicas Reached** | 2 |
| **Time to scale back to min (cooldown)** | 122.86 s |
