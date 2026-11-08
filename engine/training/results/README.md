# Training results: from the base model to YOLO26

One folder per training run, `<experiment>/<run>/`: Ultralytics' record of it (`args.yaml` = every setting,
`results.csv` = one row per epoch with val mAP, `results.png`, PR / F1 / P / R curves, confusion matrices, `labels.jpg`,
`val_batch*` = predictions vs labels on val images). Weights are not kept here: the picked ones are in
[`engine/models/`](../../models). Benchmark numbers for every run: [../bench/comparison.md](../bench/comparison.md).

## Datasets

| Name | Count | Source | Used for |
| --- | --- | --- | --- |
| WIDER FACE train | 12,225 train + 610 val images | `wider-face-yolo.zip`: WIDER FACE train in YOLO format, 5 % held out as val | Training, every step from 1 |
| VN plates | 3,428 train + 1,141 val images | `vn-plate-yolo.zip`: Vietnamese plates, polygons converted to boxes, near-duplicates of benchmark images removed | Training, every step from 1 |
| Crowd tiles | 236 crops from WIDER's 45 crowd images | `--tile-crowds`: images with > 300 faces, left out because they run the GPU out of memory, added back as crops | Training, step 3 on |
| Plate copies | Plate image list x2 (6,856) or x3 (10,284) | `--plate-copies N` | Training, step 6 |
| Benchmark set | 3,726 images: 3,226 WIDER val + 500 VN plates (400 `Dataset/Test`, 100 `Dataset/Valid`) | `infra/bench/dataset`, never trained on | Testing, every step |

Training sets are in [`../README.md`](../README.md) (where the zips are). A run's own val mAP (`results.csv`) is on the
training val split, so it only shows whether a run still improves; steps are compared on the benchmark set.

## Journey

Test, for every step: the benchmark set, with every model at the
**same face precision, 0.79** (comparison A), so they compare directly. Privacy = share of faces (plates) at least 70 % covered
by the blur. Face AP doesn't depend on the threshold.

