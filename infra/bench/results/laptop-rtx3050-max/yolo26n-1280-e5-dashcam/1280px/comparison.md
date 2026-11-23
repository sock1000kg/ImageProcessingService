## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e5-dashcam/20261122-171624-fixed-3w` | Fixed | max | 1280px | no | 3 | 3726 | 0 | **1421.11** | **1430.38** | 473.70 | 55.63s | 70.59s | 65ms | 214ms | 906m | 683m | 778m | 1337MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-171956-autoscale-0-3` | Autoscale | max | 1280px | no | 0→3 | 3726 | 0 | **1322.58** | **1428.31** | 440.86 | 68.70s | 86.26s | 64ms | 211ms | 884m | 495m | 495m (sampled) | 1300MiB | 11.4s | 117.3s |
| `yolo26n-1280-e5-dashcam/20261122-181155-fixed-3w-preload-web4cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **1176.92** | **1645.67** | 392.31 | 102.71s | 140.63s | 61ms | 207ms | 916m | 879m | 865m | 1313MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-181559-fixed-3w-preload-wlface-web4cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **288.70** | **308.76** | 96.23 | 496.82s | 720.69s | 310ms | 1524ms | 1004m | 996m | 994m | 1532MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-182946-fixed-3w-preload-wlplate-web4cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **360.21** | **391.62** | 120.07 | 163.04s | 463.10s | 66ms | 1909ms | 1011m | 974m | 969m | 1452MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-191600-fixed-3w-web500m` | Fixed | max | 1280px | no | 3 | 3726 | 0 | **1010.15** | **1024.76** | 336.72 | 81.47s | 101.29s | 61ms | 204ms | 897m | 553m | 503m | 1326MiB | - | - |
| `yolo26n-1280-e5-dashcam/20261122-192525-fixed-3w-web2cpu` | Fixed | max | 1280px | no | 3 | 3726 | 0 | **1481.16** | **1490.66** | 493.72 | 52.17s | 69.32s | 65ms | 202ms | 891m | 753m | 797m | 1274MiB | - | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26n-1280-e5-dashcam/20261122-171624-fixed-3w` | max | 70 | 64ms | 200ms | 30 | 54ms | 84ms |
| `yolo26n-1280-e5-dashcam/20261122-171956-autoscale-0-3` | max | 70 | 68ms | 287ms | 30 | 57ms | 77ms |
| `yolo26n-1280-e5-dashcam/20261122-181155-fixed-3w-preload-web4cpu` | max | 70 | 62ms | 252ms | 30 | 59ms | 95ms |
| `yolo26n-1280-e5-dashcam/20261122-181559-fixed-3w-preload-wlface-web4cpu` | max | 70 | 358ms | 1631ms | 30 | 112ms | 359ms |
| `yolo26n-1280-e5-dashcam/20261122-182946-fixed-3w-preload-wlplate-web4cpu` | max | 70 | 56ms | 685ms | 30 | 1646ms | 2406ms |
| `yolo26n-1280-e5-dashcam/20261122-191600-fixed-3w-web500m` | max | 70 | 72ms | 286ms | 30 | 58ms | 83ms |
| `yolo26n-1280-e5-dashcam/20261122-192525-fixed-3w-web2cpu` | max | 70 | 67ms | 193ms | 30 | 56ms | 76ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
