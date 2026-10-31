# Benchmark Summary: 20261030-143709-autoscale-1-3

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | autoscale 1→3 |
| **Container Image** | `socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187` |
| **CPU Limit** | 1 |
| **Memory Limit** | 1536Mi |
| **Node** | home-server |
| **Dataset Hash** | `d4944e1e41ba419b6f2caddba0c57cc1817976f646b4fea6a7c3b36c25bdaacd` |
| **Start Time** | 2026-10-30T14:37:11Z |
| **End Time** | 2026-10-30T14:42:13Z |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | 100 |
| **Failed Jobs** | 0 |
| **Total Processing Duration** | 255.44 s |
| **Throughput** | **23.49 images/min** |
| **Throughput per Worker** | **7.83 images/min/worker** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | 5369.5 ms | 7553.8 ms | 31862.0 ms |
| **End-to-End Latency (`updated_at − created_at`)** | 149.35 s (149347 ms) | 214.37 s (214373 ms) | 223.75 s (223754 ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | 949 mCPU | 333 mCPU |
| **Memory (RAM)** | 579.0 MiB | 523.8 MiB |

## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | N/A |
| **Max Replicas Reached** | 3 |
| **Time to scale back to min (cooldown)** | 291.80 s |
