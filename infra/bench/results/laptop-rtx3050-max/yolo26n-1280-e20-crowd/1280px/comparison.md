## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e20-crowd/20261105-170936-fixed-3w` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **1273.39** | **1811.79** | 424.46 | 101.20s | 131.95s | 64ms | 91ms | 835m | 756m | 766m | 1280MiB | - | - |
| `yolo26n-1280-e20-crowd/20261105-171324-autoscale-0-3` | Autoscale | max | 1280px | no | 0→3 | 3726 | 0 | **1469.51** | **1589.12** | 489.84 | 72.42s | 80.80s | 68ms | 96ms | 824m | 454m | 454m (sampled) | 1306MiB | 4.9s | 101.8s |
| `yolo26n-1280-e20-crowd/20261105-171822-autoscale-1-3` | Autoscale | max | 1280px | no | 1→3 | 3726 | 0 | **1494.75** | **1502.57** | 498.25 | 63.84s | 71.45s | 69ms | 96ms | 833m | 245m | 685m | 1302MiB | - | 274.4s |
| `yolo26n-1280-e20-crowd/20261106-074919-fixed-3w-web-1cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **1080.53** | **1519.95** | 360.18 | 116.68s | 155.34s | 70ms | 107ms | 844m | 762m | 724m | 1263MiB | - | - |
| `yolo26n-1280-e20-crowd/20261106-075328-autoscale-1-3-web-1cpu` | Autoscale | max | 1280px | no | 1→3 | 3726 | 0 | **568.95** | **570.80** | 189.65 | 82.03s | 291.40s | 74ms | 154ms | 822m | 263m | 344m | 1393MiB | - | 310.9s |
| `yolo26n-1280-e20-crowd/20261106-080808-fixed-3w-web-2cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **1201.99** | **1744.22** | 400.66 | 105.38s | 137.69s | 65ms | 94ms | 830m | 744m | 712m | 1311MiB | - | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e20-crowd/20261105-170936-fixed-3w` | max | 70 | 65ms | 94ms | 30 | 56ms | 96ms |
| `yolo26n-1280-e20-crowd/20261105-171324-autoscale-0-3` | max | 70 | 68ms | 97ms | 30 | 56ms | 91ms |
| `yolo26n-1280-e20-crowd/20261105-171822-autoscale-1-3` | max | 70 | 73ms | 100ms | 30 | 60ms | 84ms |
| `yolo26n-1280-e20-crowd/20261106-074919-fixed-3w-web-1cpu` | max | 70 | 70ms | 136ms | 30 | 68ms | 100ms |
| `yolo26n-1280-e20-crowd/20261106-075328-autoscale-1-3-web-1cpu` | max | 70 | 72ms | 109ms | 30 | 76ms | 1080ms |
| `yolo26n-1280-e20-crowd/20261106-080808-fixed-3w-web-2cpu` | max | 70 | 70ms | 88ms | 30 | 62ms | 79ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
