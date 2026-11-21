# Video bench

The whole Engine (detection, tracking, allow list, blur) on labelled clips, scored frame by frame against CVAT labels.
Results and what we learned: [results/comparison.md](results/comparison.md). The clips, their labels and the owners'
reference photos and plate texts are in `../datasets/whitelist-videos/` (gitignored, see
[docs/datasets.md](../../../docs/datasets.md), "Public social-media clips").

Run everything from `engine/` with the Engine's venv (`.venv/bin/python training/video/...`); only `run_tool.py` uses the tool's own venv.

## Run it

| Step | Command (from `engine/`) | What it does, on which data | Output |
| --- | --- | --- | --- |
| 1. Data | none to fetch: the clips are local only (`datasets/whitelist-videos/`) | 2 dashcam + 3 phone clips, labels saved as CVAT zips | — |
| 2. Engine runs + scores | `bash training/video/run_dashcam.sh [tag…]` | the Engine's real video path on every clip (per model tag), scored against the labels | `bench/prelabels/<clip>-<tag>.engine.json`, `bench/scores/<clip>-<tag>.txt` |
| 3. One score | `.venv/bin/python training/video/score.py <clip> --engine <run> --labels <zip>` | blur coverage, leaks, recall, allow list for one run | printed (`--json` to save) |
| 4. Look at it | `.venv/bin/python training/video/render_compare.py <video> <a.engine.json> <b.engine.json> <out.mp4> "A" "B"` | side-by-side video of what two runs blurred | `<out.mp4>` |
| Other tools | `training/video/run_tool.py`, `score_tool.py` (below) | deface / EgoBlur on the same frames | `bench/tools/`, `bench/scores/` |

(`bench/` = `datasets/whitelist-videos/bench/`.)

## Clips

| Name | Video (under `datasets/whitelist-videos/`) | Owner | "Fully blurred" |
| --- | --- | --- | --- |
| `plate-test1` | `plate/video/test1.mp4` | plate text in `plate/OCR/plateTest1.txt` | 90% of the box |
| `plate-test2` | `plate/video/test2.mp4` | `plate/OCR/plateTest2.txt` | 90% |
| `face-test1` | `face/video/test1/*.mp4` | photos in `face/ImageWhitelist/whitelist1/` | 70% |
| `face-test2a`, `face-test2b` | the two `face/video/test2/*.mp4` | `face/ImageWhitelist/whitelist2/` | 70% |

Plate `test3` and `test4` are training data (the dashcam fine-tune) and are not scored. Each clip's labels are saved as
`bench/prelabels/<clip>.labels.zip` (a CVAT export), so scoring needs no CVAT.

## Score the Engine

```bash
cd engine
bash training/video/run_dashcam.sh                 # maxcur maxnew fastcur fastnew: both modes, current vs dashcam model
bash training/video/run_dashcam.sh maxneg fastneg  # other model sets, as named in the script's MODEL table
ONLY=plate SUFFIX=-x bash training/video/run_dashcam.sh maxnew   # plate clips only, under a new run name
```

Per clip and model it runs `prelabel.py --no-upload` (the Engine's real tracking pass: writes
`bench/prelabels/<clip>-<tag>.engine.json`), then `score.py` against the saved labels (report in
`bench/scores/<clip>-<tag>.txt`, numbers in `.json`).

## The scripts

| Script | What |
| --- | --- |
| `run_dashcam.sh` | the loop above |
| `prelabel.py` | runs the Engine on a clip; writes its boxes and decisions, and (without `--no-upload`) loads them into CVAT as editable tracks, to label a new clip |
| `score.py` | scores one run: blur coverage per labelled box, leak runs in ms, detection recall, track breaks, allow list (owner kept vs stranger leaked); `--labels <zip>` skips CVAT |
| `to_frames.py` | turns a CVAT video task into an image task with exact frames (CVAT seeks inaccurately in B-frame H.264) |
| `render_compare.py` | side-by-side video of two runs, to see what each blurred (`--ids` writes track ids) |
| `run_tool.py`, `score_tool.py` | the open-source tools on the same clips (below) |

Labelling a new clip needs the local CVAT (`~/cvat-local`, `docker compose up -d` there; http://localhost:8099, login in
`~/cvat-local/login.txt`).

## Open-source tools on the same clips

deface and EgoBlur Gen2 run frame by frame on the same exact frames (`ffmpeg -fps_mode passthrough`) and are scored by the
same `score.py`: each box at or above the threshold becomes a one-frame track that is never on the allow list (these tools
have neither tracking nor an allow list).

```bash
cd engine
../infra/bench/.cache/deface-venv/bin/python training/video/run_tool.py deface <clip.mp4> <clip>   # every box >= 0.05
training/.cache/egoblur/venv/bin/python training/video/run_tool.py egoblur <clip.mp4> <clip>
.venv/bin/python training/video/score_tool.py <clip> deface 0.2 0.15 0.7    # deface defaults: thr 0.2, box 1.3x = 15% a side
.venv/bin/python training/video/score_tool.py <clip> egoblur 0.674 0 0.9    # EgoBlur default threshold, boxes not grown
```

The last argument is the clip's "fully blurred" coverage. `run_tool.py` writes `bench/tools/<clip>.<tool>.json`; the runs
of both tools on all five clips are saved there, so scoring again needs no GPU. The deface venv is made by
`infra/bench/compare/deface.sh`; the EgoBlur setup is in [../detection/README.md](../detection/README.md), "Other tools".
