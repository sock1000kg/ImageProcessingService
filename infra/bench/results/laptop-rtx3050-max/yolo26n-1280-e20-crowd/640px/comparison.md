## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e20-crowd/20261105-163221-fixed-3w` | Fixed | max | 640px | yes | 3 | 3726 | 0 | **1037.18** | **1457.18** | 345.73 | 132.22s | 163.35s | 51ms | 92ms | 774m | 637m | 594m | 1150MiB | - | - |
| `yolo26n-1280-e20-crowd/20261105-163638-autoscale-0-3` | Autoscale | max | 640px | no | 0→3 | 3726 | 0 | **1338.44** | **1443.87** | 446.15 | 82.33s | 90.00s | 51ms | 83ms | 778m | 381m | 381m (sampled) | 1185MiB | 4.5s | 87.5s |
| `yolo26n-1280-e20-crowd/20261105-164140-autoscale-1-3` | Autoscale | max | 640px | no | 1→3 | 3726 | 0 | **1386.59** | **1394.45** | 462.20 | 59.22s | 68.46s | 56ms | 95ms | 725m | 214m | 502m | 1230MiB | - | 265.1s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e20-crowd/20261105-163221-fixed-3w` | max | 70 | 55ms | 127ms | 30 | 42ms | 71ms |
| `yolo26n-1280-e20-crowd/20261105-163638-autoscale-0-3` | max | 70 | 53ms | 81ms | 30 | 38ms | 73ms |
| `yolo26n-1280-e20-crowd/20261105-164140-autoscale-1-3` | max | 70 | 58ms | 119ms | 30 | 38ms | 70ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
