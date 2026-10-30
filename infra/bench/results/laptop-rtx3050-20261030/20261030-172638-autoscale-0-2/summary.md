# Benchmark Summary: 20261030-172638-autoscale-0-2

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→2 |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-30T17:26:40Z |
| **End Time** | 2026-10-30T17:27:40Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 19.28 s |
| **Throughput** | **311.19 images/min** |
| **Throughput per Worker** | **155.59 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 34.0 ms | 94.1 ms | 5318.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 17.07 s (17074 ms) | 17.73 s (17727 ms) | 17.80 s (17800 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 684 mCPU | 39 mCPU |
| **Memory (RAM)** | 1311.0 MiB | 1297.6 MiB |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 11.24 s |
| **Max Replicas Reached** | 2 |
| **Time to scale back to min (cooldown)** | 113.96 s |
