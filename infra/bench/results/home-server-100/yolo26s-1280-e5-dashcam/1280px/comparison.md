## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-dashcam/20261122-171529-fixed-2w-maxprivacy` | Fixed | small | 1280px | no | 2 | 100 | 0 | **37.21** | **38.10** | 18.60 | 78.00s | 133.63s | 2846ms | 4643ms | 978m | 846m | 908m | 1149MiB | - | - |
| `yolo26s-1280-e5-dashcam/20261122-171911-autoscale-0-2-maxprivacy` | Autoscale | small | 1280px | no | 0→2 | 100 | 0 | **33.07** | **36.81** | 16.53 | 97.87s | 154.11s | 2908ms | 5069ms | 992m | 617m | 617m (sampled) | 1014MiB | 11.1s | 114.6s |
| `yolo26s-1280-e5-dashcam/20261122-225609-fixed-2w-preload-maxprivacy` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **30.38** | **34.97** | 15.19 | 105.21s | 171.28s | 2990ms | 4829ms | 984m | 957m | 959m | 962MiB | - | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-dashcam/20261122-171529-fixed-2w-maxprivacy` | small | 70 | 2944ms | 4711ms | 30 | 2472ms | 3654ms |
| `yolo26s-1280-e5-dashcam/20261122-171911-autoscale-0-2-maxprivacy` | small | 70 | 2963ms | 5269ms | 30 | 2835ms | 4092ms |
| `yolo26s-1280-e5-dashcam/20261122-225609-fixed-2w-preload-maxprivacy` | small | 70 | 3078ms | 4772ms | 30 | 2882ms | 5156ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
