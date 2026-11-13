"""Per crop width: owner kept / stranger leaked with YuNet alignment vs plain resize, to see where alignment stops helping.

Embeds every photo twice (``FaceEmbedder`` with its alignment model, and with a missing one so it falls back to resize) at
crop widths 64 down to 16 px, 1 and 3 enrolment photos, and prints both side by side at thresholds 0.40 and 0.45.
Result (summarised in results/whitelist.md): alignment wins from 40 px up, ties at 32, and below 28 px it keeps fewer owners
but leaks fewer strangers; at 20 px and below YuNet finds no face, so both are identical.

    MODELS_DIR=engine/models engine/.venv/bin/python engine/training/face/eval_align_cutoff.py
Writes results/align_cutoff.json.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.argv = ["x"]
spec = importlib.util.spec_from_file_location("ev", HERE / "eval_face_whitelist.py")
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)

WIDTHS = (64, 48, 40, 32, 28, 24, 20, 16)
THRESHOLDS = (0.40, 0.45)
EMBEDDERS = {"aligned": "yunet.onnx", "plain": "no-such-file.onnx"}  # a missing model makes the embedder resize


def main():
    ev.FACE_WIDTHS = WIDTHS
    ev.MARGINS = (0.0,)
    people = {d.name: sorted(d.glob("*.jpg")) for d in ev.LFW.iterdir() if d.is_dir()}
    owners, photos = ev.pick_photos(people, 600, 600, 4, 0)
    paths = sorted({p for v in photos.values() for p in v})
    processor = ev.ImageRedactProcessor(model_name="yolo26n-1280-e20-crowd.pt", imgsz=640)

    emb = {}
    for label, align_model in EMBEDDERS.items():
        embedder = ev.FaceEmbedder(model_name="w600k_mbf.onnx", align_model=align_model)
        emb[label] = ev.embed_all(processor, embedder, paths)
        print("embedded", label, flush=True)

    out = {}
    for enrol_n in (1, 3):
        for width in WIDTHS:
            row = {}
            for label in emb:
                pos, neg, _, tests, _ = ev.score(owners, photos, emb[label], (0.0, width), enrol_n, 0)
                row[label] = {t: (float((pos >= t).sum() / tests), float((neg >= t).mean())) for t in THRESHOLDS}
            out[f"enrol{enrol_n}/{width}px"] = row
            cells = " | ".join(
                f"{t:.2f} aligned {row['aligned'][t][0]:.0%}/{row['aligned'][t][1]:.3%}"
                f"  plain {row['plain'][t][0]:.0%}/{row['plain'][t][1]:.3%}"
                for t in sorted(THRESHOLDS, reverse=True)
            )
            print(f"enrol{enrol_n} {width:>2}px | {cells}")

    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results/align_cutoff.json").write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
