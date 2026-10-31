> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 3726 images (all 3226 WIDER FACE val + all 500 VN plates: Test 400 + Valid 100), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-101017-fixed-1w` | Fixed | max | 960px | yes | 1 | 3726 | 0 | **902.00** | **1161.71** | 902.00 | 129.65s | 192.75s | 35ms | 48ms | 841m | 804m | 785m | 1282MiB | - | - |
| `20261031-101519-fixed-2w` | Fixed | max | 960px | yes | 2 | 3726 | 0 | **1346.02** | **1983.23** | 673.01 | 85.97s | 114.71s | 40ms | 61ms | 824m | 809m | 781m | 1242MiB | - | - |
| `20261031-101901-fixed-3w` | Fixed | max | 960px | yes | 3 | 3726 | 0 | **1421.46** | **2193.70** | 473.82 | 85.80s | 106.67s | 51ms | 71ms | 819m | 753m | 751m | 1254MiB | - | - |
| `20261031-102216-fixed-4w` | Fixed | max | 960px | yes | 4 | 3726 | 0 | **1339.57** | **2081.99** | 334.89 | 101.21s | 114.65s | 65ms | 90ms | 809m | 755m | 699m | 1232MiB | - | - |
| `20261031-102547-autoscale-0-3` | Autoscale | max | 960px | no | 0→3 | 3726 | 0 | **1469.23** | **1661.69** | 489.74 | 69.39s | 79.48s | 53ms | 82ms | 809m | 378m | 378m (sampled) | 1373MiB | 15.2s | 108.0s |
| `20261031-103100-autoscale-1-3` | Autoscale | max | 960px | no | 1→3 | 3726 | 0 | **1691.00** | **1693.02** | 563.67 | 44.73s | 51.55s | 52ms | 73ms | 738m | 197m | 562m | 1265MiB | - | 284.3s |
| `20261031-113700-deface-gpu` | Deface (CUDAExecutionProvider) | max | 640x480 | - | - | 3726 | 0 | **581.33** | - | 581.33 | - | - | 40ms | 291ms | - | - | - | - | 1.08s | - |
| `20261031-112249-deface-gpu` | Deface (CUDAExecutionProvider) | max | full | - | - | 3726 | 0 | **264.88** | - | 264.88 | - | - | 97ms | 446ms | - | - | - | - | 3.52s | - |
| `20261031-114328-deface-cpu` | Deface (CPUExecutionProvider) | max | full | - | - | 3726 | 0 | **321.70** | - | 321.70 | - | - | 162ms | 335ms | - | - | - | - | 0.15s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-101017-fixed-1w` | max | 70 | 36ms | 49ms | 30 | 30ms | 51ms |
| `20261031-101519-fixed-2w` | max | 70 | 40ms | 63ms | 30 | 40ms | 85ms |
| `20261031-101901-fixed-3w` | max | 70 | 53ms | 72ms | 30 | 46ms | 76ms |
| `20261031-102216-fixed-4w` | max | 70 | 64ms | 85ms | 30 | 54ms | 87ms |
| `20261031-102547-autoscale-0-3` | max | 70 | 54ms | 77ms | 30 | 50ms | 74ms |
| `20261031-103100-autoscale-1-3` | max | 70 | 54ms | 70ms | 30 | 48ms | 68ms |
| `20261031-113700-deface-gpu` | max | 70 | 43ms | 1090ms | 30 | 28ms | 72ms |
| `20261031-112249-deface-gpu` | max | 70 | 99ms | 1505ms | 30 | 79ms | 139ms |
| `20261031-114328-deface-cpu` | max | 70 | 166ms | 333ms | 30 | 96ms | 245ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
