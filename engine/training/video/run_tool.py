"""Run an open-source per-frame tool (deface or EgoBlur Gen2) on a benchmark clip, to compare with the Engine.

Frames come from ffmpeg -fps_mode passthrough, the same exact frames the labels were drawn on. Every box >= 0.05 is kept
per frame; score_tool.py then picks the threshold and scores it like an Engine run.

    <venv>/bin/python training/video/run_tool.py deface|egoblur <video> <clip name>      (from engine/)

deface runs in ../infra/bench/.cache/deface-venv (made by infra/bench/compare/deface.sh), EgoBlur in
training/.cache/egoblur/venv (detection/README.md, "Other tools"). See video/README.md. Output: datasets/whitelist-videos/bench/tools/<clip>.<tool>.json (gitignored).
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import imageio.v3 as iio

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent / "datasets" / "whitelist-videos" / "bench" / "tools"


def fps_of(video: Path) -> float:
    rate = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                           "-of", "csv=p=0", str(video)], capture_output=True, text=True, check=True).stdout.strip()
    num, _, den = rate.partition("/")
    return float(num) / float(den or 1)


def main():
    tool, video, clip = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
    tmp = Path(tempfile.mkdtemp())
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-fps_mode", "passthrough", "-q:v", "2",
                        str(tmp / "%06d.jpg")], check=True)
        frames = sorted(tmp.glob("*.jpg"))
        dets = {}
        if tool == "deface":
            from deface.centerface import CenterFace  # deface 1.5.0: CenterFace, faces only

            model = CenterFace(in_shape=None, override_execution_provider="CUDAExecutionProvider")
            for i, f in enumerate(frames):
                found, _ = model(iio.imread(f), threshold=0.05)
                dets[i] = [{"label": "face", "conf": float(x[4]), "box": [float(v) for v in x[:4]]} for x in found]
        elif tool == "egoblur":
            sys.path.insert(0, str(HERE.parent / "detection"))
            from egoblur_detect import Detector

            model = Detector()
            for i, f in enumerate(frames):
                dets[i] = model(iio.imread(f))
        else:
            sys.exit(f"unknown tool {tool!r}: deface or egoblur")
        h, w = iio.imread(frames[0]).shape[:2]
    finally:
        shutil.rmtree(tmp)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{clip}.{tool}.json"
    json.dump({"frames": len(frames), "width": w, "height": h, "fps": fps_of(video), "dets": dets}, open(out, "w"))
    print(out, len(frames), "frames", sum(len(v) for v in dets.values()), "boxes")


if __name__ == "__main__":
    main()
