# Whitelist and video benchmarks: what we measure, with which data

What "keep the owner, blur everyone else" costs us, in numbers. Datasets and their terms: [docs/datasets.md](../../docs/datasets.md). What was tried, the results so far and the next steps: [results/whitelist.md](results/whitelist.md).
**Owner kept** = the owner's face or plate stays unblurred (true accept). **Stranger leaked** = someone else's stays
unblurred (false accept, the privacy leak; "when in doubt, blur" means we accept a lower owner-kept to keep this near zero).

| What | Metrics | Data | Status |
| --- | --- | --- | --- |
| **Plate whitelist, matcher + OCR** | Owner kept; stranger leaked for a whitelist of 1, 5, 20 plates; plates the matcher accepts as another plate | 616 Vietnamese plate crops, one- and two-line (`ocr/eval_whitelist.py`, `ocr/eval_whitelist_rules.py`) | **Done.** Matcher cut to edit distance 1 and `province_tail` removed: owner kept 97.4%, stranger leaked 0.036% (20-plate whitelist) |
| **Face whitelist** | Owner kept and stranger leaked per threshold (0.30–0.60), for a whitelist of 1 and 5 people; same at 64, 40, 24 px face width with JPEG; with 1 or 3 reference photos per person; with the face box grown by 0, 15, 30% | LFW: 600 owners sampled from the 610 LFW people with >= 4 photos (1 or 3 enrol, the 4th tests) and 600 stranger-only people (`face/eval_face_whitelist.py`) | **Done** (`face/results/face_whitelist.json`, 600 owner tests per row, so about +-4 points). Today (raw box, 1 photo, 0.45): owner kept 39% clean / 15% at 40 px, stranger leaked 0.005%. Box +15%: 60% / 25% at 0.015%. 3 photos: 64% / 38% at 0.016%. Both: 85% / 49% at 0.047% (0.23% on a 5-person whitelist). Box +30% leaks too much (0.2% at 0.45); painting the margin flat grey (`--mask-outside-box`) made leaks worse, so hair and background are not the cause. Median owner similarity 0.40 raw box -> 0.57 with 3 photos and +15%. **Through the Engine after Task 137 (YuNet alignment inside `FaceEmbedder`, 0.45): 1 photo 83% clean / 64% at 64 px / 31% at 40 px, 3 photos 95% / 86% / 58%, all with 0.000% leak down to 40 px; below 32 px alignment stops helping: at 24 px it keeps fewer owners than the raw box (6% vs 9%, 17% vs 26% with 3 photos) but leaks 2-5x fewer strangers, and at 20 px and below YuNet finds nothing so the two are identical; a minimum-size rule was considered and not added (it would trade a few owner points for 4-5x more leaks)** (`face/results/face_whitelist.json`; the pre-alignment run is `face_whitelist_raw_box.json`). Full-image alignment, an upper bound only (`--align`): 87% clean / 21% at 40 px with 1 photo, 96% / 44% with 3, at 0.45 and about 0.000% leak** (`face/results/face_whitelist_aligned.json`). So the raw-box crop is what costs the owners. Re-run after any change to crops, embedder or threshold |
| **Face whitelist on our camera** | Same, per track | Teammates' clips and enrolment photos, with consent | Waiting for footage |
| **Plate detection and redaction on scenes** | Plate recall and precision; OCR exact match and per-character accuracy; owner kept and stranger leaked; plates still readable after redaction | Dashcam clips, about 150 sampled frames; the model pre-draws boxes, a person corrects them and types the text | Waiting for footage |
| **Video** | Per track: owner kept, stranger leaked; share of an owner's visible time left unblurred; share of a stranger's visible time left unblurred; strangers wrongly inheriting a whitelisted plate track; share of tracks flagged for review, by reason; tracking gaps over 167 ms | The same clips plus one CSV per clip (who or which plate is on screen, from second to second) | Waiting for footage. Scoring script can be written before it arrives |
| **Redaction effectiveness** | After blur, how often a face still matches its original; how often a plate is still readable | Images we already have | Not started, needs no new data |
| Throughput | Frames per second, CPU | Existing `tests/benchmark_video_cpu.py`, `infra/bench` | Exists |

## Rules for the numbers
- **Sample size decides what we can claim.** Zero leaks in n strangers only shows the leak rate is below about 3/n
  (3% for 100, 0.3% for 1,000). Report n next to every rate.
- **Footage:** transfer the original files by cable or Drive, never through Zalo or Messenger (they re-compress
  video). Film at 1080p, in daylight and at night, with the owner at 2, 5 and 10 m.
- **Teammates in footage:** written consent, and blur their faces before any frame leaves the team.
- **Plates are tested without scenes first** (the matcher only sees one read and one whitelist entry), so repeated captures of the
  same plate are not needed for the matcher test, only for the scene test.
