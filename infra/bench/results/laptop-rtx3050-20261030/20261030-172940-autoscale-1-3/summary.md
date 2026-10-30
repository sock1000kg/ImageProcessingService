# Benchmark Summary: 20261030-172940-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | laptop-9uqcccr9 |
| **Node CPU Count** | 16 |
| **GPU** | NVIDIA GeForce RTX 3050 Laptop GPU |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-30T17:29:42Z |
| **End Time** | 2026-10-30T17:33:07Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 4.52 s |
| **Throughput** | **1326.85 images/min** |
| **Throughput per Worker** | **1326.85 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 26.5 ms | 56.1 ms | 70.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 1.27 s (1273 ms) | 1.92 s (1923 ms) | 2.12 s (2124 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 1 mCPU | 1 mCPU |
| **Memory (RAM)** | 342.0 MiB | 342.0 MiB |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 1 |
| **Time to scale back to min (cooldown)** | 0.48 s |
