## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e20-crowd/20261105-164948-fixed-3w` | Fixed | max | 960px | yes | 3 | 3726 | 0 | **1238.70** | **1796.54** | 412.90 | 108.12s | 132.93s | 50ms | 84ms | 779m | 665m | 632m | 1262MiB | - | - |
| `yolo26n-1280-e20-crowd/20261105-165343-autoscale-0-3` | Autoscale | max | 960px | no | 0→3 | 3726 | 0 | **1381.55** | **1501.44** | 460.52 | 79.94s | 89.43s | 55ms | 88ms | 726m | 374m | 374m (sampled) | 1280MiB | 10.7s | 104.9s |
| `yolo26n-1280-e20-crowd/20261105-165855-autoscale-1-3` | Autoscale | max | 960px | no | 1→3 | 3726 | 0 | **1397.20** | **1404.37** | 465.73 | 66.46s | 78.45s | 59ms | 97ms | 784m | 246m | 586m | 1408MiB | - | 262.7s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e20-crowd/20261105-164948-fixed-3w` | max | 70 | 50ms | 83ms | 30 | 46ms | 75ms |
| `yolo26n-1280-e20-crowd/20261105-165343-autoscale-0-3` | max | 70 | 57ms | 91ms | 30 | 48ms | 73ms |
| `yolo26n-1280-e20-crowd/20261105-165855-autoscale-1-3` | max | 70 | 60ms | 95ms | 30 | 44ms | 65ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
