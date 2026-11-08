# OCR results: from no OCR to RapidOCR recognition-only

How the Engine should read plate text for `whitelist.plates`, one step at a time. `results.json` holds the numbers from
the last full run of [`../eval_ocr.py`](../eval_ocr.py); how to run it: [../README.md](../README.md). The task for the
Engine: [`engine/docs/plan.md`](../../../docs/plan.md), "OCR biển số chạy thật".

## Datasets

| Name | Count | Source | Used for |
| --- | --- | --- | --- |
| `uet-handread` | 80 plates (16 two-line) | UET plate set of the benchmark (`infra/bench/dataset`, `Dataset/Test`), text read by eye in [`../uet-plates-text.json`](../uet-plates-text.json). Two samples of 40, evenly spaced and not overlapping | Steps 1–5. Mostly car plates |
| `trungdinh-val` | 536 plates (440 two-line), of the 767 in the split | Validation split of the Character Detection Dataset ([trungdinh22/License-Plate-Recognition](https://github.com/trungdinh22/License-Plate-Recognition)), text rebuilt from per-character labels, Vietnamese-format plates only | Steps 4–5. Mostly motorbike plates |
| `trungdinh-train` | 1,335 plates used, of 3,066 | Train split of the same dataset | Only to learn the class mapping in [`../char_map.json`](../char_map.json); never scored |

Every test crops plates by their labelled box, so it measures reading, not plate detection. Exact = every character
right after the Engine's `normalize_plate_text`. Times are medians per plate on CPU (`onnxruntime`), on one laptop.

## Journey

| Step | What changed | Test | Result |
| --- | --- | --- | --- |
| 0. Engine as shipped | `plate_ocr.py` tries PaddleOCR → EasyOCR → Tesseract; none is in `requirements.txt` | Code check | **0%**: the fallback always returns empty text, so no plate ever matches |
| 1. Pick one library | RapidOCR full pipeline (text detector + recogniser) vs EasyOCR, raw crop and with the Engine's `preprocess_plate` | `uet-handread`, first 40 | RapidOCR **21/40**, EasyOCR 8/40 (9/40 preprocessed); preprocessing made RapidOCR slightly worse |
| 2. Recognition only | Skip RapidOCR's text detector; read the crop whole | same 40 | 28/40: one-line plates right, two-line plates fail |
|  | Also read the crop cut in half when it's tall (crop shape) | same 40 | 36/40: a tilted one-line plate was cut by mistake |
|  | Read whole and cut in half, keep the more confident reading | same 40 | **37/40**, at 0.06 s per read vs 0.80 s for the full pipeline |
| 3. Widen the crop | Stretch horizontally before reading: 1.0× / 1.3× / 1.6× / 2.0×, and 8 px padding | same 40 | 37, **40**, 39, 39 of 40; padding 29 of 40 |
|  | Check 1.0× / 1.3× / 1.6× on plates not used to pick it | `uet-handread`, other 40 | 37, **40**, 39 of 40 |
| 4. Larger, independent set | All methods so far, on a second dataset | `trungdinh-val` (536) and all of `uet-handread` (80) | Full pipeline 65.9% / 53.8%; whole crop 17.5% / 75.0%; whole or half 88.1% / 92.5%; **plus 1.3×: 88.6% / 100%** |
| 5. Cut at the line gap | Cut at the row with the least ink (30–70% of the height) instead of half height; also: best of whole, half and gap | same as step 4 | Gap: two-line 81.8% / 93.8% (worse). Best of three: +1 plate in 536, ~70% slower |

Step 4 in detail (`results.json`):

| Method | `trungdinh-val` | One-line (96) | Two-line (440) | `uet-handread` | Time per plate |
| --- | ---: | ---: | ---: | ---: | ---: |
| RapidOCR full pipeline | 65.9% | 5.2% | 79.1% | 53.8% | 0.40–0.76 s |
| Recognition only, whole crop | 17.5% | 97.9% | 0.0% | 75.0% | 0.02 s |
| Recognition only, whole or half | 88.1% | 97.9% | 85.9% | 92.5% | 0.06 s |
| **Recognition only, whole or half, widened 1.3×** | **88.6%** | **97.9%** | **86.6%** | **100%** | **0.07 s** |

What each step taught us:

0. The plate allow list was marked done but never ran: an empty reading matches nothing, so plates stay blurred.
1. RapidOCR reads plates much better out of the box. Its errors are repeated characters (`22A072661` for 22A-072.61),
   EasyOCR's are letter-digit swaps (`B` for 3, `G` for 9).
2. The repeats come from RapidOCR's text detector splitting one line into overlapping pieces. The plate is already
   cropped, so the recogniser alone is enough, but it reads one line, so two-line plates need a cut. Choosing by the
   recogniser's own score avoids guessing from the crop's shape.
3. Repeated digits close together merge when the crop is squeezed to the recogniser's input height (`43A-444.44` read as
   `43A444`). 1.3× fixes it; more starts misreading other characters (`71A` as `Z1A`), and padding hurts.
4. The method holds on a second dataset. One-line plates are nearly solved (97.9%); two-line motorbike plates are the
   weak spot (86.6%). About a quarter of those misses are label errors (`59-T1 221.89` labelled `59T12219`); the rest
   are mostly letter-digit swaps in the top line (B/8, D/0, Z/2, S/6, L/4).
5. The crops are tight, so the gap is near the middle anyway, and the remaining misses are misread characters, not bad
   cuts.

**Picked:** RapidOCR (`rapidocr-onnxruntime`, PP-OCRv4), recognition only on the raw crop, read whole and cut in half
and keep the more confident reading, widened 1.3×. No correction based on the Vietnamese plate format.

**Not reported:** EasyOCR with an allowed-character list scored about 1% in step 4, which points at how this script
called it, not at EasyOCR.

Open: fine-tuning the recogniser on `trungdinh-train` (3,066 plates), the likely fix for the letter-digit swaps.
