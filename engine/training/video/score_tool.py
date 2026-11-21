"""Score a per-frame tool's boxes (from run_tool.py) with score.py, against the clip's saved CVAT labels.

Each box at or above the threshold becomes a one-frame "track" that is never on the allow list (these tools have neither
tracking nor an allow list), grown by --padding before coverage is measured, exactly like an Engine run.

    .venv/bin/python training/video/score_tool.py <clip> deface|egoblur <threshold> <padding> <full>      (from engine/)
    e.g. score_tool.py face-test1 deface 0.2 0.15 0.7      deface's defaults: threshold 0.2, blur box 1.3x = 15% a side
         score_tool.py plate-test1 egoblur 0.674 0 0.9     EgoBlur's default threshold, boxes not grown

Writes prelabels/<clip>-<tool>@<threshold>.engine.json and scores/<that name>@<full>.json, prints score.py's report.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import score  # noqa: E402  (video/score.py)

BENCH = score.BENCH_DIR


def main():
    clip, tool, threshold, padding, full = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
    run = json.load(open(BENCH / "tools" / f"{clip}.{tool}.json"))
    tracks = []
    for frame, boxes in run["dets"].items():
        for d in boxes:
            if d["conf"] >= threshold:
                tracks.append({"trackId": len(tracks) + 1, "label": d["label"], "whitelisted": False, "similarity": None,
                               "plateText": None, "held": {},
                               "boxes": {str(frame): {"box": [round(v) for v in d["box"]], "conf": d["conf"],
                                                      "interp": False}}})
    name = f"{clip}-{tool}@{threshold}"
    video = {k: run[k] for k in ("width", "height", "fps", "frames")}
    json.dump({"video": video, "tracks": tracks}, open(BENCH / "prelabels" / f"{name}.engine.json", "w"))
    (BENCH / "scores").mkdir(exist_ok=True)
    sys.argv = ["score.py", clip, "--engine", name, "--padding", padding, "--full", full,
                "--labels", str(BENCH / "prelabels" / f"{clip}.labels.zip"),
                "--json", str(BENCH / "scores" / f"{name}@{full}.json")]
    score.main()


if __name__ == "__main__":
    main()
