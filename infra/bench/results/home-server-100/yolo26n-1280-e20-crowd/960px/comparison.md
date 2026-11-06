## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-160810-fixed-2w` | Fixed | small | 960px | yes | 2 | 100 | 0 | **58.37** | **98.06** | 29.19 | 70.25s | 81.69s | 775ms | 1556ms | 856m | 611m | 817m | 648MiB | - | - |
| `20261105-161036-autoscale-0-3` | Autoscale | small | 960px | no | 0→3 | 100 | 0 | **115.45** | **147.68** | 38.48 | 27.40s | 29.16s | 732ms | 1541ms | 926m | 282m | 282m (sampled) | 730MiB | 10.3s | 117.3s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-160810-fixed-2w` | small | 70 | 824ms | 1704ms | 30 | 626ms | 1042ms |
| `20261105-161036-autoscale-0-3` | small | 70 | 812ms | 1608ms | 30 | 534ms | 1078ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
