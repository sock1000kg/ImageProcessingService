# Benchmark Summary: 20261030-142659-autoscale-0-2

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 0→2 |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-30T14:27:00Z |
| **End Time** | 2026-10-30T14:31:35Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 269.63 s |
| **Throughput** | **22.25 images/min** |
| **Throughput per Worker** | **11.13 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 3474.5 ms | 5211.3 ms | 28244.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 167.14 s (167142 ms) | 243.61 s (243609 ms) | 254.00 s (253997 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 946 mCPU | 624 mCPU |
| **Memory (RAM)** | 606.0 MiB | 513.3 MiB |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | 15.99 s |
| **Max Replicas Reached** | 2 |
| **Time to scale back to min (cooldown)** | 120.36 s |
