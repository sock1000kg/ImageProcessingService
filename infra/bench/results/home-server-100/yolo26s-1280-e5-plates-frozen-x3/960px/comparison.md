## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-162259-fixed-2w` | Fixed | small | 960px | yes | 2 | 100 | 0 | **49.62** | **68.46** | 24.81 | 68.65s | 95.03s | 1489ms | 2443ms | 961m | 923m | 924m | 912MiB | - | - |
| `20261105-162540-autoscale-0-3` | Autoscale | small | 960px | no | 0→3 | 100 | 0 | **69.69** | **91.08** | 23.23 | 54.48s | 65.24s | 1446ms | 2481ms | 971m | 455m | 455m (sampled) | 937MiB | 16.9s | 103.8s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-162259-fixed-2w` | small | 70 | 1500ms | 2448ms | 30 | 1317ms | 2065ms |
| `20261105-162540-autoscale-0-3` | small | 70 | 1568ms | 2896ms | 30 | 1080ms | 2110ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
