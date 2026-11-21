# Detector training (faces + plates)

Fine-tunes the engine's detector (faces + licence plates) and scores it on the benchmark set. The engine loads the result as
a normal Ultralytics `.pt`: class names match its mapping (`Human face`, `Vehicle registration plate` in
`engine/src/processors/image_redact.py`), so a new model needs only `YOLO_MODEL_NAME` / `YOLO_IMGSZ` and a threshold.

**Picked models** (detection modes): Fast = YOLO26n e5-dashcam, Maximum privacy = YOLO26s e5-dashcam, 1280 px, in
[`engine/models/`](../../models) where the engine loads them. **Results:** the journey from the base model to these in
[results/README.md](results/README.md), every benchmark number in [bench/comparison.md](bench/comparison.md), throughput
in [infra/bench/results/comparison.md](../../../infra/bench/results/comparison.md), on our own video clips in
[../video/results/comparison.md](../video/results/comparison.md). Run every command below from `engine/training/detection`;
`datasets/`, `runs/` and `kaggle-out/` are one level up, shared with the other folders.

## Run it

From `engine/training/detection`, with the training venv `../.venv` (setup below). Each step, its data and its output:

| Step | Command | What it does, on which data | Output |
| --- | --- | --- | --- |
| 1. Training data | copy `wider-face-yolo.zip`, `vn-plate-yolo.zip` to `../datasets/` | WIDER FACE train + Vietnamese plates, YOLO format (team Drive / Kaggle, below) | unzipped by `train.py` |
| 1b. Fine-tune extras | `python3 fetch_extras.py bdd100k` / `gauges` | downloads the 250 BDD100K dashcam frames and 384 Open Images gauge photos we used (`lists/`) | `../datasets/bdd100k/`, `../datasets/gauge-negatives/` |
| 1c. Benchmark data | `bash ../../../infra/bench/dataset/fetch.sh --set max --labels` | WIDER FACE val (3,226) + UET plates (500), SHA-256 checked | `infra/bench/dataset/` |
| 2. Train | `../.venv/bin/python train.py --experiment … --run …` (laptop) or `bash kaggle/push.sh …` (Kaggle) | trains or fine-tunes YOLO on step 1's data (`--extra` adds 1b) | `../runs/<exp>/<run>/` |
| 3. Benchmark | `../.venv/bin/python bench.py --weights … --name …` | runs a model like the Engine on the 3,726 benchmark images, then scores it | `bench/<name>/` |
| 4. Compare | `../.venv/bin/python compare.py` | every run (and the other tools) at the same face precision | `bench/comparison.md` |
| Other tools | `../.venv/bin/python bench_yunet.py --name yunet-2023mar`, `bench_egoblur.py` (below) | YuNet / EgoBlur on step 3's images | `bench/<name>/` |

Details of every step follow.

## Flow

```
datasets/*.zip ──► train.py ──► runs/<exp>/<run>/ ──► bench.py ──► bench/<exp>-<run>@<px>/ ──► compare.py ──► bench/comparison.md
 WIDER train        laptop GPU or     (weights, plots;      scores it like the engine     (detections + its     (all runs + deface,
 + VN plates        Kaggle (same      local only)           on the benchmark set          accuracy report)      at matched precision)
                    script, resumable)     │
                                           ├──► results/<exp>/<run>/  training record (plots, results.csv, args.yaml)
                                           └──► engine/models/<exp>-<run>.pt  if picked (Engine rebuilds the image)
```

## Setup (once)

```bash
cd engine/training
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt     # ~6 GB (PyTorch with CUDA)
mkdir -p datasets && cp <where you have them>/{wider-face,vn-plate}-yolo.zip datasets/   # unzipped by train.py
bash ../../infra/bench/dataset/fetch.sh --set max --labels
cd detection   # benchmark images + labels, for bench.py
```

The training zips are too big for git (1.4 GB + 1 GB): copies are on the team Drive (`Privacy-ML-Training/dataset`) and in
the private Kaggle dataset `imgproc-face-plate-yolo`. `wider-face-yolo.zip`: WIDER FACE train in YOLO format (5 % held out
as val). `vn-plate-yolo.zip`: Vietnamese plates, polygons converted to boxes, near-duplicates of benchmark images removed.

## 1. Train

