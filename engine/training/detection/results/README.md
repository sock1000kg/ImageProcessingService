# Training results: from the base model to YOLO26

One folder per training run, `<experiment>/<run>/`: Ultralytics' record of it (`args.yaml` = every setting,
`results.csv` = one row per epoch with val mAP, `results.png`, PR / F1 / P / R curves, confusion matrices, `labels.jpg`,
`val_batch*` = predictions vs labels on val images). Weights are not kept here: the picked ones are in
[`engine/models/`](../../../models). Benchmark numbers for every run: [../bench/comparison.md](../bench/comparison.md).

## Datasets

| Name | Count | Source | Used for |
| --- | --- | --- | --- |
| WIDER FACE train | 12,225 train + 610 val images | `wider-face-yolo.zip`: WIDER FACE train in YOLO format, 5 % held out as val | Training, every step from 1 |
| VN plates | 3,428 train + 1,141 val images | `vn-plate-yolo.zip`: Vietnamese plates, polygons converted to boxes, near-duplicates of benchmark images removed | Training, every step from 1 |
| Crowd tiles | 236 crops from WIDER's 45 crowd images | `--tile-crowds`: images with > 300 faces, left out because they run the GPU out of memory, added back as crops | Training, step 3 on |
| Plate copies | Plate image list x2 (6,856) or x3 (10,284) | `--plate-copies N` | Training, step 6 |
| Dashcam plates | 468 frames (250 BDD100K + 218 of two Vietnamese traffic clips), 590 plates, labelled in CVAT | `--extra dashcam-plates:4`; [docs/datasets.md](../../../../docs/datasets.md) | Training, step 8 |
| Gauge negatives | 384 Open Images gauge photos, empty labels | `--extra gauge-negatives:2` | Training, step 8 (second version) |
| Benchmark set | 3,726 images: 3,226 WIDER val + 500 VN plates (400 `Dataset/Test`, 100 `Dataset/Valid`) | `infra/bench/dataset`, never trained on | Testing, every step |

Training sets are in [`../README.md`](../README.md) (where the zips are). A run's own val mAP (`results.csv`) is on the
training val split, so it only shows whether a run still improves; steps are compared on the benchmark set.

## Journey

Test, for every step: the benchmark set, with every model at the
**same face precision, 0.78-0.79** (comparison A; section D of `../bench/comparison.md` compares plates at their own precision), so they compare directly. Privacy = share of faces (plates) at least 70 % covered
by the blur. Face AP doesn't depend on the threshold.

