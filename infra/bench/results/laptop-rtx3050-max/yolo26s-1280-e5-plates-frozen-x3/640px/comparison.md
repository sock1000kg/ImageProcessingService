## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-172902-fixed-3w` | Fixed | max | 640px | yes | 3 | 3726 | 0 | **1365.13** | **1985.10** | 455.04 | 94.92s | 120.59s | 48ms | 74ms | 800m | 746m | 670m | 1305MiB | - | - |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-173229-autoscale-0-3` | Autoscale | max | 640px | no | 0→3 | 3726 | 0 | **1388.96** | **1497.30** | 462.99 | 79.96s | 90.62s | 54ms | 84ms | 702m | 377m | 377m (sampled) | 1326MiB | 4.4s | 104.4s |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-173739-autoscale-1-3` | Autoscale | max | 640px | no | 1→3 | 3726 | 0 | **1552.30** | **1560.76** | 517.43 | 56.86s | 65.12s | 55ms | 83ms | 934m | 215m | 535m | 1350MiB | - | 282.2s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-172902-fixed-3w` | max | 70 | 50ms | 76ms | 30 | 44ms | 80ms |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-173229-autoscale-0-3` | max | 70 | 52ms | 86ms | 30 | 44ms | 71ms |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-173739-autoscale-1-3` | max | 70 | 56ms | 94ms | 30 | 46ms | 62ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