```bash
# laptop: new run
nohup ../.venv/bin/python train.py --experiment yolo26n-1280 --run e20-crowd --base yolo26n.pt --epochs 20 --batch 2 \
  --close-mosaic 3 --tile-crowds > train.log 2>&1 &
# continue from a finished run (new run, starts from its best.pt)
../.venv/bin/python train.py --experiment yolo26n-1280 --run e5-ft --start-from yolo26n-1280/e20-crowd --tile-crowds \
  --epochs 5 --batch 2 --close-mosaic 1 --warmup-epochs 0 --lr0 0.0005
# Kaggle (T4 x2, both GPUs used): same train.py arguments after --
bash kaggle/push.sh imgproc-yolo26n-1280-e20 -- --experiment yolo26n-1280 --run e20-crowd --base yolo26n.pt \
  --imgsz 1280 --epochs 20 --batch 16 --close-mosaic 3 --tile-crowds
~/.kaggle/venv/bin/kaggle kernels status sock1000kg/imgproc-yolo26n-1280-e20      # RUNNING ... COMPLETE
~/.kaggle/venv/bin/kaggle kernels output sock1000kg/imgproc-yolo26n-1280-e20 -p ../kaggle-out && \
  cp -r ../kaggle-out/runs/yolo26n-1280/e20-crowd ../runs/yolo26n-1280/
```

- **Same `--experiment` + `--run` = resume** from `last.pt` (only `--batch` / `--workers` can change). **New `--run` = new
  run.** `--help` lists every option. A run's mAP in `results.csv` is on the training val split: use it to see whether a
  run still improves, and the benchmark (step 2) to compare runs.
- **Comparison recipe** (for claims like "26 beats 11"): 1280, 20 epochs, `--tile-crowds` from the start, default
  optimizer, close-mosaic 3, Ultralytics 8.4.202, on Kaggle. `--batch` only changes speed and memory (gradients accumulate
  to 64 either way): 16 for n, 8 for s.
- **Fine-tuning a finished model:** freeze the backbone and keep the original optimizer (`--freeze 11 --optimizer SGD --lr0 0.002`).
  Plain fine-tunes (`--lr0` alone = AdamW, no freeze) lost plate accuracy. `--plate-copies N` lists the plate images N times.
- Laptop limits (4 GB GPU, WSL 10 GB RAM): `--batch 2` at 1280 (4 overflows into system RAM, ~6× slower), `--workers 2`.
- Data options: `--tile-crowds` adds WIDER's 45 crowd images (> 300 faces, left out because they run the GPU out of
  memory) back as crops; `--oversample N` lists images with mostly 16–96 px faces N times; `--data-dir datasets-pl` uses
  the pseudo-labelled copy made by `pseudo_label.py`. All of these are generated from the two zips. `--extra NAME:COPIES`
  (repeatable) adds another YOLO folder, `../datasets/NAME/images/train`, listed COPIES times, e.g. the dashcam frames
  (`--extra dashcam-plates:4`) or gauge photos with empty labels as hard negatives (`--extra gauge-negatives:2`).
- Kaggle: `kaggle/upload-data.sh` uploads `../datasets/*.zip` (once); logs only appear when the run ends; to start from our
  own weights or add an `--extra` folder, upload it as a Kaggle dataset and pass `--dataset <dataset>` (repeatable) plus
  `--base <file name>` / `--extra <folder>:<copies>`;
  `--ultralytics VERSION` picks the version installed there. CLI: `~/.kaggle/venv`, token in `~/.kaggle/access_token`.

## 2. Benchmark and compare

```bash
../.venv/bin/python bench.py --weights ../runs/yolo26n-1280/e20-crowd/weights/best.pt --name yolo26n-1280-e20-crowd@1280 --imgsz 1280
../.venv/bin/python compare.py            # every bench/ folder + deface -> bench/comparison.md (seconds)
../.venv/bin/python compare.py <name> …   # only these (plus deface), e.g. with --out bench/selection.md
```

- `bench.py` runs the model like the engine (confidence floor 0.05, same input size) on the 3,726 benchmark images and
  writes `bench/<name>/` (`detections.jsonl.gz`, `meta.json`); no cluster needed. Name runs `<exp>-<run>@<px>`, and score
  the same weights at another size as another name (`…@960`).
- Each run's `accuracy.json` holds its curves: precision, recall, privacy (overall, per size, >= 16 px) and plates at
  every threshold 0.050–0.950, computed once. `compare.py` reads them and writes `bench/comparison.md`: every run at
  the same face precision as (A) the best model at 0.15, (B) its own best-F1 threshold, (C) deface's default. It only
  scores runs whose curves are missing or older than their detections (`--rescore`: all). Add a description of a new
  run to `RUNS` in `compare.py`.
