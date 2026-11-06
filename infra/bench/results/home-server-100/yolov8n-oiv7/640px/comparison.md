## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-155757-fixed-2w` | Fixed | small | 640px | yes | 2 | 100 | 0 | **41.59** | **80.79** | 20.80 | 106.87s | 121.97s | 901ms | 1418ms | 845m | 475m | 697m | 791MiB | - | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-155757-fixed-2w` | small | 70 | 931ms | 1465ms | 30 | 816ms | 1139ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
