> 30/10/2026:
> 100 images (70 WIDER FACE val + 30 VN plates, ~1024px), same set as `home-server-20261030`.
> Laptop node (WSL2, throwaway k3s v1.31.2): Intel i5-12500H, 16 threads, WSL RAM 10GB; GPU NVIDIA RTX 3050 Laptop 4GB (all workers share it, `nvidia` runtime).
> Engine image `05760356…` (same as the lab). Worker limits: 1 CPU, 1536MiB. KEDA lagThreshold 5, cooldown 120s.
>
> Findings:
> - GPU processing is ~29–70ms per image (lab CPU: 2.6–7.5s), so 100 images finish in ~5s. **This load is too small for the GPU**: throughput
>   (~1000–1300 img/min) mostly measures how fast the 5 batches are uploaded through the API, not worker capacity. Differences between 1–6 workers are
>   within noise; the 5s CPU samples miss most of the work.
> - More workers on one GPU raise processing time per image (29ms → 70ms) as they share the GPU; 5–6 workers are slower overall.
> - Autoscale 0→2 is dominated by the 11s cold start (pod start + model load) on such a short run. Autoscale 1→3 never needed more than its 1 warm worker.
> - deface (faces only, local files, no queue/upload): GPU 78ms/image, CPU 150ms/image on this laptop. Our engine's `processingTimeMs` on the GPU is 29ms
>   (YOLO faces + plates, blur, encode). Compare these with Proc Time, not with end-to-end latency.
> - OpenScrub not included: its batch CLI only accepts video files (`no videos found` on images, v1.0.81).

## Benchmark Comparison Summary

| Run | Mode | Range | Images | Failed | Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261030-172045-fixed-1w` | Fixed | 1 | 100 | 0 | **1069.90** | 1069.90 | 1.54s | 2.35s | 29ms | 55ms | 236m | 118m | 349MiB | - | - |
| `20261030-172137-fixed-2w` | Fixed | 2 | 100 | 0 | **1302.93** | 651.47 | 1.25s | 1.66s | 35ms | 68ms | 1m | 1m | 355MiB | - | - |
| `20261030-172228-fixed-3w` | Fixed | 3 | 100 | 0 | **1216.79** | 405.60 | 1.50s | 2.29s | 40ms | 80ms | 2m | 2m | 354MiB | - | - |
| `20261030-172323-fixed-4w` | Fixed | 4 | 100 | 0 | **1321.59** | 330.40 | 1.41s | 1.98s | 44ms | 133ms | 200m | 44m | 1147MiB | - | - |
| `20261030-172419-fixed-5w` | Fixed | 5 | 100 | 0 | **1007.56** | 201.51 | 0.66s | 1.83s | 60ms | 370ms | 450m | 148m | 1161MiB | - | - |
| `20261030-172521-fixed-6w` | Fixed | 6 | 100 | 0 | **937.06** | 156.18 | 0.75s | 1.47s | 70ms | 242ms | 563m | 236m | 1070MiB | - | - |
| `20261030-172638-autoscale-0-2` | Autoscale | 0→2 | 100 | 0 | **311.19** | 155.59 | 17.07s | 17.73s | 34ms | 94ms | 684m | 39m | 1311MiB | 11.2s | 114.0s |
| `20261030-172940-autoscale-1-3` | Autoscale | 1→3 | 100 | 0 | **1326.85** | 1326.85 | 1.27s | 1.92s | 26ms | 56ms | 1m | 1m | 342MiB | - | 0.5s |
| `20261030-173630-deface-gpu` | Deface (CUDAExecutionProvider) | - | 100 | 0 | **631.15** | 631.15 | - | - | 78ms | 140ms | - | - | - | 1.18s | - |
| `20261030-173653-deface-cpu` | Deface (CPUExecutionProvider) | - | 100 | 0 | **355.86** | 355.86 | - | - | 150ms | 342ms | - | - | - | 0.13s | - |

> **Note**: faces only (no plates), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time.
