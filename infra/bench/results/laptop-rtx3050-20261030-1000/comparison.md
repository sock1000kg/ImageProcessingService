> 30/10/2026:
> 1000 images (700 WIDER FACE val + 300 VN plates, ~1024px; `dataset/images-1000.txt`).
> Laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H, 16 threads, WSL RAM 10GB; GPU NVIDIA RTX 3050 Laptop 4GB (all workers share it).
> Engine image `05760356…` (same as the lab). Worker limits: 1 CPU, 1536MiB. KEDA lagThreshold 5, cooldown 120s.
> Model: `yolov8n-oiv7` = YOLOv8 **nano** pretrained on Open Images V7 (600 classes; we keep `Human face` → face, `Vehicle registration plate` → plate), default 640px input (letterboxed; boxes mapped back to the original size). deface uses CenterFace (ONNX) at full resolution.
> Fixed runs: `--preload --parallel 4` (workers held at 0 while all 1000 jobs are queued, then N released). Autoscale runs: `--parallel 4`, no preload.
>
> How to read it:
> - **Drain Throughput** is the worker-capacity number (first job start → last job done). For preload runs, "Throughput" and E2E latency include
>   the upload phase while workers were held at 0, so don't compare them with the autoscale rows.
> - `CPU (counters)` needs a worker at the start and the end of the run; autoscale 0→3 starts at 0, so it falls back to `(sampled)`.
>
> Findings:
> - **Optimal: 3 workers** (2111 img/min drain); 4 is the same within noise; 5–6 get slower as workers share the GPU (proc p50 34ms → 57ms).
> - Even on the GPU one worker uses ~0.75–0.85 CPU: decoding, blurring, encoding and MinIO I/O are CPU work, so each worker is bounded by its
>   1-CPU limit; a few workers fill the GPU, more just compete for it.
> - Autoscale 0→3: cold start 9.7s, back to 0 after 111s (KEDA cooldown). 1→3: back to 1 after 284s (HPA scale-down window, 300s by default).
> - deface (faces only, local files, no queue/upload): GPU 83ms/image, CPU 161ms on the WIDER subset; our engine 32–37ms on the same subset with
>   1–3 workers while also detecting plates. Different models (CenterFace vs YOLOv8n-oiv7), so this is speed only, not detection quality.
> - OpenScrub not included: its batch CLI only accepts video files.

## Benchmark Comparison Summary

| Run | Mode | Dataset | Preload | Range | Images | Failed | Throughput (img/min) | Drain Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | CPU (counters) | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261030-183425-fixed-1w` | Fixed | large | yes | 1 | 1000 | 0 | **742.50** | **1131.29** | 742.50 | 48.25s | 61.01s | 31ms | 47ms | 825m | 653m | 765m | 1383MiB | - | - |
| `20261030-183606-fixed-2w` | Fixed | large | yes | 2 | 1000 | 0 | **1011.98** | **1647.94** | 505.99 | 36.86s | 43.85s | 33ms | 66ms | 876m | 704m | 739m | 1238MiB | - | - |
| `20261030-183753-fixed-3w` | Fixed | large | yes | 3 | 1000 | 0 | **1143.16** | **2111.41** | 381.05 | 34.49s | 35.93s | 34ms | 59ms | 820m | 813m | 700m | 1203MiB | - | - |
| `20261030-183932-fixed-4w` | Fixed | large | yes | 4 | 1000 | 0 | **1249.06** | **2096.14** | 312.27 | 31.47s | 34.02s | 42ms | 80ms | 792m | 744m | 536m | 1205MiB | - | - |
| `20261030-184107-fixed-5w` | Fixed | large | yes | 5 | 1000 | 0 | **1021.09** | **1787.47** | 204.22 | 40.12s | 41.72s | 50ms | 98ms | 821m | 745m | 684m | 1185MiB | - | - |
| `20261030-184251-fixed-6w` | Fixed | large | yes | 6 | 1000 | 0 | **934.67** | **1557.59** | 155.78 | 46.81s | 49.05s | 57ms | 93ms | 746m | 545m | 472m | 1078MiB | - | - |
| `20261030-184450-autoscale-0-3` | Autoscale | large | no | 0→3 | 1000 | 0 | **1380.04** | **1953.57** | 460.01 | 26.42s | 28.49s | 36ms | 62ms | 819m | 208m | 208m (sampled) | 1366MiB | 9.7s | 111.3s |
| `20261030-184819-autoscale-1-3` | Autoscale | large | no | 1→3 | 1000 | 0 | **1583.07** | **1591.30** | 527.69 | 16.30s | 18.99s | 35ms | 64ms | 627m | 69m | 516m | 1217MiB | - | 283.7s |
| `20261030-185711-deface-gpu` | Deface (CUDAExecutionProvider) | large | - | - | 1000 | 0 | **678.68** | - | 678.68 | - | - | 80ms | 138ms | - | - | - | - | 1.81s | - |
| `20261030-185843-deface-cpu` | Deface (CPUExecutionProvider) | large | - | - | 1000 | 0 | **358.44** | - | 358.44 | - | - | 151ms | 332ms | - | - | - | - | 0.18s | - |

### Processing time by subset

| Run | Dataset | WIDER (faces) images | WIDER p50 | WIDER p95 | VN plates images | VN p50 | VN p95 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20261030-183425-fixed-1w` | large | 700 | 32ms | 45ms | 300 | 29ms | 62ms |
| `20261030-183606-fixed-2w` | large | 700 | 36ms | 65ms | 300 | 29ms | 73ms |
| `20261030-183753-fixed-3w` | large | 700 | 37ms | 58ms | 300 | 30ms | 69ms |
| `20261030-183932-fixed-4w` | large | 700 | 45ms | 80ms | 300 | 35ms | 80ms |
| `20261030-184107-fixed-5w` | large | 700 | 54ms | 96ms | 300 | 44ms | 102ms |
| `20261030-184251-fixed-6w` | large | 700 | 60ms | 92ms | 300 | 48ms | 101ms |
| `20261030-184450-autoscale-0-3` | large | 700 | 39ms | 62ms | 300 | 30ms | 64ms |
| `20261030-184819-autoscale-1-3` | large | 700 | 38ms | 62ms | 300 | 30ms | 70ms |
| `20261030-185711-deface-gpu` | large | 700 | 83ms | 133ms | 300 | 74ms | 172ms |
| `20261030-185843-deface-cpu` | large | 700 | 161ms | 332ms | 300 | 84ms | 244ms |

> **Note (deface)**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.

> **Note (CPU)**: `CPU (counters)` = Δ`container_cpu_usage_seconds_total` / window per worker (workers present at the start and the end of the run); `(sampled)` = `kubectl top` average.
