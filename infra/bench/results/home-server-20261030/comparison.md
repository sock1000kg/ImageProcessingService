30/10/2026: 
- 100 images 
- CPU only node: Intel(R) Core(TM) i5-7200U CPU @ 2.50GHz, 2 cores - 4 threads. 
- Worker limits: 1 CPU, 1536MiBs.
- Container_image: "socknot1000kg/imgproc-engine:05760356e1420a07e32e9ff0c0296eefb5598187"
- dataset: 70 WIDER FACE + 30 VN plate images, about 1024px;
- KEDA lagThreshold 5, cooldownPeriod 120s;
- The node is shared with web, Postgres, MinIO and NATS.

| Run | Mode | Range | Images | Failed | Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | Peak RAM | Cold Start | Time back to min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20261030-101056-fixed-1w` | Fixed | 1 | 100 | 0 | **21.24** | 21.24 | 138.13s | 249.61s | 2562ms | 3401ms | 1001m | 952m | 600MiB | - | - |
| `20261030-140727-fixed-2w` | Fixed | 2 | 100 | 0 | **32.03** | 16.01 | 87.22s | 153.45s | 3284ms | 4678ms | 951m | 916m | 575MiB | - | - |
| `20261030-141156-fixed-3w` | Fixed | 3 | 100 | 0 | **29.93** | 9.98 | 87.24s | 149.64s | 5402ms | 7004ms | 793m | 680m | 606MiB | - | - |
| `20261030-141821-fixed-4w` | Fixed | 4 | 100 | 0 | **28.77** | 7.19 | 90.92s | 145.59s | 7462ms | 9557ms | 609m | 509m | 588MiB | - | - |
| `20261030-142659-autoscale-0-2` | Autoscale | 0→2 | 100 | 0 | **22.25** | 11.13 | 167.14s | 243.61s | 3474ms | 5211ms | 946m | 624m | 606MiB | 16.0s | 120.4s |
| `20261030-143709-autoscale-1-3` | Autoscale | 1→3 | 100 | 0 | **23.49** | 7.83 | 149.35s | 214.37s | 5370ms | 7554ms | 949m | 333m | 579MiB | - | 291.8s |


Notes: 
- Throughput peaks at 2 workers (32 img/min), which matches the 2 physical cores. At 3–4 workers it stays flat or drops slightly, while processing time per image climbs from 2.6s to 7.5s. The workers are competing for CPU, and hyperthreads don't help.
- Peak CPU of 1001m means a single worker hits its 1-core limit.
- Autoscale is slower than the same number of fixed workers (0→2: 22 vs 32 img/min). Each new worker starts cold, and the model only loads on its first job. In 0→2, the first worker appeared about 10s after the first job.
- "Time back to min" differs because two different mechanisms do the scaling down:
  - 0→2, 120s: KEDA's own cooldownPeriod, which handles the last step down to 0.
  - 1→3, 292s: going from 3 to 1 is done by the Kubernetes HPA, whose default scale-down window is 300s.
- Cold start "-" for 1→3 is expected, because the minimum worker is always warm.