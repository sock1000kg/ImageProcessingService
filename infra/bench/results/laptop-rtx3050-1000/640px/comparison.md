> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 1000 images (700 WIDER FACE val + 300 VN plates), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-074022-fixed-1w` | Fixed | large | 640px | yes | 1 | 1000 | 0 | **844.51** | **1193.65** | 844.51 | 42.31s | 54.99s | 31ms | 47ms | 833m | 753m | 797m | 1313MiB | - | - |
| `20261031-074152-fixed-2w` | Fixed | large | 640px | yes | 2 | 1000 | 0 | **1214.35** | **2215.00** | 607.18 | 30.01s | 32.00s | 30ms | 50ms | 791m | 787m | 661m | 1193MiB | - | - |
| `20261031-074327-fixed-3w` | Fixed | large | 640px | yes | 3 | 1000 | 0 | **1193.36** | **2150.31** | 397.79 | 32.52s | 33.64s | 33ms | 58ms | 782m | 777m | 638m | 1200MiB | - | - |
| `20261031-074502-fixed-4w` | Fixed | large | 640px | yes | 4 | 1000 | 0 | **1066.29** | **1883.48** | 266.57 | 37.57s | 39.18s | 42ms | 83ms | 812m | 752m | 687m | 1208MiB | - | - |
| `20261031-074646-autoscale-0-3` | Autoscale | large | 640px | no | 0→3 | 1000 | 0 | **1517.60** | **2080.95** | 505.87 | 22.35s | 25.31s | 35ms | 62ms | 841m | 214m | 214m (sampled) | 1439MiB | 9.5s | 116.9s |
| `20261031-075005-autoscale-1-3` | Autoscale | large | 640px | no | 1→3 | 1000 | 0 | **1694.25** | **1705.95** | 564.75 | 14.78s | 16.42s | 36ms | 62ms | 798m | 93m | 582m | 1227MiB | - | 286.1s |
| `20261031-093226-deface-gpu` | Deface (CUDAExecutionProvider) | large | 640x480 | - | - | 1000 | 0 | **771.91** | - | 771.91 | - | - | 37ms | 209ms | - | - | - | - | 0.85s | - |
| `20261031-092910-deface-gpu` | Deface (CUDAExecutionProvider) | large | full | - | - | 1000 | 0 | **311.21** | - | 311.21 | - | - | 91ms | 333ms | - | - | - | - | 1.16s | - |
| `20261031-093345-deface-cpu` | Deface (CPUExecutionProvider) | large | full | - | - | 1000 | 0 | **346.12** | - | 346.12 | - | - | 157ms | 348ms | - | - | - | - | 0.14s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-074022-fixed-1w` | large | 700 | 32ms | 46ms | 300 | 27ms | 64ms |
| `20261031-074152-fixed-2w` | large | 700 | 32ms | 49ms | 300 | 26ms | 61ms |
| `20261031-074327-fixed-3w` | large | 700 | 35ms | 56ms | 300 | 30ms | 71ms |
| `20261031-074502-fixed-4w` | large | 700 | 45ms | 86ms | 300 | 35ms | 74ms |
| `20261031-074646-autoscale-0-3` | large | 700 | 36ms | 62ms | 300 | 31ms | 67ms |
| `20261031-075005-autoscale-1-3` | large | 700 | 38ms | 61ms | 300 | 31ms | 72ms |
| `20261031-093226-deface-gpu` | large | 700 | 42ms | 270ms | 300 | 27ms | 84ms |
| `20261031-092910-deface-gpu` | large | 700 | 99ms | 476ms | 300 | 80ms | 185ms |
| `20261031-093345-deface-cpu` | large | 700 | 167ms | 349ms | 300 | 86ms | 257ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
