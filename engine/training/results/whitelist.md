# Whitelist accuracy: from the first benchmark to YuNet alignment

The whitelist keeps a user's own faces and plates unblurred and blurs everyone else's. Two numbers matter, and they pull in
opposite directions:

- **Owner kept** (true accept): the owner's face or plate stays unblurred. A miss only costs an unwanted blur.
- **Stranger leaked** (false accept): someone else's face or plate stays unblurred. This is the privacy failure, so the
  design is fail-closed ("when in doubt, blur") and this number is the one to keep near zero.

What each benchmark runs, the datasets and their terms: [../whitelist-benchmarks.md](../whitelist-benchmarks.md) and
[../../../docs/datasets.md](../../../docs/datasets.md). Scripts and raw results sit next to the code they test
(`engine/training/ocr/`, `engine/training/face/`, `engine/training/accuracy/size_thresholds.py`).

## Plates (done, in the Engine)

Test: the 616 Vietnamese plates of `eval_ocr.py` (one-line and two-line mixed). Every plate is its own owner and every other
plate is a stranger. Run: `engine/training/ocr/eval_whitelist_rules.py` (each matcher rule alone, leave-one-out, edit-distance caps).

| Matcher | Owner kept | Plates matched by some other plate | Stranger leaked, 20-plate whitelist |
| --- | --- | --- | --- |
| Exact string only | 90.1% | 0.3% | 0.012% |
| All five rules (the Engine until 2026-11-12) | 97.7% | **46.1%** | **3.0%** |
| Without the fuzzy rule alone | 95.6% | 1.8% | 0.082% |
| All rules, edit distance <= 2 | 97.7% | 7.1% | 0.30% |
| All rules, edit distance <= 1 | 97.4% | 1.5% | 0.053% |
| **Engine now** (distance <= 1, `province_tail` removed) | **97.4%** | **1.0%** | **0.036%** |

- The leak came from the fuzzy rule allowing 2-3 edits on short plates: almost half of all plates matched some other plate.
  One edit still covers a single OCR misread. `province_tail` ("29D163516" against "29Y23516") was a second lenient fuzzy
  rule and was removed on the team's call.
- Remaining leaks are one-character twins (two plates that differ by one character); no fuzzy rule can tell those apart.
- Only OCR text is compared. The plate crops in this data are close-ups, so this says nothing about finding plates in street scenes.

## Faces (LFW, 600 owners)

Test: Labeled Faces in the Wild, labels = the folder name. 600 owners with >= 4 photos (1 or 3 enrol, the 4th tests), 600
stranger-only people, 3,000 photos, a face found in all of them. Faces are cropped by the Engine's own YOLO26n and embedded by
its `w600k_mbf.onnx`; the score is cosine similarity at the Engine's default threshold **0.45**. "Width" shrinks the crop and
JPEG-compresses it (quality 35) to imitate small faces in video. Run: `engine/training/face/eval_face_whitelist.py`.
Cells below: owner kept / stranger leaked (1-person whitelist).

| Step | Clean | 64 px | 40 px | 24 px | Verdict |
| --- | --- | --- | --- | --- | --- |
| 0. Raw YOLO box squashed to 112x112 (the Engine until 2026-11-13), 1 photo | 39% / 0.005% | 24% / 0.003% | 15% / 0.003% | 9% / 0.007% | very safe, rarely keeps the owner |
| 0b. Same, 3 photos per person | 64% / 0.016% | 51% / 0.010% | 38% / 0.009% | 26% / 0.022% | the Engine already scores a face by its best reference photo |
| 1. Lower the threshold to 0.40 / 0.35 (raw box, 1 photo) | 52% / 0.021%, 64% / 0.096% | | | | trades safety for a modest gain |
| 2. Grow the box by 15% / 30% | 60% / 0.015%, 68% / 0.20% | | 25% / 0.016% | | 15% helps, 30% leaks 40x more |
| 3. Same, but paint the margin flat grey | 57% / 0.048%, 71% / 0.92% | | | | leaks rose: hair and background are not the cause |
| 4. **Align with landmarks**, whole photo (upper bound, `--align`) | 87% / 0.000% | 53% / 0.000% | 21% / 0.000% | 6% / 0.002% | the missing piece |
| 4b. Same, 3 photos | 96% / 0.000% | 78% / 0.000% | 44% / 0.000% | 18% / 0.004% | |
| 5. **In the Engine (Task 137)**: YuNet on the padded YOLO crop, then align | **83% / 0.000%** | **64% / 0.000%** | **31% / 0.000%** | 6% / 0.003% | shipped |
| 5b. Same, 3 photos | **95% / 0.000%** | **86% / 0.000%** | **58% / 0.000%** | 17% / 0.010% | |