| Step | Run (`results/…` / `bench/…`) | Training data | Input | Face AP | Face privacy | Faces >= 16 px | Plate privacy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0. Base model, no fine-tune (YOLOv8n-oiv7, what the engine shipped) | `yolov8n-oiv7@640` | None (Open Images) | 640 | 0.219 | 0.307 | 0.520 | 0.778 |
|  | `yolov8n-oiv7@960` |  | 960 | 0.306 | 0.377 | 0.648 | 0.838 |
|  | `yolov8n-oiv7@1280` |  | 1280 | 0.369 | 0.449 | 0.750 | 0.806 |
| 1. Fine-tune it on WIDER train + VN plates, at 1280 | `direct-1280/e10-b4` (10 epochs) | WIDER train + VN plates | 1280 | 0.694 | 0.696 | 0.871 | 0.960 |
|  | `direct-1280/e20` (20 epochs) | same | 1280 | 0.687 | 0.699 | 0.884 | 0.992 |
| 2. Newer architecture: YOLO11n, 20 epochs | `yolo11-1280/e20` | same | 1280 | 0.713 | 0.716 | 0.889 | 0.970 |
|  | same weights at 960 / 640 | same | 960 / 640 | 0.650 / 0.519 | 0.648 / 0.504 | 0.868 / 0.802 | 0.976 / 0.958 |
| 3. Data tricks on YOLO11n | `yolo11-1280/e20-pl` (pseudo-labels: faces on plate images and back) | + pseudo-labels | 1280 | 0.708 | 0.709 | 0.887 | 0.988 |
|  | `yolo11-1280/e5-crowd` (+5 epochs with WIDER's crowd images as tiles) | + crowd tiles | 1280 | 0.719 | 0.723 | 0.891 | 0.984 |
|  | `yolo11-1280/e5-crowd-os2` (+ small/medium faces oversampled x2) | + crowd tiles, small/medium faces x2 | 1280 | 0.717 | 0.724 | 0.898 | 0.980 |
| 4. Bigger model: YOLO11s, 12 epochs, crowd tiles | `yolo11s-960/e12` | + crowd tiles | 960 | 0.716 | 0.731 | 0.898 | 0.970 |
|  | `yolo11s-1280/e12` | + crowd tiles | 1280 | 0.743 | 0.753 | 0.904 | 0.974 |
| 5. Same recipe for all (1280, 20 epochs, crowd tiles from the start, Kaggle T4 x2) | `yolo11n-1280/e20-crowd` (YOLO11n) | + crowd tiles from the start | 1280 | 0.741 | 0.745 | 0.895 | 0.966 |
|  | **`yolo26n-1280/e20-crowd` (YOLO26n): Fast** | same | 1280 | 0.751 | 0.763 | 0.914 | **0.976** |
|  | `yolo26s-1280/e20-crowd` (YOLO26s) | same | 1280 | 0.772 | 0.789 | 0.927 | 0.958 |
| 6. Fine-tunes of YOLO26s, to recover its plates | `yolo26s-1280/e5-ft` (+5 epochs, crowd tiles, AdamW) | + crowd tiles | 1280 | **0.776** | **0.791** | **0.929** | 0.946 |
|  | `yolo26s-1280/e5-plates-frozen` (from e20: backbone frozen, SGD lr0 0.002, plates x2) | + crowd tiles, plates x2 | 1280 | 0.770 | 0.787 | 0.928 | 0.968 |
|  | **`yolo26s-1280/e5-plates-frozen-x3` (+5 more: SGD lr0 0.001, plates x3): Accurate** | + crowd tiles, plates x3 | 1280 | 0.773 | 0.790 | 0.929 | 0.958 |
| Reference: deface (CenterFace), full resolution | `deface-full` | Not ours (CenterFace) | full | 0.649 | 0.657 | 0.907 | — |
| Reference: deface at 640x480 | `deface-640x480` |  | 640x480 | 0.471 | 0.486 | 0.822 | — |

What each step taught us:

0. The base model barely finds faces (its Open Images training has few small ones); a larger input helps but is no fix.
1. Fine-tuning is the big jump (face AP 0.37 → 0.69, plates 0.81 → 0.96+). 20 epochs ≈ 10: the data, not the length, limits it.
2. YOLO11n adds ~2 points. The input size at inference must match training: the same weights lose 7–21 points at 960 / 640.
3. Pseudo-labels did not help (they added only ~50 boxes); crowd tiles added a little; oversampling nothing.
4. YOLO11s gains ~3 points over YOLO11n at 1280 (at 960 it is no better than YOLO11n at 1280): input size matters more than
   model size.
5. Under one recipe, YOLO26 beats YOLO11 at the same size (n: 0.763 vs 0.745), at the same GPU speed. YOLO26s adds ~2.6 points
   on faces, mostly tiny ones, but loses ~2 on plates.
6. A plain fine-tune (AdamW, low learning rate, no warm-up) made plates worse, whatever the data. Freezing the backbone with the
   original optimizer (SGD) brought plate AP back (0.963 → 0.978–0.980) with faces unchanged. What is left between the two frozen
   runs is mostly the confidence of the plates, so a lower threshold for plates recovers them (0.976 at threshold 0.069).

**Picked** (the engine's detection modes, thresholds per class proposed from `../bench/`): **Fast** = YOLO26n (face 0.17, plate
0.11), **Accurate** = YOLO26s frozen x3 (face 0.13, plate 0.09), **Maximum privacy** = the same YOLO26s at low thresholds (face
0.06, plate 0.05). The models are in [`engine/models/`](../../models); see the task in [`engine/docs/plan.md`](../../docs/plan.md).
The engine needs per-class thresholds for these; until then the columns above use one threshold per run.

At deface's own default precision (0.64, comparison C), Fast protects 0.804 of all faces vs deface's 0.723, and 0.935 vs 0.930 of
faces >= 16 px; Accurate 0.827 and 0.946.

Open: YOLO11s under the comparison recipe (20 epochs, for a like-for-like "26s vs 11s"). Speed: [`infra/bench/results/comparison.md`](../../../infra/bench/results/comparison.md).
