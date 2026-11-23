## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-dashcam/20261122-184107-fixed-3w-preload-maxprivacy-web4cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **965.28** | **1232.43** | 321.76 | 120.66s | 182.08s | 103ms | 242ms | 930m | 895m | 898m | 1350MiB | - | - |
| `yolo26s-1280-e5-dashcam/20261122-184540-fixed-3w-preload-maxprivacy-wlface-web4cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **247.99** | **262.32** | 82.66 | 537.54s | 773.98s | 314ms | 1760ms | 1004m | 929m | 324m | 1532MiB | - | - |
| `yolo26s-1280-e5-dashcam/20261122-190132-fixed-3w-preload-maxprivacy-wlplate-web4cpu` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **289.45** | **309.23** | 96.48 | 242.44s | 609.05s | 106ms | 2193ms | 1006m | 982m | 981m | 1464MiB | - | - |
| `yolo26s-1280-e5-dashcam/20261122-192020-fixed-3w-maxprivacy-web500m` | Fixed | max | 1280px | no | 3 | 3726 | 0 | **1005.51** | **1018.97** | 335.17 | 89.33s | 95.36s | 104ms | 244ms | 927m | 736m | 735m | 1376MiB | - | - |
| `yolo26s-1280-e5-dashcam/20261122-192819-fixed-3w-maxprivacy-web2cpu` | Fixed | max | 1280px | no | 3 | 3726 | 0 | **1173.91** | **1179.83** | 391.30 | 61.47s | 108.57s | 103ms | 254ms | 954m | 759m | 839m | 1347MiB | - | - |
| `yolo26s-1280-e5-dashcam/20261122-193250-fixed-3w-maxprivacy` | Fixed | max | 1280px | no | 3 | 3726 | 0 | **1196.87** | **1207.60** | 398.96 | 58.20s | 100.68s | 102ms | 244ms | 920m | 841m | 839m | 1331MiB | - | - |
| `yolo26s-1280-e5-dashcam/20261122-225610-autoscale-0-3-maxprivacy` | Autoscale | max | 1280px | no | 0→3 | 3726 | 0 | **1015.44** | **1079.65** | 338.48 | 98.26s | 134.56s | 103ms | 258ms | 948m | 592m | 592m (sampled) | 1338MiB | 11.2s | 118.0s |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `yolo26s-1280-e5-dashcam/20261122-184107-fixed-3w-preload-maxprivacy-web4cpu` | max | 70 | 105ms | 320ms | 30 | 106ms | 148ms |
| `yolo26s-1280-e5-dashcam/20261122-184540-fixed-3w-preload-maxprivacy-wlface-web4cpu` | max | 70 | 383ms | 2045ms | 30 | 129ms | 402ms |
| `yolo26s-1280-e5-dashcam/20261122-190132-fixed-3w-preload-maxprivacy-wlplate-web4cpu` | max | 70 | 94ms | 1008ms | 30 | 1702ms | 3551ms |
| `yolo26s-1280-e5-dashcam/20261122-192020-fixed-3w-maxprivacy-web500m` | max | 70 | 110ms | 350ms | 30 | 100ms | 160ms |
| `yolo26s-1280-e5-dashcam/20261122-192819-fixed-3w-maxprivacy-web2cpu` | max | 70 | 106ms | 352ms | 30 | 97ms | 165ms |
| `yolo26s-1280-e5-dashcam/20261122-193250-fixed-3w-maxprivacy` | max | 70 | 108ms | 240ms | 30 | 84ms | 158ms |
| `yolo26s-1280-e5-dashcam/20261122-225610-autoscale-0-3-maxprivacy` | max | 70 | 101ms | 289ms | 30 | 105ms | 159ms |

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
