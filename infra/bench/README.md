# Image Pipeline Baseline Benchmark (`infra/bench`)

This benchmark measures the baseline processing performance, latency, throughput, and resource utilization of the `imgproc` image redaction pipeline prior to introducing M2 whitelist embeddings.

The benchmark evaluates the **real processing flow** end-to-end:
1. Images enter through the real Web API (`POST /api/batches`, batches of 20 images: 5 for the small set, 50 for the large set).
2. The Web backend uploads private originals to MinIO, persists job records in PostgreSQL, and publishes commands to NATS JetStream (`jobs.image`).
3. `image-worker` pods consume jobs, execute YOLO detection and redaction (blurring faces and plates), and publish events back to NATS.
4. Timestamps and metrics are recorded directly from PostgreSQL (`created_at`, `updated_at`, `processingTimeMs`) and sampled from Kubernetes (`kubectl top`, KEDA/Deployment replica state).

---

## 1. Dataset

The benchmark uses a fixed, committed selection of **100 images**:
- **70 images** from the **WIDER FACE** validation set.
- **30 images** from a **Vietnamese license plate** dataset.

### Sources & Licensing
1. **WIDER FACE (Validation Split)**:
   - Source: CUHK WIDER FACE benchmark ([Hugging Face Mirror](https://huggingface.co/datasets/CUHK-CSE/wider_face)).
   - License: Strictly for non-commercial, academic, and research use.
   - Characteristics: Diverse scenes with crowds, varied lighting, and varied face scales. WIDER images are typically ~1024px wide.
2. **Vietnamese License Plates**:
   - Source: UET K62 Computer Vision YOLO dataset ([GitHub Repository](https://github.com/ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset)).
   - License: Open research/educational use.
   - Characteristics: Daytime and nighttime road scenes containing Vietnamese vehicle license plates.

### Deterministic Selection Rule
The exact selection of 100 images is committed in [`images.txt`](dataset/images.txt) with relative source paths and SHA-256 hashes:
1. **WIDER FACE (70 picks)**:
   - From the 3,226 JPEG images in `WIDER_val.zip`, sort lexicographically by file path across all 61 event categories (from `0--Parade` through `61--Street_Battle`).
   - Pick every $k$-th file with step $k = \lfloor 3226 / 70 \rfloor = 46$ (indices $0, 46, 92, \ldots, 3174$).
   - This ensures a uniform spread across scene types, crowds, and group sizes. All selected files are well below the 50 MB upload limit (`UPLOAD_MAX_BYTES`).
2. **Vietnamese License Plates (30 picks)**:
   - From the 400 vehicle images in `Dataset/Test/`, sort lexicographically.
   - Pick every $k$-th file with step $k = \lfloor 400 / 30 \rfloor = 13$ (indices $0, 13, 26, \ldots, 377$).

### Fetching & Verifying the Dataset
Run `fetch.sh` to download and verify the images:
```bash
bash infra/bench/dataset/fetch.sh
```
- Images are placed into `infra/bench/dataset/images/` (gitignored).
- Hashes are verified against `images.txt`.
- Idempotent: If images are already downloaded and verified, `fetch.sh` exits immediately without network calls.
- Integrity check: If any image is corrupted or altered, `fetch.sh` reports the hash mismatch and fails with exit code 1.
- Offline/Custom source: If you have a local copy of Vietnamese license plates, pass the path as an argument:
  ```bash
  bash infra/bench/dataset/fetch.sh /path/to/vn-plates-dir
  ```

### Large Dataset (1000 images, `--set large`)

The small set is the default and stays as it is, so lab results remain comparable. On a fast machine (e.g. a GPU node, ~30-70 ms per image) the 100-image set finishes in a few seconds, so the throughput mostly measures how fast `run.sh` uploads 5 batches. A second, separate set of **1000 images** (same 70/30 mix) gives the workers enough work:
- **700 images** from the WIDER FACE validation set and **300 images** from the Vietnamese license plate dataset (same sources and licenses as above).
- Manifest: [`dataset/images-1000.txt`](dataset/images-1000.txt) (path + SHA-256 per image, committed). Images go to `dataset/images-1000/` (gitignored, ~118 MB), next to the untouched `images/`.
- Selection rule (fixed, no randomness): sort the file paths lexicographically and take the evenly spaced indices $\lfloor i \cdot N / M \rfloor$ for $i = 0 \ldots M-1$:
  - WIDER FACE: $N = 3226$ JPEGs in `WIDER_val.zip`, $M = 700$ (every 4.6th file, indices $0, 4, 9, 13, \ldots$).
  - VN plates: $N = 400$ images in `Dataset/Test/`, $M = 300$ (every 1.33rd file).
- Fetch (same idempotent download + hash verification as the small set; the cached WIDER zip is reused):
  ```bash
  bash infra/bench/dataset/fetch.sh --set large   # --set small is the default
  ```
  `run.sh --dataset large` runs `fetch.sh --set large` itself if the folder is missing.

---

## 2. Running the Benchmark

The runner script is [`infra/bench/run.sh`](run.sh).

### Modes & Scaling Ranges

1. **Fixed Worker Pool (`--workers N`, 1 to 6)**:
   - Pauses KEDA autoscaling by setting the annotation:
     `autoscaling.keda.sh/paused-replicas: "N"` on `ScaledObject/image-worker`.
   - Waits until exactly $N$ worker pods are in `Ready` status (no terminating pods).
   - Submits an unmeasured **warm-up batch** of $2 \times N$ images and waits until complete. This ensures every worker has initialized YOLO and PyTorch into memory before benchmark timing starts.
2. **Autoscale Mode (`--autoscale [--min M] [--max N]`, 1 to 6)**:
   - Supports configurable scaling ranges: $0 \le M \le N$, $N \ge 1$, $N \le 6$.
   - Defaults: current `ScaledObject` settings (0 and 3).
   - Reads current `minReplicaCount` and `maxReplicaCount`, applies a temporary merge patch for the run if requested values differ, and **restores original values in `cleanup()`** (even on Ctrl-C or failure).
   - Pre-run wait: waits for exactly $M$ pods in `Ready` status (0 terminating).
   - If $M > 0$, runs a warm-up batch of $2 \times M$ images so always-on workers are pre-warmed. If $M = 0$, measures cold start with 0 initial workers.
   - Post-run cooldown: waits until replicas scale back down to exactly $M$, verifying the target replica count in `replicas.csv`.

### Example Scenarios

- **Cold start ($0 \to n$)**:
  ```bash
  infra/bench/run.sh --autoscale --min 0 --max 3
  # or up to 6 workers:
  infra/bench/run.sh --autoscale --min 0 --max 6
  ```
  Measures cold-start latency, queue trigger latency, and KEDA scale-out from zero active workers.
- **Warm worker ($1 \to n$, one worker always on)**:
  ```bash
  infra/bench/run.sh --autoscale --min 1 --max 6
  ```
  Maintains 1 pre-warmed worker to eliminate cold start on initial jobs while dynamically scaling up to 6 workers under queue lag, then cooling back down to 1.
- **Autoscale capped at 1 ($0 \to 1$ or $1 \to 1$)**:
  ```bash
  infra/bench/run.sh --autoscale --min 0 --max 1
  infra/bench/run.sh --autoscale --min 1 --max 1
  ```
  Evaluates pipeline behavior when autoscaling is enabled but concurrency is constrained to a single pod.
- **Fixed worker pools up to 6**:
  ```bash
  infra/bench/run.sh --workers 4
  infra/bench/run.sh --workers 6
  ```
  Tests peak throughput under sustained concurrency without autoscaling delays.

### The 6-Worker Cap & Safety

- **Node Memory Safety**: The single lab host (`home-server`) has 12 GB RAM total with ~7.5 GB free. Each `image-worker` pod specifies a memory limit of `1536Mi` (1.5 GiB). 6 workers $\times 1.5\text{ GiB} \approx 9\text{ GiB}$, which approaches the limits of free host memory. Running $> 6$ workers creates an immediate risk of kernel OOM kills against shared system pods (PostgreSQL, MinIO, NATS, Web).
- **Refusal (> 6)**: Passing `--workers N`, `--min M`, or `--max N` with a value greater than 6 is refused immediately with an explanatory error before touching the cluster.
- **CPU Warning (4–6)**: Running with 4 to 6 workers is permitted, but emits a warning that the node only has 4 CPU threads shared across the entire stack.

### Workflow & Options
```bash
infra/bench/run.sh [--workers N | --autoscale [--min M] [--max N]] [--dataset small|large] [--parallel P] [--preload] [--machine NAME] [--api URL] [--out DIR] [--timeout SECONDS]
```

- `--workers N`: Fixed mode with 1 to 6 replicas.
- `--autoscale`: Autoscale mode (defaults to 0 to 3 replicas).
- `--min M`: Minimum replicas for autoscale mode (0 to 6).
- `--max N`: Maximum replicas for autoscale mode (1 to 6).
- `--api URL`: URL to Web API. If omitted, starts `kubectl port-forward svc/web` automatically and waits for readiness.
- `--out DIR`: Output directory (default: `infra/bench/results/<UTC-timestamp>-<mode>/`).
- `--timeout SECONDS`: Maximum timeout in seconds (default: 1800; 7200 with `--dataset large`).
- `--dataset small|large`: `small` (default) = 100 images in 5 batches, `large` = 1000 images in 50 batches (see "Large Dataset"). Large runs go to `results/<machine>-<date>-1000/` by default, so they never mix with the 100-image tables.
- `--parallel P`: Upload up to $P$ batches at the same time (default 1 = one batch after another, as before). Even with 1000 images, sequential uploads can arrive slower than a fast worker drains them; `--parallel 4` keeps the queue full.
- `--preload`: Fixed mode only (refused with `--autoscale`, before touching the cluster). Sets `paused-replicas=0` and waits until there are 0 worker pods, uploads **every** batch (the jobs wait in the queue), then sets `paused-replicas=N`, waits until exactly $N$ pods are Ready and continues as usual. The upload speed is out of the measurement: use the **Drain Throughput** of these runs as the worker-capacity number. There is no warm-up batch (it would queue behind the preloaded jobs), so each worker loads the model on its first job after the release. The pause annotation is removed by `cleanup()` even on Ctrl-C or failure.

### What `run.sh` Does
1. Submits all images (100 as 5 batches, or 1000 as 50 batches with `--dataset large`) in batches of 20 images to `POST /api/batches` (one after another, or `--parallel P` at a time) with fixed configuration:
   ```json
   {"targets": ["face", "plate"], "style": "blur"}
   ```
2. While processing, samples metrics every 5 seconds:
   - `top.csv`: CPU and memory per worker pod from `kubectl top pod -l app.kubernetes.io/name=image-worker`.
   - `replicas.csv`: Desired and ready replica counts from the deployment.
3. Polls until all batches reach terminal status (`COMPLETED` or `FAILED`).
4. In autoscale mode, waits for replicas to cool down to min ($M$) and ensures the final replica sample is recorded.
5. Queries PostgreSQL via `kubectl exec` to export `jobs.csv` with exact database timestamps:
   - `job_id`, `batch_id`, `status`, `created_at`, `updated_at`, `processing_time_ms`, `image_size`.
6. Records environment metadata in `meta.json` (mode, limits, worker range, node, dataset hash, plus `dataset`, `parallel`, `preload` and `workers_released_at`, the time the workers were released in `--preload` runs).
7. Runs `summarize.py` on the result directory to generate `summary.md`.
8. **Cleanup (guaranteed via `trap`)**:
   - Stops background metrics sampling.
   - Removes the KEDA pause annotation from `ScaledObject/image-worker` (if fixed mode).
   - Restores original `minReplicaCount` and `maxReplicaCount` on `ScaledObject/image-worker` (if patched).
   - Deletes benchmark and warm-up batches via `DELETE /api/batches/:id`.
   - Stops port-forwarding last.

---

## 3. Interpreting the Summary

Run [`summarize.py`](summarize.py) against one or more result directories:
```bash
python3 infra/bench/summarize.py infra/bench/results/*
```

### Metrics Explained
- **Throughput (images/min)**:
  $$\text{Throughput} = \frac{\text{Total Images}}{\min(\text{created\_at}) \to \max(\text{updated\_at}) \text{ in minutes}}$$
  Measures sustained image processing capacity from the ingestion of the first job to the completion of the last job.
- **Drain Throughput (images/min)**:
  $$\text{Drain Throughput} = \frac{\text{Total Images}}{\min(\text{updated\_at} - \text{processingTimeMs}) \to \max(\text{updated\_at}) \text{ in minutes}}$$
  The time from the first job's **processing start** (estimated as `updated_at − processingTimeMs`) to the last job finished. It leaves out the time the first jobs waited for the upload, so it is the **worker-capacity number**: meaningful for every run, and the main one for `--preload` runs (the queue is full when the workers start). End-to-end throughput above also counts the upload time, so on a fast machine it can be much lower than the drain throughput.
- **Throughput per Worker (images/min/worker)**:
  $$\text{Throughput per Worker} = \frac{\text{Throughput}}{\text{Peak Ready Workers}}$$
  Highlights scaling efficiency and shows diminishing returns when adding workers beyond CPU thread capacity.
- **Processing Time (`processingTimeMs`)**:
  Pure inference and redaction execution time inside the Engine (measured from model invocation to output encoding). Reported as p50, p95, and max.
- **End-to-End Latency (`updated_at − created_at`)**:
  Wall-clock time from when the Web API accepted the batch until the worker marked the job terminal. Includes NATS queuing, scheduling, cold-start model load (in autoscale), and result storage. Reported as p50, p95, and max.
- **Worker Resources**:
  Peak CPU, average CPU per worker (in millicores), and peak/average RAM (in MiB) observed across worker pods.
- **Autoscale Dynamics**:
  - *Time to first worker Ready*: Elapsed time from first job submission to the first worker reaching `Ready` status (cold start).
  - *Max Replicas*: Maximum number of worker pods launched by KEDA.
  - *Time back to min*: Cooldown time required for replicas to scale down to min replica count ($M$) after completing all work.
- **Dataset / Preload** (comparison table): which image set the run used and whether it was a `--preload` run, taken from `meta.json` (older runs show `small` / `no`).

- **CPU (counters)** (comparison table, `summary.md`):
  `run.sh` also reads each worker pod's cumulative `container_cpu_usage_seconds_total` from the kubelet (`kubectl get --raw /api/v1/nodes/<node>/proxy/metrics/resource`, same `KUBE_CONTEXT`/`KUBECONFIG` as every other call) into `cpu_counters.csv`: once at the start of the processing window (just before the batches are submitted; in `--preload` runs, once the released workers are Ready) and once when all jobs are terminal. $$\text{CPU (counters)} = \frac{\Delta \text{cpu-seconds}}{\Delta t}$$ per worker, **averaged over the workers that exist at both ends** (workers KEDA starts or stops during an autoscale run are not counted; an autoscale run from 0 has none, so it falls back). `kubectl top` (metrics-server, ~15 s window) misses most of the work of a ~5 s GPU run (peak CPU 1m/2m), which is why the counters exist. If the node proxy is forbidden (likely on the lab tenant) or fails, `run.sh` warns, writes no `cpu_counters.csv`, and the column shows the `kubectl top` average marked **(sampled)**. The Peak/Avg CPU columns stay as they were.
- **Processing time by subset** (second table, `summary.md`):
  p50/p95 of the processing time for the **WIDER (faces)** and **VN plates** images separately. The subset comes from the manifest path of the run's dataset (`WIDER_val/` vs `Dataset/Test/`). Our jobs are mapped to images through `original_filename` (exported to `jobs.csv` by `run.sh`; runs made before this column existed have no subset rows), deface rows through the file name in `per_image.csv`. Deface only detects faces and leaves plates unredacted, so the fair speed comparison with our pipeline is the **WIDER subset**; its VN rows only show how fast it skips plate images.

### Notes in `comparison.md`
When `summarize.py` rewrites a machine folder's `comparison.md`, it replaces **only the generated table** (the `## Benchmark Comparison Summary` block with the subset table and the generated notes, or the table starting at `| Run |` if you removed the heading). Everything above it (your `>` notes) and any other section after it is kept.

### Reading the Results: Diminishing Returns & Node Saturation
On a single 4-thread host (`home-server`):
- Throughput is expected to scale from 1 to 3 workers, but begin to flatten/plateau around **3 to 4 workers**.
- At 4 to 6 workers, **average CPU per worker drops** (from ~800m+ down to ~500m or lower) and **throughput per worker decreases** because worker pods are time-slicing and competing for the 4 physical CPU threads alongside Web, PostgreSQL, NATS, and MinIO.
- **This plateau is the physical host's CPU capacity limit, not a software bug or pipeline bottleneck.** Adding more worker pods beyond the node's CPU threads cannot increase total compute cycles.

---

## 4. Caveats & Test Environment Notes

1. **Shared Node**:
   The lab cluster runs on a single physical host (`home-server`, 4 threads, 12 GB RAM). Web, PostgreSQL, NATS, and MinIO all share this node with the `image-worker` pods. Heavy disk I/O or background container tasks can cause slight latency variance.
2. **Model Initialization**:
   YOLO model weights are loaded lazily on the first inference request. In fixed mode and autoscale mode with $M > 0$, the warm-up batch hides this initialization cost. In autoscale cold-start mode ($M = 0$), cold-start latency is explicitly captured.
3. **Image Resolution**:
   Images are evaluated at their native resolutions (WIDER FACE validation images are typically ~1024px along the longest dimension; Vietnamese license plate images vary from ~640px to ~1920px).
4. **Large-set run time**:
   On the lab CPU (~30 images/min) a 1000-image run takes **~30+ minutes per run**. The large set is meant for the GPU node, where a worker handles an image in tens of milliseconds.

---

## 5. Laptop Benchmark Workflow (Throwaway k3s + GPU)

For benchmarking on a developer laptop (e.g. WSL2 Ubuntu 24.04 with an NVIDIA GPU such as RTX 3050 Laptop):

### Prerequisites
1. **WSL2 Memory**: By default WSL2 may allocate only 50% of host RAM (~7GB). Raise WSL memory by creating or editing `%UserProfile%\.wslconfig` in Windows:
   ```ini
   [wsl2]
   memory=12GB
   ```
   Then restart WSL from PowerShell:
   ```powershell
   wsl --shutdown
   ```
2. **NVIDIA Windows Driver**: Ensure the latest NVIDIA Game Ready or Studio driver is installed on Windows. WSL2 automatically maps `/usr/lib/wsl/lib/libcuda.so`.

### Lifecycle: Up → Benchmark → Compare → Down

1. **Spin up local k3s cluster with GPU support**:
   ```bash
   sudo -E infra/bench/local-cluster/up.sh
   # Or for CPU baseline on laptop:
   sudo -E infra/bench/local-cluster/up.sh --cpu
   ```
   - Automatically installs NVIDIA Container Toolkit (if missing) and k3s without systemd.
   - Creates `RuntimeClass nvidia` and runs a GPU smoke test (`nvidia-smi` inside a test pod).
   - Generates dedicated kubeconfig at `~/.kube/bench-local.yaml` with context `bench-local`.
   - Deploys KEDA and the app via `infra/bench/local-cluster/overlay` (deletes SealedSecrets and HTTPRoutes, removes lab `nodeSelector`s, applies `runtimeClassName: nvidia` to workers with shared GPU access).
   - Creates random credentials for MinIO and Postgres.
   - **Lab Safety**: Never merges into `~/.kube/config`; strictly guards against touching context `default`.

2. **Execute Pipeline Benchmarks**:
   ```bash
   export KUBECONFIG=~/.kube/bench-local.yaml
   export KUBE_CONTEXT=bench-local

   # Fixed worker runs (1 to 6)
   infra/bench/run.sh --machine laptop-rtx3050 --workers 1
   infra/bench/run.sh --machine laptop-rtx3050 --workers 2
   infra/bench/run.sh --machine laptop-rtx3050 --workers 4

   # Autoscale run
   infra/bench/run.sh --machine laptop-rtx3050 --autoscale --min 0 --max 3
   ```

   Large set (1000 images) to measure worker capacity rather than upload speed:
   ```bash
   infra/bench/dataset/fetch.sh --set large
   infra/bench/run.sh --machine laptop-rtx3050 --dataset large --preload --workers 4
   infra/bench/run.sh --machine laptop-rtx3050 --dataset large --parallel 4 --autoscale --min 0 --max 4
   python3 infra/bench/summarize.py infra/bench/results/laptop-rtx3050-$(date -u +"%Y%m%d")-1000
   ```

3. **Run Standalone Deface Comparison**:
   ```bash
   # GPU mode (auto-detects CUDAExecutionProvider)
   infra/bench/compare/deface.sh --machine laptop-rtx3050

   # CPU mode
   infra/bench/compare/deface.sh --machine laptop-rtx3050 --cpu

   # Large set (1000 images): same options, results go to results/laptop-rtx3050-<date>-1000/
   infra/bench/compare/deface.sh --machine laptop-rtx3050 --dataset large
   infra/bench/compare/deface.sh --machine laptop-rtx3050 --dataset large --cpu
   ```
   `--dataset large` runs `fetch.sh --set large` first, which verifies all 1000 hashes (no download when already verified).

4. **Generate Combined Comparison Summary**:
   ```bash
   python3 infra/bench/summarize.py infra/bench/results/laptop-rtx3050-$(date -u +"%Y%m%d")
   ```
   This generates and prints the combined comparison table and writes `comparison.md` directly inside the machine folder.

5. **Tear down local cluster**:
   ```bash
   sudo -E infra/bench/local-cluster/down.sh
   ```
   Stops k3s, removes cluster volumes and images via `k3s-killall.sh` / `k3s-uninstall.sh`, and removes `~/.kube/bench-local.yaml`. NVIDIA Container Toolkit is kept installed.

---

## 6. Results Directory Layout

Results are segregated by machine and date:
```
infra/bench/results/
├── home-server-20261030/            # Lab server runs
│   ├── 20261030-101056-fixed-1w/
│   ├── 20261030-140727-fixed-2w/
│   └── comparison.md
└── laptop-rtx3050-20261030/          # Laptop runs
    ├── 20261030-150000-fixed-1w/
    ├── 20261030-151000-autoscale-0-3/
    ├── 20261030-152000-deface-gpu/
    ├── 20261030-153000-deface-cpu/
    └── comparison.md
```
Runs with `--dataset large` go to a separate sibling folder, e.g. `laptop-rtx3050-20261030-1000/`, with their own `comparison.md`.

Each run folder contains:
- `jobs.csv` (or `per_image.csv` for deface): Job timestamps, per-image processing times and the uploaded file name (`original_filename`).
- `cpu_counters.csv`: cumulative worker CPU seconds at the start and end of the run (only when the node proxy is readable).
- `top.csv`: CPU and RAM usage samples (pipeline runs).
- `replicas.csv`: Pod scaling dynamics over time (pipeline runs).
- `meta.json`: Environment metadata (mode, limits, CPU count, GPU model, dataset, parallel, preload).
- `summary.md`: Individual run performance and latency report.

---

## 7. Comparison Tools & Caveats

### Deface (`infra/bench/compare/deface.sh`)
- Uses CenterFace ONNX model (`deface==1.5.0`, `onnxruntime-gpu==1.20.0`).
- **Fair comparison caveat**: Deface only detects and blurs **faces** (it does not detect or blur license plates). It operates directly on local disk files in Python, without HTTP file uploads, MinIO storage, NATS queue scheduling, or Postgres state tracking.
- **Comparison rule**: Compare Deface per-image latency and throughput against our pipeline's worker **`processingTimeMs`**, NOT the pipeline's end-to-end latency (`updated_at − created_at`).

### OpenScrub Assessment & Exclusion
- We evaluated OpenScrub (`openscrub==1.0.81` on PyPI).
- **Finding**: OpenScrub is built exclusively for video file processing (`.mp4`, `.mkv`, `.mov`, `.avi`, `.webm`). Its batch CLI mode (`--batch FOLDER`) raises `RuntimeError: no videos found in <folder>` when provided with image folders and cannot process still images non-interactively.
- **Conclusion**: OpenScrub is excluded from this still-image benchmark comparison.

