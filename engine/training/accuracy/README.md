# Accuracy & Detection Quality Benchmark (`engine/training/accuracy`)

> Accuracy lives with the model training, throughput stays in `infra/bench`.
> The benchmark images and ground-truth labels are still produced by `infra/bench/dataset/fetch.sh` (both benchmarks use
> them); the shared dataset helpers are in `infra/bench/dataset/dataset_utils.py`. Every scored run, ours (from
> `engine/training/bench.py` or a pipeline run's `run.sh --save-detections`) and deface's, lives in
> `engine/training/bench/<name>/`; `engine/training/compare.py` writes `bench/comparison.md` (see `engine/training/README.md`).

This benchmark evaluates detection quality (precision, recall, F1, AP@0.5) and privacy protection recall between our image redaction pipeline and deface on the exact same dataset images.

## Producing Normalised Ground Truth Labels
Run `fetch.sh` with `--labels` to generate reproducible annotations:
```bash
# Small set (100 images: 70 WIDER + 30 VN plates)
bash infra/bench/dataset/fetch.sh --labels

# Large set (1000 images: 700 WIDER + 300 VN plates)
bash infra/bench/dataset/fetch.sh --set large --labels

# Max set (3726 images: 3226 WIDER + 500 VN plates)
bash infra/bench/dataset/fetch.sh --set max --labels
```
- Ground truth annotations are saved as JSONL to `infra/bench/dataset/labels-<set>.jsonl` (gitignored).
- **WIDER FACE subset (`wider`)**: Faces extracted from `wider_face_split/wider_face_val_bbx_gt.txt`. Annotations marked `invalid=1` are flagged `ignore: true`. Each valid face preserves human-annotated attribute labels (`attrs`) as well as an objective measured Laplacian `sharpness` score.
- **Vietnamese license plates subset (`vn`)**: License plates extracted from YOLO annotations (`Dataset/Test/*.txt` and `Dataset/Valid/*.txt`, class ID `0` represents vehicle plates). Normalized YOLO coordinates are converted to pixel bounding boxes `[x1, y1, x2, y2]`. Plates carry no facial attributes or sharpness metrics.

## WIDER FACE Attributes & Measured Sharpness

### 1. WIDER FACE Attribute Definitions (Verbatim from `wider_face_split/readme.txt`)
The ground truth annotations provide human-labeled categorical attributes for each face:
```
blur:
  clear->0
  normal blur->1
  heavy blur->2

expression:
  typical expression->0
  exaggerate expression->1

illumination:
  normal illumination->0
  extreme illumination->1

occlusion:
  no occlusion->0
  partial occlusion->1
  heavy occlusion->2

pose:
  typical pose->0
  atypical pose->1

invalid:
  false->0(valid image)
  true->1(invalid image)
```

**Citation**: Yang, Shuo, Ping Luo, Chen-Change Loy, and Xiaoou Tang. "WIDER FACE: A Face Detection Benchmark." In *Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR)*, 2016.

Per the CVPR 2016 benchmark paper:
- **Occlusion**:
  - `no occlusion (0)`: 0% of face region is occluded.
  - `partial occlusion (1)`: 1% to 30% of face region is occluded.
  - `heavy occlusion (2)`: 31% to 100% of face region is occluded.
- **Blur**:
  - `clear (0)`: well-focused, sharp facial details.
  - `normal blur (1)`: slight defocus or minor motion blur.
  - `heavy blur (2)`: severe blur where facial features are barely recognizable.
- **Expression**:
  - `typical expression (0)`: neutral or typical facial expression.
  - `exaggerate expression (1)`: exaggerated facial expression.
- **Illumination**:
  - `normal illumination (0)`: standard lighting conditions.
  - `extreme illumination (1)`: extreme lighting (strong backlighting, harsh shadows, severe under- or over-exposure).
- **Pose**:
  - `typical pose (0)`: frontal or standard profile pose.
  - `atypical pose (1)`: extreme yaw/pitch angle or inverted face.

### 2. Measured Sharpness
WIDER's blur ratings represent qualitative human judgments. To provide an objective, repeatable physical metric for edge definition, `fetch.sh --labels` computes a measured sharpness value on every face crop using `infra/bench/.cache/accuracy-venv` (`numpy==2.2.3`, `pillow==11.1.0`):

**Formula**:
1. Crop bounding box $[x_1, y_1, x_2, y_2]$ from the original image.
2. Convert crop to grayscale.
3. Resize to a normalized $64 \times 64$ pixels using bilinear interpolation.
4. Convolve with standard 3×3 Laplacian filter kernel with reflect padding (`mode="reflect"`):
   $$\mathbf{K} = \begin{bmatrix} 0 & 1 & 0 \\ 1 & -4 & 1 \\ 0 & 1 & 0 \end{bmatrix}$$
