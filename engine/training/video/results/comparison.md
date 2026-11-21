# Video benchmark: allow list and redaction on our own clips

How well the Engine's video path keeps the owner and blurs everyone else, measured on public social-media clips labelled by
the team, for the Maximum privacy detector, two fine-tunes made for partly hidden plates and, last, the dashcam fine-tunes
that became both detection modes (section "Dashcam fine-tune and allow-list fixes"). Raw numbers: [`results.json`](results.json).
What this benchmark is for: the "Face whitelist on our camera", "Plate detection and redaction on scenes" and "Video" rows of
[`../../whitelist-benchmarks.md`](../../whitelist/benchmarks.md). The matcher-only benchmarks (LFW faces, plate crops) are in
[`../../results/whitelist.md`](../../whitelist/README.md).

- **Owner kept**: a frame of the owner's face or plate left unblurred. A miss only costs an unwanted blur.
- **Stranger leaked**: a frame of anyone else's face or plate not fully blurred. This is the privacy failure.

## Data

| Clip | Content | Video | Owner | Labelled by | Labelled objects |
| --- | --- | --- | --- | --- | --- |
| `plate-test1` | Dashcam, street traffic | 2560x1440, 50 fps, 1,665 frames (33 s) | One plate (`plateTest1.txt`) | Đạt | 1,668 stranger plate boxes (219 partly hidden), 894 owner plate boxes, 481 faces |
| `plate-test2` | Dashcam, following the owner's vehicle | 720x1280, 30 fps, 1,887 frames (63 s) | One plate (`plateTest2.txt`) | Đạt | 66 stranger plate boxes, 1,245 owner plate boxes, 420 faces |
| `face-test1` | Phone, one owner among others | 576x1024, 30 fps, 582 frames | Reference set `whitelist1` (5 photos) | teammate | 828 stranger faces, 347 owner faces |
| `face-test2a` | Phone | 576x1024, 30 fps, 1,194 frames | `whitelist2` | teammate | 1,494 stranger faces, 549 owner faces |
| `face-test2b` | Phone | 576x1024, 30 fps, 624 frames | `whitelist2` | teammate | 1,074 stranger faces, 699 owner faces |

The clips are public videos taken from social media, **not filmed by the team**; the team only labelled them. They, the
reference photos and the plate texts stay in the gitignored `engine/training/datasets/whitelist-videos/` (labels and Engine
outputs in its `bench/` folder), and the real plate numbers are left out of this repo on purpose (see
[docs/datasets.md](../../../../docs/datasets.md)). Not benchmarked: `plate-test3` and `plate-test4` became training frames for
the dashcam fine-tune, so they can't test it; `face-test3` was left out to save labelling time.

## How it was measured

1. **Pre-labels from the Engine.** Each clip ran through the Engine's own tracking pass (`VideoRedactProcessor._track_pass`,
   ByteTrack) and both whitelist passes in `max_privacy` mode, with the clip's owner plate or 5 reference photos. Every track
   went into CVAT (v2.83, run locally) as an editable track, with the Engine's decision ("kept sim=0.60", "blurred") shown
   on it.
2. **People corrected them.** Label every plate or face readable when zoomed in, box only the visible part, tick
   "occluded" when it is partly hidden, set `identity` to owner or stranger per track; skip what can't be read. Two people
   labelled (plates by one, faces by the other), so box style differs: the face boxes are drawn around the whole head and
   are 7-19% wider and taller than the Engine's (median), while the plate boxes match the Engine's (median ratio 1.00).
