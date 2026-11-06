## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-180231-fixed-3w` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **1029.04** | **1346.05** | 343.01 | 116.90s | 169.52s | 110ms | 149ms | 902m | 861m | 872m | 1306MiB | - | - |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-180654-autoscale-0-3` | Autoscale | max | 1280px | no | 0→3 | 3726 | 0 | **1153.11** | **1237.71** | 384.37 | 82.44s | 113.81s | 112ms | 154ms | 907m | 527m | 527m (sampled) | 1292MiB | 11.0s | 123.1s |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-181252-autoscale-1-3` | Autoscale | max | 1280px | no | 1→3 | 3726 | 0 | **1256.61** | **1261.80** | 418.87 | 65.88s | 98.75s | 109ms | 151ms | 906m | 311m | 777m | 1331MiB | - | 294.0s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-180231-fixed-3w` | max | 70 | 110ms | 150ms | 30 | 109ms | 153ms |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-180654-autoscale-0-3` | max | 70 | 114ms | 156ms | 30 | 117ms | 152ms |
| `yolo26s-1280-e5-plates-frozen-x3/20261105-181252-autoscale-1-3` | max | 70 | 116ms | 164ms | 30 | 112ms | 152ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