5. Sharpness is the sample variance across the 64×64 filtered values:
   $$\text{sharpness} = \text{Var}(\text{Laplacian})$$

**Fixed Buckets**:
- `very blurry`: $\text{sharpness} < 25$
- `blurry`: $25 \le \text{sharpness} < 100$
- `soft`: $100 \le \text{sharpness} < 400$
- `sharp`: $\text{sharpness} \ge 400$

> [!NOTE]
> **Caveat on Tiny & Unusable Faces**: Faces smaller than 64×64 pixels (especially `tiny` <16px and `small` 16–32px) are upscaled via bilinear interpolation to 64×64, which naturally attenuates high frequencies and causes them to register with lower sharpness scores. Sharpness breakdowns should always be interpreted together with the face size buckets. Faces with unreadable image files or empty/degenerate cropped boundaries omit `sharpness` rather than defaulting to 0.0, avoiding skew in the `very blurry` bucket.

## Executing Accuracy Benchmark Runs
To build full precision–recall curves and compute AP@0.5, runs are performed with confidence down to `0.05` while exporting raw detections:

1. **Our Engine**:
   ```bash
   bash infra/bench/run.sh --machine laptop-rtx3050 --dataset large --preload --parallel 4 --workers 3 \
     --imgsz 640 --confidence 0.05 --save-detections
   ```
   Exports `job_id`, `original_filename`, `detections`, and `imageSize` directly from PostgreSQL into `detections.jsonl`. Output is saved to `results/laptop-rtx3050-1000/640px/<UTC>-.../`.

2. **Deface (CenterFace ONNX)**:
   ```bash
   # Native full resolution (results/laptop-rtx3050-1000/deface/full/<UTC>-...)
   bash infra/bench/compare/deface.sh --machine laptop-rtx3050 --dataset large \
     --threshold 0.05 --save-detections

   # 640-class reduced resolution (results/laptop-rtx3050-1000/deface/640x480/<UTC>-...)
   bash infra/bench/compare/deface.sh --machine laptop-rtx3050 --dataset large \
     --threshold 0.05 --scale 640x480 --save-detections
   ```
   Detections and bounding boxes are saved directly from the single CenterFace inference pass into `detections.jsonl`.

## Evaluation Rules & Metrics (`engine/training/accuracy/evaluate.py`)
Run the Python evaluator on individual runs or combined directories:
```bash
# Evaluate a single run (writes accuracy.json + accuracy.md into it):
python3 engine/training/accuracy/evaluate.py engine/training/bench/yolo26n-1280-e20-crowd@1280 \
  --labels infra/bench/dataset/labels-max.jsonl --operating-threshold 0.15

# Combined report at one threshold (compare.py does the matched-precision comparison instead):
python3 engine/training/accuracy/evaluate.py --combine engine/training/bench/yolo26*@1280 \
  --deface engine/training/bench/deface-full --labels infra/bench/dataset/labels-max.jsonl \
  --out /tmp/combined.md
```

### Evaluation Rules:
- **No cross-subset scoring**: Faces are evaluated only on the `wider` subset; vehicle license plates are evaluated only on the `vn` subset.
- **Greedy Matching**: Predictions are sorted by confidence descending and matched greedily against ground truth with IoU ≥ 0.5. Each non-ignore GT box can match at most once.
- **Ignore Boxes**: WIDER annotations with `invalid=1` are flagged ignore. Predictions matching an ignore box are neither TP nor FP.
- **AP@0.5**: Computed across all confidence thresholds using all-points monotonic interpolation.
- **Operating Thresholds**: Precision, recall, and F1 are reported at the default operating threshold (0.35 for engine, 0.20 for deface) as well as the optimal best-F1 threshold.
- **Privacy Recall**: A ground truth target is counted as privacy-protected if its bounding box area is covered ≥ 70% by the redacted area:
  - For our engine: predicted box expanded by `padding` (0.1 default).
  - For deface: predicted box expanded by `mask_scale` 1.3 (ellipse approximated by its bounding box).
- **Breakdown Tables**:
  - **Size breakdown**: `tiny` (<16px), `small` (16–32px), `medium` (32–96px), `large` (>96px).
  - **Attribute breakdown (faces only)**: `blur` (clear, normal blur, heavy blur), `expression` (typical, exaggerate), `illumination` (normal, extreme), `occlusion` (none, partial, heavy), `pose` (typical, atypical).
  - **Sharpness breakdown (faces only)**: `very blurry` (<25), `blurry` (25–100), `soft` (100–400), `sharp` (≥400).
  - Ground truth counts (`GT`) are displayed for each breakdown row.
- **Deface License Plates**: Deface does not support license plate detection; its plate rows report "not supported" and recall 0 by design.

## Review Warning Evaluation (`engine/training/accuracy/review.py`)

