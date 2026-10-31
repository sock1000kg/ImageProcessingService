> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 100 images (70 WIDER FACE val + 30 VN plates), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-065133-fixed-1w` | Fixed | small | 960px | no | 1 | 100 | 0 | **1259.18** | **1265.56** | 1259.18 | 1.78s | 3.01s | 32ms | 52ms | 535m | 535m | 728m | 1186MiB | - | - |
| `20261031-065229-fixed-2w` | Fixed | small | 960px | no | 2 | 100 | 0 | **1690.62** | **1718.71** | 845.31 | 0.97s | 1.69s | 40ms | 70ms | 203m | 102m | 283m | 342MiB | - | - |
| `20261031-065322-fixed-3w` | Fixed | small | 960px | no | 3 | 100 | 0 | **1720.18** | **1734.10** | 573.39 | 1.11s | 1.63s | 52ms | 79ms | 203m | 76m | 122m | 1133MiB | - | - |
| `20261031-065414-fixed-4w` | Fixed | small | 960px | no | 4 | 100 | 0 | **1498.13** | **1518.22** | 374.53 | 1.21s | 1.68s | 64ms | 162ms | 358m | 116m | 363m | 1200MiB | - | - |
| `20261031-065514-fixed-5w` | Fixed | small | 960px | no | 5 | 100 | 0 | **1230.77** | **1244.30** | 246.15 | 0.69s | 1.28s | 74ms | 203ms | 383m | 123m | 310m | 1111MiB | - | - |
| `20261031-065915-fixed-6w` | Fixed | small | 960px | no | 6 | 100 | 0 | **876.94** | **886.52** | 146.16 | 0.79s | 1.67s | 74ms | 310ms | 682m | 512m | 305m | 1004MiB | - | - |
| `20261031-070007-autoscale-0-2` | Autoscale | small | 960px | no | 0→2 | 100 | 0 | **220.97** | **676.06** | 110.49 | 23.90s | 24.54s | 39ms | 77ms | 594m | 97m | 97m (sampled) | 1373MiB | 16.0s | 110.9s |
| `20261031-070319-autoscale-1-3` | Autoscale | small | 960px | no | 1→3 | 100 | 0 | **1277.96** | **1289.49** | 1277.96 | 1.35s | 2.14s | 30ms | 53ms | 1m | 1m | 402m | 342MiB | - | - |
| `20261031-073948-deface-gpu` | Deface (CUDAExecutionProvider) | small | 640x480 | - | - | 100 | 0 | **443.63** | - | 443.63 | - | - | 35ms | 753ms | - | - | - | - | 0.60s | - |
| `20261031-073922-deface-gpu` | Deface (CUDAExecutionProvider) | small | full | - | - | 100 | 0 | **255.13** | - | 255.13 | - | - | 90ms | 1078ms | - | - | - | - | 1.36s | - |
| `20261031-074003-deface-cpu` | Deface (CPUExecutionProvider) | small | full | - | - | 100 | 0 | **325.50** | - | 325.50 | - | - | 163ms | 390ms | - | - | - | - | 0.15s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-065133-fixed-1w` | small | 70 | 33ms | 51ms | 30 | 32ms | 53ms |
| `20261031-065229-fixed-2w` | small | 70 | 42ms | 72ms | 30 | 39ms | 63ms |
| `20261031-065322-fixed-3w` | small | 70 | 52ms | 79ms | 30 | 50ms | 79ms |
| `20261031-065414-fixed-4w` | small | 70 | 65ms | 285ms | 30 | 62ms | 96ms |
| `20261031-065514-fixed-5w` | small | 70 | 76ms | 420ms | 30 | 69ms | 115ms |
| `20261031-065915-fixed-6w` | small | 70 | 79ms | 330ms | 30 | 70ms | 130ms |
| `20261031-070007-autoscale-0-2` | small | 70 | 40ms | 80ms | 30 | 38ms | 62ms |
| `20261031-070319-autoscale-1-3` | small | 70 | 32ms | 53ms | 30 | 29ms | 53ms |
| `20261031-073948-deface-gpu` | small | 70 | 38ms | 1087ms | 30 | 24ms | 87ms |
| `20261031-073922-deface-gpu` | small | 70 | 99ms | 1467ms | 30 | 82ms | 167ms |
| `20261031-074003-deface-cpu` | small | 70 | 175ms | 387ms | 30 | 95ms | 339ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
