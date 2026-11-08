"""Plate OCR accuracy for RapidOCR, on two Vietnamese plate sets.

Sets:
- ``trungdinh-val``: the validation split of the character dataset from ``fetch.sh``. Each character is a YOLO box
  with a class, so the plate text is rebuilt by grouping boxes into lines, then reading left to right. The class
  numbers don't follow the repo's YAML; ``char_map.json`` holds the real mapping (see README). Only plates in
  Vietnamese format are kept, because the set also has Croatian and Czech plates. The format is used to choose
  plates, never to correct a reading.
- ``uet-handread``: 80 plates from the benchmark's UET set (``infra/bench/dataset``), cropped by their labelled box,
  with the text read by eye (``uet-plates-text.json``).

Both sets test reading only: crops come from labelled boxes, not from the detector.

Usage, from the repo root, after ``engine/training/ocr/fetch.sh`` and ``infra/bench/dataset/fetch.sh --set max``:
    python engine/training/ocr/eval_ocr.py
Needs ``rapidocr-onnxruntime`` and ``opencv-python``.
"""

import json
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "engine"))
from src.processors.plate_ocr import normalize_plate_text  # noqa: E402  (the Engine's own normalisation)

DATA = REPO / "engine/training/datasets/vn-plate-ocr/OCR"
UET_IMAGES = REPO / "infra/bench/dataset/images-max"
VN_FORMAT = re.compile(r"^\d{2}[A-Z][A-Z0-9]?\d{4,5}$")
STRETCH = 1.3  # widening the crop stops the recogniser merging repeated digits (43A-444.44 read as 43A444)

CLASS_TO_CHAR = {int(k): v for k, v in json.loads((HERE / "char_map.json").read_text()).items()}


def text_from_label(label_path: Path):
    """Rebuild plate text from per-character boxes: group into lines by vertical centre, then sort by x."""
    boxes = []
    for line in label_path.read_text().split("\n"):
        parts = line.split()
        if len(parts) == 5:
            boxes.append((int(parts[0]), float(parts[1]), float(parts[2]), float(parts[4])))
    if not boxes:
        return None, 0
    boxes.sort(key=lambda b: b[2])
    lines, current = [], [boxes[0]]
    for box in boxes[1:]:
        # A centre more than half a character lower starts the second line of a two-line plate.
        if box[2] - current[-1][2] > 0.5 * max(box[3], current[-1][3]):
            lines.append(current)
            current = [box]
        else:
            current.append(box)
    lines.append(current)
    text = "".join(CLASS_TO_CHAR[c] for line in lines for c, *_ in sorted(line, key=lambda b: b[1]))
    return text, len(lines)


def load_sets():
    """Return {set name: [(crop BGR, text, line count)]}."""
    sets = {"trungdinh-val": [], "uet-handread": []}
    for label in sorted((DATA / "labels/val").glob("*.txt")):
        text, n_lines = text_from_label(label)
        if text and VN_FORMAT.match(text):
            crop = cv2.imread(str(DATA / "images/val" / f"{label.stem}.jpg"))
            if crop is not None:
                sets["trungdinh-val"].append((crop, text, n_lines))
    for item in json.loads((HERE / "uet-plates-text.json").read_text()):
        image = cv2.imread(str(UET_IMAGES / Path(item["image"]).name))
        x1, y1, x2, y2 = map(int, item["box"])
        crop = image[max(0, y1 - 4) : y2 + 4, max(0, x1 - 4) : x2 + 4]
        n_lines = 2 if crop.shape[0] / crop.shape[1] >= 0.5 else 1  # for reporting only
        sets["uet-handread"].append((crop, item["text"], n_lines))
    return sets


def build_readers():
    from rapidocr_onnxruntime import RapidOCR

    rapid = RapidOCR()

    def recognise(img):
        """Recognition only: the plate is already cropped, and RapidOCR's text detector splits one line into
        overlapping boxes that repeat characters."""
        result, _ = rapid(img, use_det=False, use_cls=False, use_rec=True)
        text, score = (result or [["", 0.0]])[0]
        return text, float(score)

    def widen(img, factor):
        return cv2.resize(img, (int(img.shape[1] * factor), img.shape[0]), interpolation=cv2.INTER_CUBIC)

    def whole_or_split(img, factor=1.0):
        """The recogniser reads one line. Read the crop whole and split into halves, and keep whichever the
        recogniser scores higher, so tilted one-line plates aren't mistaken for two-line ones."""
        prep = (lambda im: widen(im, factor)) if factor != 1.0 else (lambda im: im)
        h = img.shape[0]
        whole, whole_score = recognise(prep(img))
        (top, top_score), (bottom, bottom_score) = recognise(prep(img[: h // 2])), recognise(prep(img[h // 2 :]))
        return whole if whole_score >= (top_score + bottom_score) / 2 else top + bottom

    def full_pipeline(img):
        result, _ = rapid(img)
        items = sorted(
            result or [], key=lambda it: (round(np.mean([p[1] for p in it[0]]) / 25), np.mean([p[0] for p in it[0]]))
        )
        return "".join(text for _, text, _ in items)

    return {
        "RapidOCR, full pipeline": full_pipeline,
        "Recognition only, whole crop": lambda img: recognise(img)[0],
        "Recognition only, whole or split": whole_or_split,
        f"Recognition only, whole or split, widened {STRETCH}x": lambda img: whole_or_split(img, STRETCH),
    }


def char_error_rate(got: str, want: str) -> float:
    prev = list(range(len(want) + 1))
    for i, a in enumerate(got, 1):
        cur = [i]
        for j, b in enumerate(want, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a != b)))
        prev = cur
    return prev[-1] / max(1, len(want))


def main():
    sets, readers = load_sets(), build_readers()
    results = {}
    for set_name, items in sets.items():
        results[set_name] = {"plates": len(items), "two_line": sum(n == 2 for *_, n in items), "methods": {}}
        for method, read in readers.items():
            scored, times = [], []
            for crop, text, n_lines in items:
                start = time.time()
                got = normalize_plate_text(read(crop))
                times.append(time.time() - start)
                scored.append((got == text, char_error_rate(got, text), n_lines))
            one = [s[0] for s in scored if s[2] == 1]
            two = [s[0] for s in scored if s[2] == 2]
            results[set_name]["methods"][method] = {
                "exact": round(float(np.mean([s[0] for s in scored])), 4),
                "exact_one_line": round(float(np.mean(one)), 4) if one else None,
                "exact_two_line": round(float(np.mean(two)), 4) if two else None,
                "char_error_rate": round(float(np.mean([s[1] for s in scored])), 4),
                "median_seconds": round(float(np.median(times)), 4),
            }
    (HERE / "results/results.json").write_text(json.dumps(results, indent=1) + "\n")
    for set_name, r in results.items():
        print(f"\n{set_name}: {r['plates']} plates ({r['two_line']} two-line)")
        for method, m in r["methods"].items():
            pct = lambda v: "-" if v is None else f"{v:.1%}"  # noqa: E731
            print(
                f"  {method:52s} exact {pct(m['exact']):>6}  one-line {pct(m['exact_one_line']):>6}  "
                f"two-line {pct(m['exact_two_line']):>6}  char err {m['char_error_rate']:.2%}  {m['median_seconds']:.3f}s"
            )


if __name__ == "__main__":
    main()
