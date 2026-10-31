> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 3726 images (all 3226 WIDER FACE val + all 500 VN plates: Test 400 + Valid 100), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-104202-fixed-1w` | Fixed | max | 1280px | yes | 1 | 3726 | 0 | **846.59** | **1110.52** | 846.59 | 138.44s | 200.99s | 37ms | 52ms | 839m | 824m | 829m | 1291MiB | - | - |
| `20261031-104714-fixed-2w` | Fixed | max | 1280px | yes | 2 | 3726 | 0 | **1210.59** | **1707.23** | 605.29 | 96.83s | 132.13s | 52ms | 74ms | 858m | 842m | 844m | 1272MiB | - | - |
| `20261031-105100-fixed-3w` | Fixed | max | 1280px | yes | 3 | 3726 | 0 | **1286.91** | **1892.99** | 428.97 | 90.71s | 120.24s | 71ms | 99ms | 866m | 837m | 809m | 1297MiB | - | - |
| `20261031-105501-fixed-4w` | Fixed | max | 1280px | yes | 4 | 3726 | 0 | **531.30** | **624.31** | 132.83 | 231.72s | 352.21s | 68ms | 1754ms | 1000m | 945m | 929m | 1286MiB | - | - |
| `20261031-110252-autoscale-0-3` | Autoscale | max | 1280px | no | 0→3 | 3726 | 0 | **1480.97** | **1604.13** | 493.66 | 60.36s | 76.04s | 73ms | 99ms | 862m | 417m | 417m (sampled) | 1400MiB | 4.2s | 120.2s |
| `20261031-110807-autoscale-1-3` | Autoscale | max | 1280px | no | 1→3 | 3726 | 0 | **1562.71** | **1563.82** | 520.90 | 51.39s | 62.99s | 72ms | 101ms | 859m | 252m | 686m | 1296MiB | - | 295.2s |
| `20261031-113700-deface-gpu` | Deface (CUDAExecutionProvider) | max | 640x480 | - | - | 3726 | 0 | **581.33** | - | 581.33 | - | - | 40ms | 291ms | - | - | - | - | 1.08s | - |
| `20261031-112249-deface-gpu` | Deface (CUDAExecutionProvider) | max | full | - | - | 3726 | 0 | **264.88** | - | 264.88 | - | - | 97ms | 446ms | - | - | - | - | 3.52s | - |
| `20261031-114328-deface-cpu` | Deface (CPUExecutionProvider) | max | full | - | - | 3726 | 0 | **321.70** | - | 321.70 | - | - | 162ms | 335ms | - | - | - | - | 0.15s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-104202-fixed-1w` | max | 70 | 37ms | 48ms | 30 | 34ms | 58ms |
| `20261031-104714-fixed-2w` | max | 70 | 53ms | 74ms | 30 | 50ms | 77ms |
| `20261031-105100-fixed-3w` | max | 70 | 71ms | 103ms | 30 | 68ms | 99ms |
| `20261031-105501-fixed-4w` | max | 70 | 80ms | 1542ms | 30 | 65ms | 2253ms |
| `20261031-110252-autoscale-0-3` | max | 70 | 72ms | 95ms | 30 | 64ms | 95ms |
| `20261031-110807-autoscale-1-3` | max | 70 | 74ms | 98ms | 30 | 68ms | 96ms |
| `20261031-113700-deface-gpu` | max | 70 | 43ms | 1090ms | 30 | 28ms | 72ms |
| `20261031-112249-deface-gpu` | max | 70 | 99ms | 1505ms | 30 | 79ms | 139ms |
| `20261031-114328-deface-cpu` | max | 70 | 166ms | 333ms | 30 | 96ms | 245ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