| Step | Run (`results/…` / `bench/…`) | Training data | Recipe (`args.yaml`) | Input | Face AP | Face privacy | Faces >= 16 px | Plate privacy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0. Base model, no fine-tune (YOLOv8n-oiv7, what the engine shipped) | `yolov8n-oiv7@640` | None (Open Images) | — | 640 | 0.219 | 0.307 | 0.520 | 0.778 |
|  | `yolov8n-oiv7@960` |  | — | 960 | 0.306 | 0.377 | 0.648 | 0.838 |
|  | `yolov8n-oiv7@1280` |  | — | 1280 | 0.369 | 0.449 | 0.750 | 0.806 |
| 1. Fine-tune it on WIDER train + VN plates, at 1280 | `direct-1280/e10-b4` (10 epochs) | WIDER train + VN plates | auto¹, lr0 0.01, 10 ep, batch 2 | 1280 | 0.694 | 0.696 | 0.871 | 0.960 |
|  | `direct-1280/e20` (20 epochs) | same | auto¹, lr0 0.01, 20 ep, batch 2 | 1280 | 0.687 | 0.699 | 0.884 | 0.992 |
| 2. Newer architecture: YOLO11n, 20 epochs | `yolo11-1280/e20` | same | auto¹, lr0 0.01, 20 ep, batch 2 | 1280 | 0.713 | 0.716 | 0.889 | 0.970 |
|  | same weights at 960 / 640 | same | same as above | 960 / 640 | 0.650 / 0.519 | 0.648 / 0.504 | 0.868 / 0.802 | 0.976 / 0.958 |
| 3. Data tricks on YOLO11n | `yolo11-1280/e20-pl` (pseudo-labels: faces on plate images and back) | + pseudo-labels | auto¹, lr0 0.01, 20 ep, batch 2 | 1280 | 0.708 | 0.709 | 0.887 | 0.988 |
|  | `yolo11-1280/e5-crowd` (+5 epochs with WIDER's crowd images as tiles) | + crowd tiles | AdamW 0.0005, no warm-up, 5 ep, batch 2 | 1280 | 0.719 | 0.723 | 0.891 | 0.984 |
|  | `yolo11-1280/e5-crowd-os2` (+ small/medium faces oversampled x2) | + crowd tiles, small/medium faces x2 | AdamW 0.0005, no warm-up, 5 ep, batch 2 | 1280 | 0.717 | 0.724 | 0.898 | 0.980 |
| 4. Bigger model: YOLO11s, 12 epochs, crowd tiles | `yolo11s-960/e12` | + crowd tiles | auto¹, lr0 0.01, 12 ep, batch 4 | 960 | 0.716 | 0.731 | 0.898 | 0.970 |
|  | `yolo11s-1280/e12` | + crowd tiles | auto¹, lr0 0.01, 12 ep, batch 4 | 1280 | 0.743 | 0.753 | 0.904 | 0.974 |
| 5. Same recipe for all (1280, 20 epochs, crowd tiles from the start, Kaggle T4 x2) | `yolo11n-1280/e20-crowd` (YOLO11n) | + crowd tiles from the start | auto¹, lr0 0.01, 20 ep, batch 16 | 1280 | 0.741 | 0.745 | 0.895 | 0.966 |
|  | `yolo26n-1280/e20-crowd` (YOLO26n): Fast until step 8 | same | auto¹, lr0 0.01, 20 ep, batch 16 | 1280 | 0.751 | 0.763 | 0.914 | **0.976** |
|  | `yolo26s-1280/e20-crowd` (YOLO26s) | same | auto¹, lr0 0.01, 20 ep, batch 8 | 1280 | 0.772 | 0.789 | 0.927 | 0.958 |
| 6. Fine-tunes of YOLO26s, to recover its plates | `yolo26s-1280/e5-ft` (+5 epochs, crowd tiles, AdamW) | + crowd tiles | AdamW 0.0005, no warm-up, 5 ep, batch 8 | 1280 | **0.776** | **0.791** | **0.929** | 0.946 |
|  | `yolo26s-1280/e5-plates-frozen` (from e20: backbone frozen, SGD lr0 0.002, plates x2) | + crowd tiles, plates x2 | SGD 0.002, freeze 11, 5 ep, batch 2 | 1280 | 0.770 | 0.787 | 0.928 | 0.968 |
|  | `yolo26s-1280/e5-plates-frozen-x3` (+5 more: SGD lr0 0.001, plates x3): Maximum privacy until step 8 | + crowd tiles, plates x3 | SGD 0.001, freeze 11, 5 ep, batch 2 | 1280 | 0.773 | 0.790 | 0.929 | 0.958 |
| 7. Covered plates, after the video benchmark | `yolo26s-1280/e5-plates-occ` (from frozen x3: plates x2 + 1 partly covered copy) | + covered plate copies | SGD 0.001, freeze 11, 5 ep, batch 8 | 1280 | 0.774 | 0.792 | 0.929 | **0.980** |
|  | `yolo26s-1280/e5-plates-occ-half` (half of the plate copies covered) | same | SGD 0.001, freeze 11, 5 ep, batch 8 | 1280 | 0.777 | 0.794 | 0.930 | **0.980** |
| 8. Dashcam plates, after the video benchmark (Kaggle T4 x2) | **`yolo26s-1280/e5-dashcam` (from frozen x3: + dashcam frames x4): Maximum privacy** | + crowd tiles, plates x3, dashcam x4 | SGD 0.001, freeze 11, 5 ep, batch 8 | 1280 | 0.773 | 0.795 | 0.931 | 0.964 |
|  | **`yolo26n-1280/e5-dashcam` (from Fast e20-crowd: + dashcam frames x4): Fast** | + crowd tiles, plates x1, dashcam x4 | SGD 0.001, freeze 11, 5 ep, batch 8 | 1280 | 0.748 | 0.767 | 0.913 | 0.974 |
|  | `yolo26s-1280/e5-dashcam-neg` (as e5-dashcam + gauge photos x2 as negatives) | + gauge negatives | SGD 0.001, freeze 11, 5 ep, batch 8 | 1280 | 0.772 | 0.795 | 0.929 | 0.966 |
|  | `yolo26n-1280/e5-dashcam-neg` | same | SGD 0.001, freeze 11, 5 ep, batch 8 | 1280 | 0.749 | 0.767 | 0.915 | 0.974 |
| Reference: deface (CenterFace), full resolution | `deface-full` | Not ours (CenterFace) | — | full | 0.649 | 0.657 | 0.907 | — |
| Reference: deface at 640x480 | `deface-640x480` |  | — | 640x480 | 0.471 | 0.486 | 0.822 | — |

¹ Ultralytics' `optimizer=auto`: for runs over 10,000 iterations it picks SGD (Ultralytics 8.3) or MuSGD (8.4, the version in `requirements.txt`), both at lr0 0.01. `args.yaml` does not record the version, so which one a base run got is not known. The other recipes are pinned: optimizer, initial learning rate, `freeze` (layers kept fixed; 11 = the backbone), epochs, batch (total over the GPUs).

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

7. Plates with a patch from the same image pasted over 25-70% of them (no partly hidden plate was in the training set) find
   more benchmark plates (0.958 → 0.980) at lower plate precision (0.926 → 0.89), faces unchanged. On our own video clips they
   barely helped partly hidden plates (55.7% → 52.5% missed) and kept the allow-list owner less often, so they were not picked:
   [`../video/results/comparison.md`](../../video/results/comparison.md).

8. The plate data were close-ups (one plate ~20 % of the photo wide; dashcam plates are ~2 %). 468 labelled dashcam frames
   (`--extra dashcam-plates:4`, old data kept in, backbone frozen) leave faces and the close-up benchmark plates as they were
   and cut **readable plates missed on video ~4x for YOLO26s (9.8 → 2.3 %, 32.8 → 9.4 %) and ~2x for YOLO26n**, partly hidden
   plates 30.6 → 11.9 %. Their plate precision on this benchmark drops (0.92 → 0.79 at the face threshold), but most of the
   "false" boxes are real background plates the benchmark doesn't label (checked by eye on 24). Side effect: the rider's own
   speedometer logo gets blurred; gauge photos as negatives did not fix it for YOLO26s. Use `last.pt` for such runs: `best.pt`
   is chosen on the old val split, which has no dashcam frames. Details: [`../../video/results/comparison.md`](../../video/results/comparison.md).

**Picked** (the engine's detection modes, thresholds per class proposed from `../bench/`): **Fast** = YOLO26n e5-dashcam
(`yolo26n-1280-e5-dashcam.pt`, face 0.17, plate 0.11), **Maximum privacy** = YOLO26s e5-dashcam
(`yolo26s-1280-e5-dashcam.pt`, face 0.06, plate 0.05), since step 8; before it, e20-crowd and frozen x3 at the same thresholds. The models are in [`engine/models/`](../../../models); see the task in [`engine/docs/plan.md`](../../../docs/plan.md).
The engine needs per-class thresholds for these; until then the columns above use one threshold per run.

At deface's own default precision (0.64, comparison C), Fast protects 0.804 of all faces vs deface's 0.723, and 0.935 vs 0.930 of
faces >= 16 px; YOLO26s at 0.13 / 0.09 (the retired Accurate mode) 0.827 and 0.946.

Open: YOLO11s under the comparison recipe (20 epochs, for a like-for-like "26s vs 11s"). Speed: [`infra/bench/results/comparison.md`](../../../../infra/bench/results/comparison.md).
