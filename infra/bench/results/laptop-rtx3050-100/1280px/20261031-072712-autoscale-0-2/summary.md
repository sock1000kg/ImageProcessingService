# Benchmark Summary: 20261031-072712-autoscale-0-2

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→2 |
| **Dataset** | small |
| **YOLO Input Size** | 1280px |
| **Parallel Uploads** | 1 |
| **Preload** | no |
| **Container Image** | `socknot1000kg/imgproc-engine:1f4e9f1dbb0a44ab1259ad94ec16058c9f3116d7` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-31T07:27:14Z |
| **End Time** | 2026-10-31T07:27:45Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 24.56 s |
| **Throughput (end-to-end)** | **244.29 images/min** |
| **Drain Throughput** | **602.35 images/min** |
| **Throughput per Worker** | **122.14 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 47.0 ms | 85.5 ms | 4873.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 21.97 s (21968 ms) | 22.98 s (22975 ms) | 23.12 s (23117 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 711 mCPU | 118 mCPU |
| **Memory (RAM)** | 1385.0 MiB | 1292.7 MiB |

**CPU (counters)**: 118 mCPU (sampled) per worker (Δ`container_cpu_usage_seconds_total` / window, workers present at start and end; `(sampled)` = `kubectl top` average).

## Processing Time by Subset
| Subset | Images | p50 | p95 |
| --- | --- | --- | --- |
| **WIDER (faces)** | 70 | 44.0 ms | 81.4 ms |
| **VN plates** | 30 | 55.5 ms | 86.4 ms |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 10.69 s |
| **Max Replicas Reached** | 2 |
| **Time to scale back to min (cooldown)** | 114.12 s |