This evaluation measures the effectiveness of the user-facing review warning system offline against saved detections down to confidence 0.05:
- **Engine Warning Rule** ([`engine/src/processors/image_redact.py`](../../engine/src/processors/image_redact.py)): Detections below `confidenceThreshold` (default 0.35) are dropped. A kept detection receives `lowConfidence = confidence < reviewThreshold` (default 0.50).
- **Web Flagging Rule** ([`web/backend/src/dto/batch.dto.ts`](../../web/backend/src/dto/batch.dto.ts)): An image is flagged as **`needsReview`** if any detection has `lowConfidence = true`. (Whitelist-similarity review triggers do not apply here, as this benchmark runs with **no whitelist**).
- **Offline Replay**: Saved detections down to confidence 0.05 in `detections.jsonl` are evaluated against ground truth labels (`labels-<set>.jsonl`) without re-running model inference. Faces are scored on WIDER images (`wider` subset), license plates on Vietnamese vehicle images (`vn` subset).

### Usage:
```bash
# Evaluate review warning on a single run:
python3 engine/training/accuracy/review.py engine/training/bench/yolo26n-1280-e20-crowd@1280 \
  --labels infra/bench/dataset/labels-max.jsonl

# Combined report across runs:
python3 engine/training/accuracy/review.py --combine engine/training/bench/yolov8n-oiv7@* \
  --labels infra/bench/dataset/labels-max.jsonl --out /tmp/review.md
```
`review.py` writes `review.json` and `review.md` directly into each evaluated run directory, and writes a unified summary markdown table with a top blockquote `>` when `--combine` is used.

### Metric Definitions:
- **Operating Threshold ($T$, default 0.35)**: Detections below $T$ are discarded by the engine.
- **Flagged Image**: An image where at least one kept detection (confidence $\ge T$) has confidence $< R$.
- **Leaky Image**: An image where at least one valid, non-ignored ground truth target is not privacy-protected (coverage $< 70\%$ by redacted kept boxes, expanded by default $0.1$ padding). Also reported for the variant excluding tiny targets (`width < 16 px`).
- **Catch Rate**: $\frac{\text{flagged} \cap \text{leaky}}{\text{leaky}}$. The proportion of leaky images that the review warning successfully flags for manual inspection.
- **Flag Rate**: $\frac{\text{flagged}}{\text{total images}}$. The proportion of all processed images that require human review.
- **Flag Precision**: $\frac{\text{flagged} \cap \text{leaky}}{\text{flagged}}$. The proportion of flagged images that actually contain an unredacted target leak.
- **Silent Misses**: The share of leaky images whose missed ground truth targets have **no candidate detection at all** down to 0.05 (defined as $\text{IoU} \ge 0.1$ or $\text{coverage} \ge 30\%$). Because no detection exists near the leak even at low confidence, a warning mechanism based solely on kept detections can never catch these leaks.
- **What-If Analysis**: A clearly labelled scenario (not an engine recommendation) modeling what the catch rate and flag rate would be if borderline detections in $[0.20, T)$—which are currently dropped by the engine—also triggered the review flag.
- **Calibration**: Binned detections ($0.05\text{–}0.10, 0.10\text{–}0.20, \ldots, 0.90\text{–}1.00$) reporting detection count, true positive share ($\text{IoU} \ge 0.5$), and GT protection share ($\text{coverage} \ge 70\%$).

### How to Read the Sweep to Pick `reviewThreshold`:
1. **Trade-off Curve**: As $R$ increases from $0.35$ up to $0.95$, the flag rate and catch rate never decrease (monotonic). Lower $R$ minimizes human review overhead; higher $R$ catches more leaks.
2. **Diminishing Returns**: Look for the "elbow" where increasing $R$ yields minimal additional catch rate while inflating the flag rate (e.g. flagging many images whose detections are already high-confidence true positives).
3. **The Silent Miss Ceiling**: The maximum achievable catch rate by tuning $R$ alone is capped by $1.0 - \text{silent\_miss\_share}$. If silent misses account for 40% of leaks, tuning $R$ can never achieve a catch rate above 60% without lowering the detector's inference threshold or enhancing the model.

## Caveats & Methodological Notes
1. **Model Architectures & Resolutions**: YOLOv8n-oiv7 operates on 640px letterboxed input; deface uses CenterFace which defaults to full image resolution. Running deface with `--scale 640x480` provides a normalized architectural comparison at similar input dimensions.
2. **WIDER FACE Dataset Characteristics**: WIDER val includes crowds with hundreds of tiny, heavily occluded, and heavily blurred faces (<16px) that general-purpose face detectors intentionally suppress at operational confidence thresholds.
3. **The 70% Coverage Rule**: The 70% area coverage threshold is our deliberate engineering metric for privacy protection: it reflects that an object is sufficiently obscured from human identification even if the detector's raw bounding box had slight boundary shift (IoU < 0.5).


