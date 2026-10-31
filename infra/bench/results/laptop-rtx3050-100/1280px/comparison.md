> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 100 images (70 WIDER FACE val + 30 VN plates), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-070749-fixed-1w` | Fixed | small | 1280px | no | 1 | 100 | 0 | **1149.43** | **1154.29** | 1149.43 | 2.07s | 3.45s | 37ms | 61ms | 0m | 0m | 773m | 0MiB | - | - |
| `20261031-070843-fixed-2w` | Fixed | small | 1280px | no | 2 | 100 | 0 | **1645.19** | **1657.00** | 822.59 | 1.13s | 1.65s | 50ms | 85ms | 137m | 35m | 35m (sampled) | 1127MiB | - | - |
| `20261031-070935-fixed-3w` | Fixed | small | 1280px | no | 3 | 100 | 0 | **1650.62** | **1664.82** | 550.21 | 1.03s | 1.59s | 78ms | 111ms | 266m | 89m | 322m | 342MiB | - | - |
| `20261031-071028-fixed-4w` | Fixed | small | 1280px | no | 4 | 100 | 0 | **1535.71** | **1563.31** | 383.93 | 1.04s | 1.44s | 92ms | 140ms | 1m | 1m | 368m | 345MiB | - | - |
| `20261031-072712-autoscale-0-2` | Autoscale | small | 1280px | no | 0→2 | 100 | 0 | **244.29** | **602.35** | 122.14 | 21.97s | 22.98s | 47ms | 85ms | 711m | 118m | 118m (sampled) | 1385MiB | 10.7s | 114.1s |
| `20261031-072945-autoscale-1-3` | Autoscale | small | 1280px | no | 1→3 | 100 | 0 | **1112.35** | **1117.94** | 370.78 | 2.00s | 3.39s | 37ms | 56ms | 449m | 16m | 448m | 1305MiB | - | 300.3s |
| `20261031-073948-deface-gpu` | Deface (CUDAExecutionProvider) | small | 640x480 | - | - | 100 | 0 | **443.63** | - | 443.63 | - | - | 35ms | 753ms | - | - | - | - | 0.60s | - |
| `20261031-073922-deface-gpu` | Deface (CUDAExecutionProvider) | small | full | - | - | 100 | 0 | **255.13** | - | 255.13 | - | - | 90ms | 1078ms | - | - | - | - | 1.36s | - |
| `20261031-074003-deface-cpu` | Deface (CPUExecutionProvider) | small | full | - | - | 100 | 0 | **325.50** | - | 325.50 | - | - | 163ms | 390ms | - | - | - | - | 0.15s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-070749-fixed-1w` | small | 70 | 37ms | 61ms | 30 | 35ms | 59ms |
| `20261031-070843-fixed-2w` | small | 70 | 48ms | 85ms | 30 | 52ms | 82ms |
| `20261031-070935-fixed-3w` | small | 70 | 80ms | 111ms | 30 | 72ms | 107ms |
| `20261031-071028-fixed-4w` | small | 70 | 95ms | 130ms | 30 | 89ms | 358ms |
| `20261031-072712-autoscale-0-2` | small | 70 | 44ms | 81ms | 30 | 56ms | 86ms |
| `20261031-072945-autoscale-1-3` | small | 70 | 38ms | 56ms | 30 | 36ms | 62ms |
| `20261031-073948-deface-gpu` | small | 70 | 38ms | 1087ms | 30 | 24ms | 87ms |
| `20261031-073922-deface-gpu` | small | 70 | 99ms | 1467ms | 30 | 82ms | 167ms |
| `20261031-074003-deface-cpu` | small | 70 | 175ms | 387ms | 30 | 95ms | 339ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
