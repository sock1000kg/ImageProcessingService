# Benchmark reruns for the report (Nov 2026)

The report's speed numbers came from models and settings that are no longer what the app runs. This is the list of
runs that replace them, and what each one feeds. Current modes (engine defaults, `engine/src/config.py`):
**Fast** = `yolo26n-1280-e5-dashcam` at 1280 px, face 0.17 / plate 0.11; **Max privacy** = `yolo26s-1280-e5-dashcam`
at 1280 px, face 0.06 / plate 0.05. All runs at 1280 px (the modes' own size).

What "fixed" means here:

- **preload**: workers held at 0, every image queued, then the workers released. Only **drain** counts (how fast N
  workers empty a full queue, no network). Its end-to-end number is meaningless (uploads + start-up + drain), ignore it.
- **warm**: N workers Ready and warmed up (2×N untimed images) before the first upload; uploads overlap processing.
  Compare deployment modes on **end-to-end** of warm vs autoscale runs only.

Whitelist runs use the face reference `13_Interview_Interview_On_Location_13_912.jpg` (one large face, in both image
sets) and the plates `30A12345,51F67890`. Every detected face / plate is embedded / OCR'd once a whitelist is attached,
match or not, so the cost is real.

## GPU: laptop (RTX 3050), 3,726 images

Cluster: Docker Desktop closed → `sudo -E bash infra/bench/local-cluster/up.sh` → start Docker Desktop →
`sudo -E bash infra/bench/local-cluster/build-web.sh` (the web image must be rebuilt: detection modes came after the
last laptop runs). Common flags: `--machine laptop-rtx3050 --dataset max --parallel 4` (as the old GPU runs).
Face ref: `infra/bench/dataset/images-max/13_Interview_Interview_On_Location_13_912.jpg`.

| # | Command (`bash infra/bench/run.sh` + common flags +) | Feeds |
| --- | --- | --- |
| G1 | `--workers 3 --preload` | Fast drain: 5.7, 4.4 speed, 4.9 GPU |
| G2 | `--workers 3 --preload --whitelist-face <ref>` | face whitelist cost |
| G3 | `--workers 3 --preload --whitelist-plates 30A12345,51F67890` | plate whitelist cost |
| G4 | `--workers 3` | Fast end-to-end, warm: 5.7, Hình 5.4 |
| G5 | `--autoscale --min 0 --max 3` | Fast end-to-end + cold start: 5.7, Hình 5.3, Hình 5.4 |
| G6 | `--workers 3 --preload --detection-mode max_privacy` | Max privacy drain: 5.7, 4.4, 4.9 GPU |
| G7 | G6 + `--whitelist-face <ref>` | face whitelist cost, Max privacy |
| G8 | G6 + `--whitelist-plates 30A12345,51F67890` | plate whitelist cost, Max privacy |
| G9 | `--workers 3` with web at 0.5 CPU | Hình 5.5 (Fast) |
| G10 | `--workers 3` with web at 2 CPU | Hình 5.5 (Fast); the third point is G4 (web 1 CPU, the default) |
| G11 | `--workers 3 --detection-mode max_privacy` with web at 0.5 CPU | Hình 5.5 (Max privacy) |
| G12 | `--workers 3 --detection-mode max_privacy` with web at 2 CPU | Hình 5.5 (Max privacy) |
| G13 | `--workers 3 --detection-mode max_privacy` (web 1 CPU, optional) | Hình 5.5 third point for Max privacy |

G9 to G13: `run.sh` does not change web's CPU limit. On the laptop cluster only:
`kubectl --kubeconfig ~/.kube/bench-local.yaml --context bench-local -n imgproc set resources deploy/web --limits=cpu=500m`
(or `2`), wait for the rollout, run, then set it back to `1`.

## CPU: lab (home-server), 100 images, Fast only

Before: restart the lab's web (its NATS connection died when NATS was recreated on 22 Nov:
`kubectl --context default -n imgproc rollout restart deploy/web`), and delete the leftover bench draft batch
`7fba6e99-a5cd-4463-9e65-5665c9130e35`. Common: `KUBE_CONTEXT=default bash infra/bench/run.sh` (dataset small,
`--parallel 1`, as the old lab runs). Face ref: `infra/bench/dataset/images/13_Interview_Interview_On_Location_13_912.jpg`.

| # | Flags | Feeds |
| --- | --- | --- |
| C1 | `--workers 2 --preload` | Fast drain on CPU: 5.8, 4.9 CPU |
| C2 | `--workers 2 --preload --whitelist-face <ref>` | face whitelist cost on CPU |
| C3 | `--workers 2 --preload --whitelist-plates 30A12345,51F67890` | plate whitelist cost on CPU |
| C4 | `--workers 2` | end-to-end, warm: 5.8, Hình 5.4 |
| C5 | `--autoscale --min 0 --max 2` | end-to-end + cold start: 5.8, Hình 5.3, Hình 5.4 |
| C6 | `--workers 2 --detection-mode max_privacy` | Max privacy end-to-end, warm: 5.8 |
| C7 | `--autoscale --min 0 --max 2 --detection-mode max_privacy` | Max privacy end-to-end + cold start: 5.8 |

The first C1 to C3 (16:51 to 17:00 on 22 Nov) ran about 2× slower per image than the same images in C4, from load on the
lab node right after web's restart; they were deleted and rerun.

## Other

| # | What | Feeds |
| --- | --- | --- |
| M1 | `bash infra/bench/compare/comparison.sh`: regenerates the raw tables and times both dashcam models on 2 CPU threads (`cpu_speed.py`) | 4.9 CPU column, deface comparison |
| V1 | Rerun 23 Nov on real video: `MODELS_DIR=models .venv/bin/python tests/benchmark_video_cpu.py` from `engine/`, on the laptop (YOLO on the RTX 3050, Fast). The script now cuts every test clip from a real video (default the local, git-ignored `training/datasets/whitelist-videos/plate/video/test1.mp4`, street traffic; 10 s from 0 s, 30 fps, scaled to 854×480 / 1280×720 / 1920×1080), warms up once untimed, runs each size with and without a whitelist, and times each stage inside the real run. ArcFace and OCR per-unit times use real face / plate crops from the clip. The earlier 22 Nov numbers came from synthetic OpenCV-drawn 3-second clips with nothing to detect | 5.9 (time per stage), 5.10 (per resolution), from `engine/docs/benchmark_cpu_results.md` |

## After the runs

1. `comparison.sh` (M1), then rewrite "Final comparison" in `infra/bench/results/comparison.md` by hand: drop the
   preload end-to-end column, Fast / Max privacy instead of Fast / Accurate, the web-limit table from G4 and G9 to G13,
   the deface speed comparison from G1 / G6.
2. Delete the old lab runs in `infra/bench/results/home-server-100/` (`yolo26n-1280-e20-crowd`,
   `yolo26s-1280-e5-plates-frozen-x3`, `yolov8n-oiv7`). The old laptop runs are already deleted.
3. Redraw Hình 5.3, 5.4, 5.5 (the matplotlib script used for the current PNGs, pointed at the new runs).
4. Docx: every spot marked "CẦN CẬP NHẬT" (Bảng 4.4, 4.9, 5.7, 5.8, 5.9, 5.10, Hình 5.3 to 5.5, mục 4.9, 5.7.1,
   5.7.2, the deface speed sentence in 4.5).
