> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 1000 images (700 WIDER FACE val + 300 VN plates), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-090715-fixed-1w` | Fixed | large | 1280px | yes | 1 | 1000 | 0 | **779.65** | **1088.71** | 779.65 | 44.07s | 58.93s | 36ms | 53ms | 826m | 782m | 824m | 1218MiB | - | - |
| `20261031-090915-fixed-2w` | Fixed | large | 1280px | yes | 2 | 1000 | 0 | **1050.75** | **1664.40** | 525.38 | 32.43s | 40.04s | 51ms | 76ms | 877m | 871m | 796m | 1224MiB | - | - |
| `20261031-091056-fixed-3w` | Fixed | large | 1280px | yes | 3 | 1000 | 0 | **1108.87** | **1814.94** | 369.62 | 31.23s | 37.13s | 72ms | 99ms | 850m | 835m | 864m | 1210MiB | - | - |
| `20261031-091233-fixed-4w` | Fixed | large | 1280px | yes | 4 | 1000 | 0 | **717.21** | **997.77** | 179.30 | 43.93s | 63.13s | 62ms | 1378ms | 999m | 924m | 932m | 1218MiB | - | - |
| `20261031-091442-autoscale-0-3` | Autoscale | large | 1280px | no | 0→3 | 1000 | 0 | **1296.23** | **1675.51** | 432.08 | 23.83s | 28.36s | 73ms | 102ms | 857m | 246m | 246m (sampled) | 1350MiB | 4.0s | 113.7s |
| `20261031-091808-autoscale-1-3` | Autoscale | large | 1280px | no | 1→3 | 1000 | 0 | **1552.63** | **1566.29** | 517.54 | 16.71s | 17.86s | 68ms | 97ms | 899m | 111m | 723m | 1233MiB | - | 300.5s |
| `20261031-093226-deface-gpu` | Deface (CUDAExecutionProvider) | large | 640x480 | - | - | 1000 | 0 | **771.91** | - | 771.91 | - | - | 37ms | 209ms | - | - | - | - | 0.85s | - |
| `20261031-092910-deface-gpu` | Deface (CUDAExecutionProvider) | large | full | - | - | 1000 | 0 | **311.21** | - | 311.21 | - | - | 91ms | 333ms | - | - | - | - | 1.16s | - |
| `20261031-093345-deface-cpu` | Deface (CPUExecutionProvider) | large | full | - | - | 1000 | 0 | **346.12** | - | 346.12 | - | - | 157ms | 348ms | - | - | - | - | 0.14s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-090715-fixed-1w` | large | 700 | 38ms | 51ms | 300 | 32ms | 69ms |
| `20261031-090915-fixed-2w` | large | 700 | 52ms | 76ms | 300 | 49ms | 88ms |
| `20261031-091056-fixed-3w` | large | 700 | 73ms | 97ms | 300 | 69ms | 107ms |
| `20261031-091233-fixed-4w` | large | 700 | 68ms | 1353ms | 300 | 47ms | 1430ms |
| `20261031-091442-autoscale-0-3` | large | 700 | 76ms | 101ms | 300 | 67ms | 103ms |
| `20261031-091808-autoscale-1-3` | large | 700 | 67ms | 97ms | 300 | 70ms | 96ms |
| `20261031-093226-deface-gpu` | large | 700 | 42ms | 270ms | 300 | 27ms | 84ms |
| `20261031-092910-deface-gpu` | large | 700 | 99ms | 476ms | 300 | 80ms | 185ms |
| `20261031-093345-deface-cpu` | large | 700 | 167ms | 349ms | 300 | 86ms | 257ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