- **Why alignment:** the embedding model was trained on faces rotated and scaled so eyes, nose and mouth corners sit at
  fixed spots in a 112x112 image. The Engine resized the raw detector box instead (also tighter than the training crop). The
  preprocessing (RGB, (pixel - 127.5) / 127.5) was checked and is correct. Median owner similarity went from 0.40 to 0.58 (whole-photo alignment).
- **How:** the YOLO box is padded by 50% (the aligner needs room; YuNet works better with some context and the warp needs pixels
  outside the box), YuNet (OpenCV, MIT, 232 KB) finds five landmarks, an affine warp puts them on the ArcFace template. If YuNet
  finds nothing the old resize is used, which is why the table is identical below 20 px. YOLO stays the face detector.
  Cost measured on a 16-core laptop CPU: 0.8 ms per 112 px region, 2.6 ms per 250 px region, 4 ms to load, 232 KB of storage.
- **Small faces are still the weak spot.** Under about 32 px alignment stops helping (`face/eval_align_cutoff.py`): aligned
  wins from 40 px up, ties at 32 px, and at 24-28 px it keeps 3-9 points fewer owners but leaks 3-5x fewer strangers; at 20 px and
  below YuNet finds no face and both paths are identical. A "skip alignment below N px" rule would add a few owner points and
  several times the leaks, so it was not added.
- **Detector comparison** (asked as "why not just YuNet"): on the 3,726-image benchmark at equal face precision 0.80, YuNet hides
  65.8% of faces (45.4% of tiny ones), YOLO26n 76.0% (60.1%), YOLO26s 78.6% (63.9%). YOLO stays for "where is the face"; YuNet only
  supplies landmarks. Run: `engine/training/bench_yunet.py`; YuNet has no plate class, so its plate rows are zero.

### Thresholds that depend on face size

**Similarity threshold (whitelist): size-dependent looks worth it.** The threshold that gives a 0.01% stranger leak rises as faces
shrink (Engine path, LFW strangers; owner kept at that threshold in brackets):

| Crop width | 1 photo | 3 photos |
| --- | --- | --- |
| Clean | 0.30 (97%) | 0.32 (99%) |
| 64 px | 0.31 (94%) | 0.33 (98%) |
| 40 px | 0.32 (72%) | 0.35 (86%) |
| 24 px | 0.42 (9%) | 0.45 (16%) |

