## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-161407-fixed-2w` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **28.08** | **32.63** | 14.04 | 129.71s | 187.79s | 3414ms | 5479ms | 990m | 963m | 958m | 1102MiB | - | - |
| `20261105-163016-autoscale-0-3` | Autoscale | small | 1280px | no | 0→3 | 100 | 0 | **53.25** | **60.15** | 17.75 | 63.67s | 92.86s | 2544ms | 4038ms | 979m | 508m | 508m (sampled) | 1035MiB | 10.9s | 113.2s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-161407-fixed-2w` | small | 70 | 3772ms | 5879ms | 30 | 2582ms | 4004ms |
| `20261105-163016-autoscale-0-3` | small | 70 | 2633ms | 4084ms | 30 | 2072ms | 2979ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
