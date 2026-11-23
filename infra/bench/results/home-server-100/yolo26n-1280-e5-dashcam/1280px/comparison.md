## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e5-dashcam/20261122-170054-fixed-2w` | Fixed | small | 1280px | no | 2 | 100 | 0 | **96.67** | **102.57** | 48.33 | 26.02s | 34.82s | 964ms | 1599ms | 875m | 518m | 768m | 848MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-170255-autoscale-0-2` | Autoscale | small | 1280px | no | 0→2 | 100 | 0 | **62.88** | **76.09** | 31.44 | 56.56s | 72.38s | 1202ms | 2584ms | 970m | 429m | 429m (sampled) | 827MiB | 11.4s | 117.0s |
| `yolo26n-1280-e5-dashcam/20261122-170754-fixed-2w-preload` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **61.21** | **85.35** | 30.60 | 55.57s | 76.39s | 1048ms | 2104ms | 940m | 890m | 892m | 870MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-171002-fixed-2w-preload-wlface` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **47.45** | **61.34** | 23.73 | 75.23s | 103.54s | 1430ms | 3105ms | 963m | 922m | 912m | 869MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-171240-fixed-2w-preload-wlplate` | Fixed | small | 1280px | yes | 2 | 100 | 0 | **52.96** | **71.58** | 26.48 | 67.17s | 91.35s | 1288ms | 2492ms | 944m | 903m | 910m | 893MiB | - | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e5-dashcam/20261122-170054-fixed-2w` | small | 70 | 998ms | 1625ms | 30 | 720ms | 1141ms |
| `yolo26n-1280-e5-dashcam/20261122-170255-autoscale-0-2` | small | 70 | 1426ms | 2689ms | 30 | 995ms | 1825ms |
| `yolo26n-1280-e5-dashcam/20261122-170754-fixed-2w-preload` | small | 70 | 1051ms | 2115ms | 30 | 1033ms | 1754ms |
| `yolo26n-1280-e5-dashcam/20261122-171002-fixed-2w-preload-wlface` | small | 70 | 1547ms | 4566ms | 30 | 1264ms | 1936ms |
| `yolo26n-1280-e5-dashcam/20261122-171240-fixed-2w-preload-wlplate` | small | 70 | 1471ms | 2518ms | 30 | 1170ms | 2044ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