So from 40 px up, 0.40 is about 0.05-0.10 above what a 0.01% leak needs on LFW (a safety margin for faces unlike LFW's),
while at 24 px even 0.45 sits at the edge. This is **not implemented**. A candidate: 0.40 from 40 px up, 0.45-0.50 for 24-40 px,
review instead of guessing below that. The web form has a manual "Face similarity threshold" under Advanced thresholds and the
Engine default is 0.45 (`image_redact.py`, `video_redact.py`), so an automatic size schedule would be a contract change (default
"auto", an explicit value still overrides). It needs the real-footage check below before it is adopted.

**Detection confidence (finding faces): size-dependent is not worth it.** Measured on the benchmark with
`accuracy/size_thresholds.py` (YOLO26n, Fast mode today = 0.17):

| Threshold set | True positives | False positives | Tiny / small / medium / large recall |
| --- | --- | --- | --- |
| One global 0.17 | 28,499 | 7,727 | 0.550 / 0.862 / 0.935 / 0.965 |
| Tiny lower only (0.10, rest 0.17) | 29,389 | 13,346 | 0.597 / 0.862 / 0.935 / 0.965 |
| Bigger faces higher (medium 0.30, large 0.40) | 28,333 | 7,250 | 0.550 / 0.862 / 0.918 / 0.946 |
| Both (0.10 / 0.15 / 0.25 / 0.35) | 29,351 | 13,335 | 0.597 / 0.869 / 0.925 / 0.949 |

Lowering the threshold for tiny faces finds 890 more faces for 5,600 more extra boxes (tiny recall 0.55 to 0.60); raising it
for big faces removes only 477 false positives (6%) and loses 1.7-1.9 points of recall on exactly the faces that are easy to
find. About two thirds of all false positives are tiny boxes, and WIDER leaves many tiny blurred faces unlabelled, so some of
those "false positives" are real faces. The Max-privacy mode already is the "lower threshold everywhere" version, so the
per-mode, per-class thresholds stay as they are.

## How to re-run

```bash
engine/training/face/fetch.sh                                   # LFW (local only, SHA-256 checked)
MODELS_DIR=engine/models engine/.venv/bin/python engine/training/face/eval_face_whitelist.py          # Engine path
MODELS_DIR=engine/models engine/.venv/bin/python engine/training/face/eval_face_whitelist.py --align  # upper bound
MODELS_DIR=engine/models engine/.venv/bin/python engine/training/face/eval_align_cutoff.py
engine/.venv/bin/python engine/training/ocr/eval_whitelist.py                                         # plates
engine/.venv/bin/python engine/training/accuracy/size_thresholds.py yolo26n-1280-e20-crowd@1280
```

`face_whitelist_raw_box.json` is the run before alignment; `face_whitelist_masked.json` the margin-painting test.

## What these numbers do not show

- **LFW is easy and narrow:** frontal press photos, mostly Western adults. Face-recognition false-match rates are known to differ
  between groups, so 0.000% leaks on LFW strangers does not carry over to Vietnamese faces; this is untested.
- **Compression is a stand-in:** shrinking and JPEG quality 35 is not H.264 video, motion blur or side views.
- **Sample size:** 600 owner tests per row (about +-4 points); leak rates come from ~1.8 M photo-vs-owner pairs that reuse 3,000
  photos, so they are indicative, not precise.
- **Labels:** LFW's identity labels have a few errors. The highest stranger score in the first aligned run was 0.92, almost
  certainly one person under two names or a duplicate photo; not inspected.
- **No real-face unit test** in `engine/tests/test_face_alignment.py` (three behaviour tests only); the benchmark is the check.
- Plates and faces were scored on photos, not on video; there is still no labelled video benchmark.

## Possible next steps

1. **Real footage first.** Run one of the flagged videos with a reference photo and read each track's similarity in the report:
   does the whitelist work now? If not, find out why (compression, tiny faces, frame choice) with real data. Teammates' clips with
   consent and a ground-truth CSV, per [../whitelist-benchmarks.md](../whitelist-benchmarks.md).
2. **Check Vietnamese faces**, since LFW cannot answer it: the same owner-kept / stranger-leaked test on teammates' footage.
3. **Decide the similarity threshold** (0.45 today; 0.40 keeps 91% clean / 79% at 64 px / 49% at 40 px with 1 photo, 98 / 93 / 76% with
   3 photos, at ~0.00% leak on LFW) and whether to add the size schedule above as an "auto" default.
4. **Several frames per video track:** average the embeddings of the 3-5 sharpest, largest frames instead of one best frame.
   Untested; needs video.
5. **Flip averaging:** embed the face and its mirror and average. Cheap, usually a small gain, doubles embedding time. Untested.
6. **Tiny faces:** under about 32 px send the face to review (or tell the user the whitelist needs larger faces) instead of guessing.
7. **Web UI guidance:** recommend 3 reference photos per person (front and both sides, up to the 5-file limit); the Engine already
   takes the best score over all of a person's photos.
8. **Bigger embedding model** (ResNet-50 instead of MobileFaceNet): more accurate, heavier. I recall InsightFace's pretrained models
   being for non-commercial research use only; not verified, and the licence of `w600k_mbf.onnx` belongs in `docs/datasets.md` either way.
9. **Plates on dashcam footage:** OCR on real street scenes and the matcher with real repeated captures, once footage exists.
10. **Redaction effectiveness:** after blur, does a face still match its original, is a plate still readable? Needs no new data.