3. **Scoring.** For every labelled box on every frame: the share of it covered by what the Engine actually blurs (every
   non-owner track's detected, interpolated and 200 ms held boxes, grown by the 0.1 padding). **Fully blurred** = covered
   at least 90% (plates) or 70% (faces, because of the wider boxes; 70% is also the bar of the detection bench). Both bars
   for every clip are in `results.json`. Owner tracks only count in the allow-list numbers. **Leak** = a run of consecutive
   frames where one stranger is not fully blurred.
4. **Three detectors**, everything else identical: the current Maximum privacy model (`yolo26s` frozen x3) and two
   fine-tunes of it on partly covered plates (below). Thresholds face 0.06, plate 0.05, input 1280 px.

## The fine-tunes for partly hidden plates

The first labelled clip showed partly hidden plates missed most of the time, and a check of the plate training set found
none: 0 of 120 sampled plates were partly hidden (close-ups, about one plate per image). So two fine-tunes added covered
copies: each training plate covered by a patch cut from elsewhere in the same image, 80% as a band from one side covering
25-70% (label = the visible part, the same rule as the labelling), 20% as a bar across the middle (label = the whole plate).

| Run (`results/yolo26s-1280/…`) | Plate images per epoch | Recipe | Time | Val mAP50 |
| --- | --- | --- | --- | --- |
| `e5-plates-frozen-x3` (current, for reference) | plates x3 | from `e5-plates-frozen`, backbone frozen (11 layers), SGD lr0 0.001, 5 epochs | | 0.913 |
| `e5-plates-occ` | plates x2 + 1 covered copy (2/3 normal) | from frozen-x3, same recipe, Kaggle T4 x2 | 54 min | 0.915 |
| `e5-plates-occ-half` | each plate x3, half of the copies covered (two cover seeds) | same | 56 min | 0.914 |

On the 3,726-image detection benchmark, at the face precision of the journey in
[`../../results/README.md`](../../detection/results/README.md) (0.79):

| Model | Face AP | Face privacy | Faces >= 16 px | Plate privacy | Plate precision |
| --- | --- | --- | --- | --- | --- |
| Current (frozen x3) | 0.773 | 0.790 | 0.929 | 0.958 | **0.926** |
| occ | 0.774 | 0.792 | 0.929 | **0.980** | 0.891 |
| occ-half | **0.777** | **0.794** | **0.930** | **0.980** | 0.888 |

Faces don't suffer; plates are found more often (half as many missed) at the cost of more boxes on things that aren't plates.
Full tables: [`../../bench/comparison.md`](../../detection/bench/comparison.md).

## Results

### Allow list

Frames, per clip: owner frames left visible, and stranger frames (faces and plates) kept visible because they sat under a
box the Engine kept as the owner.

| Clip | Owner kept: current | occ | occ-half | Strangers kept as owner: current | occ | occ-half |
| --- | --- | --- | --- | --- | --- | --- |
| `plate-test1` | **86.0%** (769/894) | 80.8% | 72.1% | **2** of 2,149 | 6 | 5 |
| `plate-test2` | **87.9%** (1,094/1,245) | 87.5% | 80.4% | **0** of 486 | 2 | 2 |
| `face-test1` | 74.4% (258/347) | 74.4% | 74.4% | 0 of 828 | 0 | 0 |
| `face-test2a` | **71.2%** (391/549) | 69.4% | 70.9% | **0** of 1,494 | 2 | 3 |
| `face-test2b` | 75.5% (528/699) | **76.0%** | 75.7% | 0 of 1,074 | 0 | 0 |
| **All, current** | plates **87.1%** (1,863/2,139), faces **73.8%** (1,177/1,595) | | | **2 of 6,031** | 10 | 10 |

### Blurring strangers

Current model; the other two in the next table. Plates at the 90% bar, faces at 70%.

| Clip, group | Boxes | Fully blurred | Partly | Missed | Detected (IoU >= 0.5) | Leaks >= 200 ms | Longest leak |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plate-test1`, all plates | 1,668 | 56.9% | 20.3% | 22.8% | 45.4% | 19 | 880 ms |
| … fully visible | 1,449 | 63.8% | 18.3% | 17.9% | 52.2% | | |
| … partly hidden | 219 | **11.0%** | 33.3% | **55.7%** | **0.0%** | | |
| … < 40 px wide | 41 | 31.7% | 4.9% | 63.4% | 31.7% | | |
| … 40-80 px | 1,118 | 57.9% | 19.5% | 22.6% | 45.4% | | |
| … >= 80 px | 509 | 56.8% | 23.2% | 20.0% | 46.4% | | |
| `plate-test2`, all plates | 66 | 16.7% | 12.1% | 71.2% | 9.1% | 2 | 1,100 ms |
| `plate-test1`, faces | 481 | 99.2% | | 0.0% | | | |
| `plate-test2`, faces | 420 | 100.0% | | 0.0% | | | |
| `face-test1` | 828 | 90.1% | 8.0% | 1.9% | 89.3% | 6 | 600 ms |
| `face-test2a` | 1,494 | 80.8% | 14.2% | 5.0% | 77.2% | 16 | 1,033 ms |
| … < 40 px | 391 | 76.2% | 9.7% | 14.1% | 70.3% | | |
| `face-test2b` | 1,074 | 85.5% | 9.7% | 4.8% | 73.5% | 12 | 500 ms |
| … < 40 px | 521 | 76.6% | 15.7% | 7.7% | 53.4% | | |

`plate-test2` has only 66 stranger plate boxes, nearly all from two plates missed for 1.0 s and 0.6 s: too few for a rate.
Its owner and face numbers are solid.

### The three models side by side

| | Current | occ | occ-half |
| --- | --- | --- | --- |
| `plate-test1` plates fully blurred / missed | **56.9%** / 22.8% | 54.4% / 22.0% | 55.7% / **18.6%** |
| … fully visible missed | 17.9% | 16.8% | **13.5%** |
| … partly hidden missed | 55.7% | 56.2% | **52.5%** |
| … leaks >= 200 ms (all leak runs) | **19** (113) | 21 (143) | **19** (137) |
| `plate-test2` plates missed | **71.2%** | 75.8% | 72.7% |
| Faces fully blurred: `face-test1` / `2a` / `2b` | 90.1 / **80.8** / **85.5%** | 90.1 / 80.7 / 84.4% | **90.5** / 80.7 / 84.3% |
| Faces in the plate clips fully blurred | 99.2 / **100%** | 99.0 / 98.8% | **100** / 99.3% |
| Owner kept: plates / faces | **87.1%** / **73.8%** | 84.7% / 73.4% | 77.0% / 73.7% |
| Strangers kept as owner | **2** | 10 | 10 |

Partly hidden faces were not flagged in the face clips, so the face clips say nothing about them. The detection benchmark
does (WIDER val's occlusion tag, current model, hidden = >= 70% covered):

| WIDER face | All sizes | >= 16 px |
| --- | --- | --- |
| Not covered | 91.3% (23,428) | 97.7% (14,725) |
| Partly covered | 74.5% (7,097) | 92.1% (2,251) |
| Heavily covered | 61.5% (8,587) | 82.0% (2,983) |

## Two Engine fixes found by this benchmark

Running our own model frame by frame, with no tracking, found more faces than the Engine did (face-test2a: 93.0% detected
against 77.2%). The model was fine; the video path lost its detections in two places:

1. **A filter that dropped faces in one zone of every frame** (`_is_vehicle_cockpit_artifact`): any roughly square face box
   at x 50-75%, y 48-85% of the frame was discarded, to avoid blurring a motorbike spotlight in one kind of dashcam footage.
   On a phone clip real people stand there: 83 stranger-face frames of face-test2a were never blurred. **Removed.**
2. **Detections the tracker had not confirmed yet.** `model.track()` replaces the model's boxes with ByteTrack's confirmed
   tracks, so a new object's first frame, and any detection that did not join a track on the next frame, never reached the
   Engine. **The Engine now runs the model and ByteTrack separately** (same ByteTrack settings) and keeps every detection that
   reaches its class threshold; those without a track ID take the existing untracked path.

Current model, before and after (plates at the 90% bar, faces at 70%):

| | Before | After |
| --- | --- | --- |
| `plate-test1` plates fully blurred / missed | 56.9% / 22.8% | **70.4% / 10.6%** |
| … partly hidden plates missed | 55.7% | **30.6%** |
| … leaks >= 200 ms (longest) | 19 (880 ms) | **15 (800 ms)** |
| `plate-test2` plates fully blurred / missed | 16.7% / 71.2% | **50.0% / 31.8%** |
| `face-test1` faces fully blurred / missed | 90.1% / 1.9% | **92.1% / 0.0%** |
| `face-test2a` | 80.8% / 5.0% | **93.3% / 0.0%** |
| `face-test2b` | 85.5% / 4.8% | **94.6% / 0.4%** |
| Face leaks >= 200 ms: `1` / `2a` / `2b` | 6 / 16 / 12 | **5 / 4 / 4** |
| Owner kept: `plate-test1` / `plate-test2` | **86.0% / 87.9%** | 69.5% / 75.0% |
| Owner kept: `face-test1` / `2a` / `2b` | **74.4% / 71.2% / 75.5%** | 70.3% / 60.1% / 71.2% |
| Strangers kept as owner (all clips) | **2** | 5 (all in `plate-test1`) |

The owner cost comes from the recovered boxes: each is its own one-frame piece, which is never matched as the owner, so it
is blurred (the safe side). Attaching each piece to the track that confirms on the next frame should win most of it back.

## Open-source tools on the same clips

Two tools run frame by frame on the same frames, scored against the same labels, at their defaults and with the blur area each
ships with: **deface** 1.5.0 (CenterFace, faces only, MIT; threshold 0.2, blur box 1.3x = 15% each side) and **EgoBlur Gen2**
(Meta, Apache 2.0; separate face and licence plate models, resize 1200 as for an RGB camera; threshold 0.674, boxes not
grown). Neither has an allow list or tracking, so they blur the owner too; owner frames are left out of everyone's stranger
numbers as before. Both also at the 0.05 floor in `results.json` (`after_fixes_and_tools`). How to run them again: [../README.md](../README.md),
"Open-source tools on the same clips".

| Strangers (faces at 70%, plates at 90%) | Our Engine, after the fixes | deface | EgoBlur Gen2 |
| --- | --- | --- | --- |
| `face-test1` faces fully blurred / missed | **92.1% / 0.0%** | 90.5% / 2.8% | 68.1% / 7.9% |
| `face-test2a` | 93.3% / **0.0%** | **93.4%** / 1.5% | 72.4% / 8.0% |
| `face-test2b` | **94.6% / 0.4%** | 85.1% / 7.3% | 56.8% / 26.2% |
| Faces detected (IoU >= 0.5): `1` / `2a` / `2b` | **92.1** / 88.1 / **85.0%** | 87.9 / **89.4** / 79.8% | 87.4 / 83.9 / 70.1% |
| Longest face leak: `1` / `2a` / `2b` | **400 / 700 / 233 ms** | 433 / 600 / 500 ms | 1,267 / 1,333 / 833 ms |
| Faces in the dashcam clips fully blurred: `plate-test1` / `2` | **100 / 100%** | 80.9 / 98.8% | 51.1 / 95.5% |
| `plate-test1` plates fully blurred / missed | **70.4% / 10.6%** | (no plates) | 7.1% / 81.2% |
| … partly hidden plates missed | **30.6%** | | 90.0% |
| `plate-test2` plates fully blurred / missed | **50.0%** / 31.8% | | 30.3% / **30.3%** |

On the detection benchmark (3,726 images, [`../../bench/comparison.md`](../../detection/bench/comparison.md)), at the same face
precision (0.78; EgoBlur's lowest reachable is 0.82):

| | Face AP | Face privacy | Faces >= 16 px | Plate privacy | Plate precision |
| --- | --- | --- | --- | --- | --- |
| Our Maximum privacy model | **0.773** | **0.794** | **0.930** | 0.958 | **0.923** |
| deface (full resolution) | 0.649 | 0.663 | 0.909 | — | — |
| EgoBlur Gen2 | 0.534 | 0.572 | 0.835 | **1.000** | 0.624 |

- **Faces:** EgoBlur, trained on Meta's Aria glasses footage, misses small faces (45.7% of faces under 40 px in
  `face-test2b` missed at its default). deface is close to our Engine on the phone clips but has no plates. Both put many
  boxes on nothing labelled in `face-test2a` (deface 58%, our Engine 56% after the fixes, 30% before; unlabelled
  background faces count here too), and deface 94% in the dashcam clip `plate-test1`.
- **Plates:** EgoBlur's plate model finds every close-up plate of the benchmark, but on dashcam footage it misses 81% of the
  plates at its default threshold (17% at the 0.05 floor, still with only 31% fully covered because its boxes are not grown).
- **What we add beyond a detector:** tracking with interpolation and 200 ms holds, the allow list (faces and plates with
  OCR), and the service around it. A detector alone, even a better one, has none of these.

## What we learned

1. **The allow list does not leak.** With the current model, 2 stranger frames in 6,031 were kept because of it, both in
   `plate-test1`. It keeps the owner 87% of the time on plates and 71-76% on faces; when it fails, the
   owner is blurred, which is the safe side.
2. **Partly hidden plates are the weak spot.** 55.7% missed and none properly detected: the model has never seen one. Covered
   faces lose 15-30 points too, but stay far better (WIDER has thousands of them in training).
3. **Small and distant plates are the second weak spot.** Even fully visible plates are missed 17.9% of the time in
   `plate-test1`, mostly 35-65 px wide, in stretches of up to 0.9 s, on frames where the Engine had no box at all.
4. **Pasted covers don't teach real occlusion.** The covered-copy fine-tunes find more plates on the image benchmark (0.958 →
   0.980) but barely move partly hidden plates on video (55.7% → 52.5% missed), break plate tracks into more pieces (up to 16
   Engine tracks for one plate against 7) and so keep the owner less often (87% → 77% on plates), and let a few more strangers
   through as the owner (2 → 10 frames). Short track pieces are read and matched less reliably, which is where both losses
   come from.
5. **Faces are fine.** 81-90% fully blurred and 2-5% missed on the phone clips, ~100% in the dashcam clips; leaks are short
   gaps up to about 1 s. Faces under 40 px are missed most (7-14% in the phone clips).

6. **The video path, not the model, was losing detections.** A position filter and the tracker's hidden unconfirmed tracks
   together cost up to 16 points of detected faces; fixing both cut missed faces to 0-0.4% and missed plates by half
   (section above).
7. **Against open-source tools, our Engine is the only one that does both well.** deface matches it on close phone faces but
   has no plates; EgoBlur is weaker on faces and on dashcam plates.

**Picked (first round):** no model change; the two covered-plate fine-tunes stay as training records only. The two Engine
fixes above are in. **Second round:** the dashcam fine-tunes replace both modes' models (section above).

## Dashcam fine-tune and allow-list fixes (2026-11-20)

**Why.** The two weak spots above (partly hidden and small plates) come from the training data: the plate set and the image
benchmark are close-ups, one plate filling ~20 % of the photo, while dashcam plates are ~2 % of the frame. Pasted covers
(the fine-tunes above) did not stand in for real ones.

**Data** (details and terms: [docs/datasets.md](../../../../docs/datasets.md)). 468 frames labelled in CVAT, plates and faces,
pre-labelled by the Engine and corrected by hand: 250 BDD100K dashcam frames (US, 120 at night; chosen by visible vehicles, not
by our plate model) and 218 frames of `plate-test3` / `plate-test4` (Vietnamese traffic, many motorbikes; one every 0.5 s).
590 plates, median 3.2 % of the frame wide. A second version adds 384 Open Images gauge photos with empty labels (hard
negatives) against a false alarm the first one learned.

**Training.** From each mode's model, as the earlier fine-tunes: backbone frozen (`--freeze 11`), SGD lr0 0.001, 5 epochs,
the old data kept in (plates listed as often as the base model saw them) plus the dashcam frames x4 (and the gauges x2):
`--extra dashcam-plates:4 [--extra gauge-negatives:2]` in [`detection/train.py`](../../detection/train.py). Records:
`detection/results/yolo26{s,n}-1280/e5-dashcam{,-neg}/`. `last.pt` is used, not `best.pt`: `best.pt` is picked on the old
validation set, which has no dashcam frames, so for YOLO26s it was epoch 1.

**Image benchmark** ([detection/bench/comparison.md](../../detection/bench/comparison.md), section D: each class at its own
precision). Faces unchanged (privacy 0.766 → 0.767 Fast, 0.794 → 0.795 Max); the face allow list on LFW is unchanged too
(owner kept within 2 points for all six models, [`whitelist/face/results/by-detector/`](../../whitelist/face/results/by-detector)). Plate
privacy at plate precision 0.90 drops (0.984 → 0.970 Fast, 0.974 → 0.948 Max), but that set labels only the main plate of
each photo: of 24 random "false" plate boxes of the new model, ~18-20 were real plates on vehicles behind it.

**On these clips** (Engine as shipped: the dashcam models, widest-crop OCR and track split below; plates readable from
40 px wide, the line checked by eye on `plate-test1`):

| Model | test1: readable plates missed | test1: partly hidden missed | test1: owner kept | test1: strangers kept as owner | test2: readable plates missed | test2: owner kept | test2: strangers kept as owner | Boxes on the rider's speedometer (test1) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fast now (`yolo26n-1280-e20-crowd`) | 11.4% | 33.3% | 63.1% | 5 | 10.9% | 75.6% | 0 | 0 |
| Fast + dashcam (`yolo26n-1280-e5-dashcam`) **picked** | 5.3% | 21.5% | 68.9% | 9 | 9.4% | 83.8% | 2 | 269 |
| Fast + dashcam + gauge negatives | 4.7% | 21.5% | 64.9% | 8 | 9.4% | 52.9% | 0 | 148 |
| Max now (`yolo26s-1280-e5-plates-frozen-x3`) | 9.8% | 30.6% | 67.8% | 5 | 32.8% | 75.0% | 0 | 108 |
| Max + dashcam (`yolo26s-1280-e5-dashcam`) **picked** | 2.3% | 11.9% | 69.7% | 9 | 9.4% | 89.2% | 6 | 1,730 |
| Max + dashcam + gauge negatives | 2.4% | 12.3% | 70.4% | 8 | 9.4% | 82.4% | 2 | 1,736 |

"Strangers kept as owner" counts stranger plate frames not fully blurred (< 90 %) under a box kept as the owner: mostly
partly blurred plates while hidden, not readable leaks. Faces are unchanged by the new models (90-95 % fully blurred, 0-2 %
missed, owner kept within 2 points, no stranger kept as owner in any run).

- **Readable plates missed drop ~4x for Max (9.8 → 2.3 %, 32.8 → 9.4 %), ~2x for Fast; partly hidden 30.6 → 11.9 %.**
- **The cost: the rider's own speedometer.** Its white Honda logo, low in the frame, looks like the white "blank" plates labelled
  in BDD100K; the new models blur it in most frames (only cosmetic). The gauge photos (cars' dashboards, clocks) did not fix it
  for Max and halved it for Fast at a large loss of owner kept; real rider's-view frames would be needed.
- **Picked: the dashcam models without gauges for both modes.**

**Allow-list fixes in the Engine** (`engine/src/processors/video_redact.py`), each checked on all six models:

1. **OCR reads the widest crops of a plate track, not its first frames.** A track kept its first 5 crops for OCR: usually the
   plate coming into view, small or half hidden. Their garbage reading made a 755-frame track on the owner's plate a "stranger"
   that the inheritance step refused to allow-list. Now the 5 widest crops of the whole track (`PLATE_OCR_CANDIDATES`).
   `plate-test2` owner kept: 34 → 82 % and 38 → 84 % for the two models it hit, others unchanged. No minimum width: a 40 px floor
   (the readable-by-eye line) cost Fast 17 points, because OCR plus the fuzzy matcher still match 37 px plates.
2. **A track lost for longer than we fill in (167 ms) and found again becomes a new track.** ByteTrack keeps a lost id ~2 s
   and can hand it to another plate: one id was on a stranger's car, lost for 1.2 s, then on the owner's plate. With fix 1
   the owner's (wider) crops decided for the whole id, and the car's plate dropped to ~30 % blurred for 0.15 s. Each piece is
   now decided on its own; no distance rule (a person walking behind others for a second comes back elsewhere). The gap stays
   in the ended piece's `gapRanges`, so the web app's review warning is unchanged; tracks go up by up to ~6 %.
   Strangers kept as owner back to 9 from 18; faces lose ~1 point of owner kept (a short piece must match on its own).

Tried and dropped: not blurring plates under 40 px (cost 1-6 points of readable plates missed, mostly partly visible ones);
skipping a box inside an allow-listed box (it only trusts the allow list more: where that is wrong, a stranger shows).

**Face allow-list threshold** stays 0.45 (`DEFAULT_FACE_SIMILARITY`): on LFW a stranger reaches it in ~3 of 1,000,000
comparisons. A size-aware threshold would keep more owners (at 40 px: 35 % → 73 % at a 1-in-10,000 leak) but needs a
leak target per video and checking on side views first.

## Pitfalls hit while labelling (for the next round)

- **Load clips into CVAT as frames, not as the video.** CVAT seeks inside B-frame H.264 inexactly: after a reload the same
  frame number showed a different picture. Extracting the frames with ffmpeg (`-fps_mode passthrough`) and making an image
  task fixed it. The labels made before were checked against the Engine's frame-exact boxes and lined up best at offset 0.
- **CVAT interpolates in straight lines.** With a keyframe every 10 frames the boxes float off a plate that bounces or turns.
  Of the 3,159 boxes in `plate-test1`, 1,282 were placed by hand and 1,877 filled in by CVAT; some of the "partly blurred"
  share is labels drifting, not leaks. Keyframes every 2-3 frames where things move fast, or snap the in-between boxes to the
  Engine's detections.
- **Every piece of the owner needs `identity = owner`.** One missed piece turns the Engine's correct decision into a counted
  leak; most of the first results' "leaks" were that. Merging the pieces is optional.
- **Agree on the box style first.** Head boxes against face boxes changed "fully blurred" at the 90% bar by 20-40 points.

## Open

- Win back the owner frames lost by the second fix: attach each recovered one-frame box to the track that confirms on the
  next frame, so it inherits the owner decision.
- ~~Real labelled dashcam plates to train on~~: done (dashcam fine-tune). Next: rider's-view frames with the speedometer in
  view, as negatives, against the logo false alarm.
- One plate split over many tracks (`plate-test2`: 15+ for the owner's plate): link the pieces and decide once from all their
  readings, instead of the inheritance heuristic. Bigger change; to agree with the allow-list owner.
- Fast + dashcam + gauges keeps the owner only 53 % on `plate-test2`; not looked into (that model was not picked).
- Keeping a plate's blur attached to its vehicle when the plate drops out (a vehicle detector and tracking change in the
  Engine), for the 0.5-1 s gaps.
- Looking for plates inside vehicle crops at higher resolution, or tiling, for plates under 60 px.
- More clips: 2 plate and 3 face clips, each labelled by one person, set the direction; the exact percentages could move a
  few points.
