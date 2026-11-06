## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-160036-fixed-2w` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **40.29** | **72.77** | 20.14 | 108.10s | 127.07s | 1034ms | 2000ms | 924m | 543m | 762m | 1092MiB | - | - |
| `20261105-160403-autoscale-0-3` | Autoscale | small | 1280px | no | 0→3 | 100 | 0 | **83.73** | **134.51** | 27.91 | 42.47s | 47.54s | 1041ms | 1811ms | 947m | 322m | 322m (sampled) | 925MiB | 16.2s | 121.6s |
| `20261106-072152-fixed-2w-traefik-1x0.5cpu` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **24.91** | **95.65** | 12.45 | 114.76s | 170.49s | 954ms | 2014ms | 999m | 922m | 907m | 809MiB | - | - |
| `20261106-072645-autoscale-0-3-traefik-1x0.5cpu` | Autoscale | small | 1280px | no | 0→3 | 100 | 0 | **23.38** | **29.96** | 7.79 | 34.02s | 61.53s | 800ms | 2331ms | 832m | 109m | 109m (sampled) | 883MiB | 57.2s | 114.6s |
| `20261106-073515-fixed-2w-traefik-2x0.5cpu` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **23.69** | **94.24** | 11.85 | 152.83s | 182.46s | 972ms | 1721ms | 940m | 921m | 837m | 706MiB | - | - |
| `20261106-074028-autoscale-0-3-traefik-2x0.5cpu` | Autoscale | small | 1280px | no | 0→3 | 100 | 0 | **22.35** | **27.85** | 7.45 | 37.25s | 58.24s | 892ms | 1735ms | 944m | 131m | 131m (sampled) | 851MiB | 52.0s | 113.5s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261105-160036-fixed-2w` | small | 70 | 1062ms | 1978ms | 30 | 1009ms | 1862ms |
| `20261105-160403-autoscale-0-3` | small | 70 | 1068ms | 1787ms | 30 | 880ms | 1813ms |
| `20261106-072152-fixed-2w-traefik-1x0.5cpu` | small | 70 | 972ms | 2111ms | 30 | 944ms | 1482ms |
| `20261106-072645-autoscale-0-3-traefik-1x0.5cpu` | small | 70 | 890ms | 2731ms | 30 | 668ms | 1552ms |
| `20261106-073515-fixed-2w-traefik-2x0.5cpu` | small | 70 | 1013ms | 1799ms | 30 | 917ms | 1615ms |
| `20261106-074028-autoscale-0-3-traefik-2x0.5cpu` | small | 70 | 857ms | 1946ms | 30 | 918ms | 1224ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
