## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-174537-fixed-3w` | Fixed | max | 960px | yes | 3 | 3726 | 0 | **1299.02** | **1850.72** | 433.01 | 95.76s | 127.00s | 68ms | 99ms | 844m | 800m | 795m | 1314MiB | - | - |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-174923-autoscale-0-3` | Autoscale | max | 960px | no | 0→3 | 3726 | 0 | **1454.15** | **1569.71** | 484.72 | 72.78s | 82.44s | 74ms | 102ms | 847m | 461m | 461m (sampled) | 1335MiB | 4.9s | 111.2s |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-175432-autoscale-1-3` | Autoscale | max | 960px | no | 1→3 | 3726 | 0 | **1499.93** | **1507.40** | 499.98 | 60.51s | 66.85s | 74ms | 106ms | 817m | 261m | 681m | 1339MiB | - | 277.9s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-174537-fixed-3w` | max | 70 | 72ms | 94ms | 30 | 72ms | 95ms |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-174923-autoscale-0-3` | max | 70 | 76ms | 100ms | 30 | 72ms | 97ms |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-175432-autoscale-1-3` | max | 70 | 72ms | 104ms | 30 | 74ms | 93ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
