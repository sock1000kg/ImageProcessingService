> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 1000 images (700 WIDER FACE val + 300 VN plates), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-084509-fixed-1w` | Fixed | large | 960px | yes | 1 | 1000 | 0 | **844.52** | **1208.87** | 844.52 | 40.55s | 53.52s | 32ms | 47ms | 841m | 835m | 835m | 1225MiB | - | - |
| `20261031-084856-fixed-2w` | Fixed | large | 960px | yes | 2 | 1000 | 0 | **1171.46** | **2018.71** | 585.73 | 30.91s | 33.85s | 38ms | 57ms | 848m | 846m | 812m | 1232MiB | - | - |
| `20261031-085004-fixed-3w` | Fixed | large | 960px | yes | 3 | 1000 | 0 | **1167.07** | **2003.47** | 389.02 | 32.28s | 35.29s | 50ms | 70ms | 823m | 781m | 763m | 1226MiB | - | - |
| `20261031-085137-fixed-4w` | Fixed | large | 960px | yes | 4 | 1000 | 0 | **1181.01** | **2021.63** | 295.25 | 32.65s | 35.39s | 61ms | 96ms | 777m | 746m | 739m | 1236MiB | - | - |
| `20261031-085315-autoscale-0-3` | Autoscale | large | 960px | no | 0→3 | 1000 | 0 | **1499.10** | **1896.45** | 499.70 | 21.35s | 24.61s | 49ms | 76ms | 823m | 212m | 212m (sampled) | 1390MiB | 3.2s | 113.2s |
| `20261031-085633-autoscale-1-3` | Autoscale | large | 960px | no | 1→3 | 1000 | 0 | **1651.75** | **1657.82** | 550.58 | 16.97s | 18.58s | 48ms | 73ms | 817m | 86m | 498m | 1238MiB | - | 286.7s |
| `20261031-093226-deface-gpu` | Deface (CUDAExecutionProvider) | large | 640x480 | - | - | 1000 | 0 | **771.91** | - | 771.91 | - | - | 37ms | 209ms | - | - | - | - | 0.85s | - |
| `20261031-092910-deface-gpu` | Deface (CUDAExecutionProvider) | large | full | - | - | 1000 | 0 | **311.21** | - | 311.21 | - | - | 91ms | 333ms | - | - | - | - | 1.16s | - |
| `20261031-093345-deface-cpu` | Deface (CPUExecutionProvider) | large | full | - | - | 1000 | 0 | **346.12** | - | 346.12 | - | - | 157ms | 348ms | - | - | - | - | 0.14s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-084509-fixed-1w` | large | 700 | 34ms | 46ms | 300 | 28ms | 63ms |
| `20261031-084856-fixed-2w` | large | 700 | 39ms | 56ms | 300 | 35ms | 66ms |
| `20261031-085004-fixed-3w` | large | 700 | 51ms | 69ms | 300 | 45ms | 76ms |
| `20261031-085137-fixed-4w` | large | 700 | 64ms | 96ms | 300 | 55ms | 92ms |
| `20261031-085315-autoscale-0-3` | large | 700 | 51ms | 75ms | 300 | 45ms | 79ms |
| `20261031-085633-autoscale-1-3` | large | 700 | 49ms | 71ms | 300 | 46ms | 88ms |
| `20261031-093226-deface-gpu` | large | 700 | 42ms | 270ms | 300 | 27ms | 84ms |
| `20261031-092910-deface-gpu` | large | 700 | 99ms | 476ms | 300 | 80ms | 185ms |
| `20261031-093345-deface-cpu` | large | 700 | 167ms | 349ms | 300 | 86ms | 257ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
