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

### Modes
1. **Fixed Worker Pool (`--workers 1`, `--workers 2`, or `--workers 3`)**:
   - Pauses KEDA autoscaling by setting the annotation:
     `autoscaling.keda.sh/paused-replicas: "N"` on `ScaledObject/image-worker`.
   - Waits until $N$ worker pods are in `Ready` status.
   - Submits an unmeasured **warm-up batch** of $2 \times N$ images and waits until complete. This ensures every worker has initialized YOLO and PyTorch into memory before benchmark timing starts.
2. **Autoscale Mode (`--autoscale`)**:
   - Removes any KEDA pause annotation.
   - Waits for active replicas to scale down to 0 first.
   - Submits the benchmark batches directly without a warm-up batch to measure **cold start** and KEDA scale-out dynamics.

### Workflow & Options
```bash
infra/bench/run.sh [--workers N | --autoscale] [--api URL] [--out DIR] [--timeout SECONDS]
```

- `--workers N`: Fixed mode with 1, 2, or 3 replicas.
- `--autoscale`: Autoscale mode (0 to 3 replicas).
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
4. Queries PostgreSQL via `kubectl exec` to export `jobs.csv` with exact database timestamps:
   - `job_id`, `batch_id`, `status`, `created_at`, `updated_at`, `processing_time_ms`, `image_size`.
5. Records environment metadata in `meta.json` (worker image tag/digest, limits, node, dataset hash).
6. Runs `summarize.py` on the result directory to generate `summary.md`.
7. **Cleanup (guaranteed via `trap`)**:
   - Stops background metrics sampling.
   - Removes the KEDA pause annotation from `ScaledObject/image-worker`.
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
- **Processing Time (`processingTimeMs`)**:
  Pure inference and redaction execution time inside the Engine (measured from model invocation to output encoding). Reported as p50, p95, and max.
- **End-to-End Latency (`updated_at − created_at`)**:
  Wall-clock time from when the Web API accepted the batch until the worker marked the job terminal. Includes NATS queuing, scheduling, cold-start model load (in autoscale), and result storage. Reported as p50, p95, and max.
- **Worker Resources**:
  Peak and average CPU (in millicores) and RAM (in MiB) observed across worker pods.
- **Autoscale Dynamics**:
  - *Time to first worker Ready*: Elapsed time from first job submission to the first worker reaching `Ready` status.
  - *Max Replicas*: Maximum number of worker pods launched by KEDA.
  - *Time back to 0*: Cooldown time required for replicas to scale down to 0 after completing all work.

---

## 4. Caveats & Test Environment Notes

1. **Shared Node**:
   The lab cluster runs on a single physical host (`home-server`, 4 threads, 12 GB RAM). Web, PostgreSQL, NATS, and MinIO all share this node with the `image-worker` pods. Heavy disk I/O or background container tasks can cause slight latency variance.
2. **Model Initialization**:
   YOLO model weights are loaded lazily on the first inference request. In fixed mode, the warm-up batch hides this initialization cost. In autoscale mode, cold-start latency is explicitly captured.
3. **Image Resolution**:
   Images are evaluated at their native resolutions (WIDER FACE validation images are typically ~1024px along the longest dimension; Vietnamese license plate images vary from ~640px to ~1920px).