- `accuracy/evaluate.py` is the scorer underneath (see [accuracy/README.md](accuracy/README.md)).

## 3. Record and ship

```bash
r=yolo26n-1280/e20-crowd
mkdir -p results/$r && find ../runs/$r -maxdepth 1 -type f ! -name 'train_batch*' -exec cp {} results/$r/ \;   # every run
cp ../runs/$r/weights/best.pt ../../models/${r/\//-}.pt                                                         # if picked
```

Every run gets its training record in `results/` (plots, `results.csv`, `args.yaml`, val predictions; no weights, no
training mosaics) and a line in [results/README.md](results/README.md). A picked model goes to `engine/models/`; then the
engine image needs a rebuild (Engine team); on the laptop cluster `infra/bench/run.sh --model <file in engine/models>`
measures its throughput without one (see [infra/bench/README.md](../../../infra/bench/README.md) §9).

## Other tools (EgoBlur, YuNet, deface)

The open-source detectors we compare against, scored by the same scorer on the same data. Not part of the Engine.

**Why the comparison is fair:** the same 3,726 benchmark images and labels (and, for video, the same exact frames,
`ffmpeg -fps_mode passthrough`, against the same CVAT labels); every box >= 0.05 kept, written in `bench.py`'s format and
scored by the same `accuracy/evaluate.py` (padding 0.1); each tool with its own recommended input size (EgoBlur: its
RGB-camera resize, 1200 px). `compare.py` then puts every run at the same face precision before comparing recall. EgoBlur
cannot go below face precision 0.82 even at 0.05, so it is shown there (a slightly harder point for it).

| Tool | Image benchmark | Clips ([video](../video/README.md)) | Environment |
| --- | --- | --- | --- |
| YuNet (OpenCV zoo) | `bench_yunet.py --name yunet-2023mar` | — | `engine/.venv` |
| deface (CenterFace) | `infra/bench/compare/deface.sh` | `video/run_tool.py deface` | `infra/bench/.cache/deface-venv` (made by `deface.sh`) |
| EgoBlur Gen2 (Meta) | `bench_egoblur.py --name egoblur-gen2` | `video/run_tool.py egoblur` | `../.cache/egoblur/venv` (below) |

**EgoBlur setup (once, from `engine/training/detection`; about 7 GB):**

```bash
git clone https://github.com/facebookresearch/EgoBlur.git ../.cache/egoblur/EgoBlur
git -C ../.cache/egoblur/EgoBlur checkout 28133e5            # the version we ran
python3 -m venv ../.cache/egoblur/venv
../.cache/egoblur/venv/bin/pip install -r requirements-egoblur.txt
```

The models are not in git: download the Gen2 **face** and **licence plate** models from
[projectaria.com/tools/egoblur](https://www.projectaria.com/tools/egoblur) (accept Meta's licence) and put
`ego_blur_face_gen2.jit` and `ego_blur_lp_gen2.jit` in `../.cache/egoblur/models/`. `egoblur_detect.py` wraps them
like EgoBlur's own detector but keeps every score.

**Run:**

```bash
../.cache/egoblur/venv/bin/python bench_egoblur.py --name egoblur-gen2   # image benchmark, ~40 min on the laptop GPU
```

The same tools on the video clips: [../video/README.md](../video/README.md), "Open-source tools on the same clips".

## Files

| Path | What | In git |
| --- | --- | --- |
| `train.py`, `bench.py`, `compare.py`, `pseudo_label.py`, `kaggle/` | the tools above | yes |
| `fetch_extras.py`, `lists/` | downloads the fine-tune extras from the lists of images we used (BDD100K frames, gauge photos with their CC BY credits) | yes (lists only) |
| `bench_yunet.py`, `bench_egoblur.py`, `egoblur_detect.py`, `requirements-egoblur.txt` | the other tools on the image benchmark (above) | yes |
| `accuracy/` | the accuracy scorer (`evaluate.py`, `review.py`, tests) and its documentation | yes |
| `results/` | training record of every run, and the journey ([results/README.md](results/README.md)) | yes |
| `bench/` | benchmark detections and accuracy report per run, `comparison.md` | yes |
| `../datasets/` | the two training zips (and what `train.py` derives from them) | no (too big) |
| `../runs/`, `../datasets-pl/`, `../kaggle-out/` | weights and checkpoints, pseudo-labelled copy, Kaggle downloads | no |
| `../.cache/egoblur/` | EgoBlur checkout, models and venv | no |
