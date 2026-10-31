> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 100 images (70 WIDER FACE val + 30 VN plates), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-063610-fixed-1w` | Fixed | small | 640px | no | 1 | 100 | 0 | **1285.07** | **1292.82** | 1285.07 | 1.59s | 2.86s | 28ms | 52ms | 0m | 0m | 733m | 0MiB | - | - |
| `20261031-063639-fixed-2w` | Fixed | small | 640px | no | 2 | 100 | 0 | **1706.97** | **1731.60** | 853.49 | 0.79s | 1.34s | 33ms | 74ms | 329m | 164m | 329m | 1185MiB | - | - |
| `20261031-063733-fixed-3w` | Fixed | small | 640px | no | 3 | 100 | 0 | **1590.25** | **1612.47** | 530.08 | 0.55s | 0.94s | 44ms | 121ms | 1m | 1m | 413m | 367MiB | - | - |
| `20261031-063830-fixed-4w` | Fixed | small | 640px | no | 4 | 100 | 0 | **1307.47** | **1324.21** | 326.87 | 0.71s | 1.22s | 52ms | 156ms | 319m | 50m | 305m | 1203MiB | - | - |
| `20261031-063930-fixed-5w` | Fixed | small | 640px | no | 5 | 100 | 0 | **1541.62** | **1566.99** | 308.32 | 0.52s | 0.83s | 54ms | 133ms | 290m | 182m | 320m | 1091MiB | - | - |
| `20261031-064251-fixed-6w` | Fixed | small | 640px | no | 6 | 100 | 0 | **925.78** | **952.08** | 154.30 | 1.24s | 1.85s | 62ms | 403ms | 420m | 365m | 284m | 907MiB | - | - |
| `20261031-064342-autoscale-0-2` | Autoscale | small | 640px | no | 0→2 | 100 | 0 | **225.67** | **562.27** | 112.84 | 23.42s | 24.11s | 36ms | 77ms | 431m | 70m | 70m (sampled) | 1353MiB | 10.4s | 122.9s |
| `20261031-064705-autoscale-1-3` | Autoscale | small | 640px | no | 1→3 | 100 | 0 | **1296.46** | **1303.21** | 1296.46 | 1.24s | 1.74s | 28ms | 55ms | 26m | 14m | 560m | 551MiB | - | 0.2s |
| `20261031-073948-deface-gpu` | Deface (CUDAExecutionProvider) | small | 640x480 | - | - | 100 | 0 | **443.63** | - | 443.63 | - | - | 35ms | 753ms | - | - | - | - | 0.60s | - |
| `20261031-073922-deface-gpu` | Deface (CUDAExecutionProvider) | small | full | - | - | 100 | 0 | **255.13** | - | 255.13 | - | - | 90ms | 1078ms | - | - | - | - | 1.36s | - |
| `20261031-074003-deface-cpu` | Deface (CPUExecutionProvider) | small | full | - | - | 100 | 0 | **325.50** | - | 325.50 | - | - | 163ms | 390ms | - | - | - | - | 0.15s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-063610-fixed-1w` | small | 70 | 27ms | 51ms | 30 | 28ms | 57ms |
| `20261031-063639-fixed-2w` | small | 70 | 33ms | 76ms | 30 | 31ms | 61ms |
| `20261031-063733-fixed-3w` | small | 70 | 48ms | 122ms | 30 | 39ms | 65ms |
| `20261031-063830-fixed-4w` | small | 70 | 54ms | 262ms | 30 | 46ms | 73ms |
| `20261031-063930-fixed-5w` | small | 70 | 57ms | 310ms | 30 | 46ms | 102ms |
| `20261031-064251-fixed-6w` | small | 70 | 72ms | 420ms | 30 | 45ms | 126ms |
| `20261031-064342-autoscale-0-2` | small | 70 | 37ms | 82ms | 30 | 32ms | 52ms |
| `20261031-064705-autoscale-1-3` | small | 70 | 28ms | 54ms | 30 | 27ms | 52ms |
| `20261031-073948-deface-gpu` | small | 70 | 38ms | 1087ms | 30 | 24ms | 87ms |
| `20261031-073922-deface-gpu` | small | 70 | 99ms | 1467ms | 30 | 82ms | 167ms |
| `20261031-074003-deface-cpu` | small | 70 | 175ms | 387ms | 30 | 95ms | 339ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
