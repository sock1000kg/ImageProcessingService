# Image Pipeline Baseline Benchmark (`infra/bench`)

This benchmark measures the baseline processing performance, latency, throughput, and resource utilization of the `imgproc` image redaction pipeline prior to introducing M2 whitelist embeddings.

The benchmark evaluates the **real processing flow** end-to-end:
1. Images enter through the real Web API (`POST /api/batches`, 5 batches of 20 images).
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
infra/bench/run.sh [--workers N | --autoscale [--min M] [--max N]] [--api URL] [--out DIR] [--timeout SECONDS]
```

- `--workers N`: Fixed mode with 1 to 6 replicas.
- `--autoscale`: Autoscale mode (defaults to 0 to 3 replicas).
- `--min M`: Minimum replicas for autoscale mode (0 to 6).
- `--max N`: Maximum replicas for autoscale mode (1 to 6).
- `--api URL`: URL to Web API. If omitted, starts `kubectl port-forward svc/web` automatically and waits for readiness.
- `--out DIR`: Output directory (default: `infra/bench/results/<UTC-timestamp>-<mode>/`).
- `--timeout SECONDS`: Maximum timeout in seconds (default: 1800).

### What `run.sh` Does
1. Submits all 100 images as 5 consecutive batches of 20 images to `POST /api/batches` with fixed configuration:
   ```json
   {"targets": ["face", "plate"], "style": "blur"}
   ```
2. While processing, samples metrics every 5 seconds:
   - `top.csv`: CPU and memory per worker pod from `kubectl top pod -l app.kubernetes.io/name=image-worker`.
   - `replicas.csv`: Desired and ready replica counts from the deployment.
3. Polls until all 5 batches reach terminal status (`COMPLETED` or `FAILED`).
4. In autoscale mode, waits for replicas to cool down to min ($M$) and ensures the final replica sample is recorded.
5. Queries PostgreSQL via `kubectl exec` to export `jobs.csv` with exact database timestamps:
   - `job_id`, `batch_id`, `status`, `created_at`, `updated_at`, `processing_time_ms`, `image_size`.
6. Records environment metadata in `meta.json` (mode, limits, worker range, node, dataset hash).
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

3. **Run Standalone Deface Comparison**:
   ```bash
   # GPU mode (auto-detects CUDAExecutionProvider)
   infra/bench/compare/deface.sh --machine laptop-rtx3050

   # CPU mode
   infra/bench/compare/deface.sh --machine laptop-rtx3050 --cpu
   ```

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

Each run folder contains:
- `jobs.csv` (or `per_image.csv` for deface): Job timestamps and per-image processing times.
- `top.csv`: CPU and RAM usage samples (pipeline runs).
- `replicas.csv`: Pod scaling dynamics over time (pipeline runs).
- `meta.json`: Environment metadata (mode, limits, CPU count, GPU model).
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

