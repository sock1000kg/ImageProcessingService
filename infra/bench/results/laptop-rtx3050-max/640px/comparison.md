> 31/10/2026, laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H (12 cores / 16 threads), WSL RAM 10GB, NVIDIA RTX 3050 Laptop 4GB (shared by all workers).
> Dataset: 3726 images (all 3226 WIDER FACE val + all 500 VN plates: Test 400 + Valid 100), ~1024px wide.
> Engine image `1f4e9f1…`, model `yolov8n-oiv7` (YOLOv8 nano, Open Images V7, base pretrained, **not fine-tuned**); YOLO input size per folder (`YOLO_IMGSZ`).
> Worker limits 1 CPU / 1536MiB; fixed runs capped at 4 workers (5+ ran the laptop out of memory at 1280px). KEDA lagThreshold 5, cooldown 120s.
> deface 1.5.0 (CenterFace, ONNX) runs one image at a time in one process; `full` = original resolution, `640x480` = downscaled input. Faces only.
> Speed: large/max fixed runs use `--preload --parallel 4`; read **Drain Throughput** (worker capacity). deface rows are the same shared runs in every size folder.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Imgsz | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-093639-fixed-1w` | Fixed | max | 640px | yes | 1 | 3726 | 0 | **952.94** | **1248.28** | 952.94 | 122.23s | 179.73s | 32ms | 45ms | 831m | 815m | 817m | 1251MiB | - | - |
| `20261031-094113-fixed-2w` | Fixed | max | 640px | yes | 2 | 3726 | 0 | **1442.43** | **2273.18** | 721.22 | 80.12s | 101.45s | 33ms | 48ms | 793m | 781m | 757m | 1235MiB | - | - |
| `20261031-094442-fixed-3w` | Fixed | max | 640px | yes | 3 | 3726 | 0 | **1389.12** | **2258.82** | 463.04 | 88.16s | 104.05s | 37ms | 56ms | 740m | 687m | 610m | 1216MiB | - | - |
| `20261031-094807-fixed-4w` | Fixed | max | 640px | yes | 4 | 3726 | 0 | **1408.44** | **2192.60** | 352.11 | 92.11s | 108.52s | 43ms | 64ms | 700m | 598m | 531m | 1234MiB | - | - |
| `20261031-095137-autoscale-0-3` | Autoscale | max | 640px | no | 0→3 | 3726 | 0 | **1581.77** | **1714.47** | 527.26 | 60.89s | 63.60s | 40ms | 69ms | 660m | 306m | 306m (sampled) | 1396MiB | 9.9s | 112.5s |
| `20261031-095639-autoscale-1-3` | Autoscale | max | 640px | no | 1→3 | 3726 | 0 | **1678.66** | **1679.35** | 559.55 | 51.16s | 55.95s | 38ms | 65ms | 729m | 164m | 488m | 1236MiB | - | 277.3s |
| `20261031-113700-deface-gpu` | Deface (CUDAExecutionProvider) | max | 640x480 | - | - | 3726 | 0 | **581.33** | - | 581.33 | - | - | 40ms | 291ms | - | - | - | - | 1.08s | - |
| `20261031-112249-deface-gpu` | Deface (CUDAExecutionProvider) | max | full | - | - | 3726 | 0 | **264.88** | - | 264.88 | - | - | 97ms | 446ms | - | - | - | - | 3.52s | - |
| `20261031-114328-deface-cpu` | Deface (CPUExecutionProvider) | max | full | - | - | 3726 | 0 | **321.70** | - | 321.70 | - | - | 162ms | 335ms | - | - | - | - | 0.15s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261031-093639-fixed-1w` | max | 70 | 33ms | 43ms | 30 | 29ms | 53ms |
| `20261031-094113-fixed-2w` | max | 70 | 34ms | 46ms | 30 | 28ms | 54ms |
| `20261031-094442-fixed-3w` | max | 70 | 37ms | 54ms | 30 | 33ms | 53ms |
| `20261031-094807-fixed-4w` | max | 70 | 45ms | 62ms | 30 | 40ms | 65ms |
| `20261031-095137-autoscale-0-3` | max | 70 | 44ms | 68ms | 30 | 32ms | 62ms |
| `20261031-095639-autoscale-1-3` | max | 70 | 40ms | 61ms | 30 | 32ms | 63ms |
| `20261031-113700-deface-gpu` | max | 70 | 43ms | 1090ms | 30 | 28ms | 72ms |
| `20261031-112249-deface-gpu` | max | 70 | 99ms | 1505ms | 30 | 79ms | 139ms |
| `20261031-114328-deface-cpu` | max | 70 | 166ms | 333ms | 30 | 96ms | 245ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
