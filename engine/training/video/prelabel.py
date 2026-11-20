"""Pre-label a clip with the Engine and load it into CVAT as editable tracks.

Video bench: run the Engine's video path on a clip and save what it detected, kept and blurred (engine/training/video/).
Runs the Engine's own tracking pass (same model, thresholds and ByteTrack settings as a real job), then:
  * writes <out>/<clip>.engine.json  - the Engine's raw per-frame boxes and per-track decisions (for scoring later)
  * writes <out>/<clip>.cvat.xml     - "CVAT for video 1.1" tracks, keyframes every --step frames
  * creates/updates a CVAT task with the video and uploads the XML (unless --no-upload)

Run with the Engine venv from the engine/ directory, e.g.
  cd engine && MODELS_DIR=models .venv/bin/python training/video/prelabel.py VIDEO --mode max_privacy \
      --plate 51A12345 --face-ref photo1.jpg --face-ref photo2.jpg
"""

import argparse
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

sys.path.insert(0, os.getcwd())  # engine/ so that `src` imports
from src.processors.base import get_detection_mode_config, parse_confidence_thresholds  # noqa: E402
from src.processors.video_redact import ProgressThrottler, VideoProbe, VideoRedactProcessor  # noqa: E402

CVAT_URL = os.environ.get("CVAT_URL", "http://localhost:8099")
PROJECT_NAME = "whitelist-bench"

# Labels in CVAT. "identity" is what the human decides per track; "engine" shows the Engine's decision read-only-ish.
# Partly hidden plates/faces use CVAT's built-in per-frame "occluded" flag.
LABELS = [
    {
        "name": name,
        "type": "rectangle",
        "attributes": [
            {"name": "identity", "mutable": False, "input_type": "select",
             "values": ["unknown", "owner", "stranger", "mixed"], "default_value": "unknown"},
            {"name": "plate_text", "mutable": False, "input_type": "text", "values": [""], "default_value": ""},
            {"name": "engine", "mutable": False, "input_type": "text", "values": [""], "default_value": ""},
        ],
    }
    for name in ("face", "plate")
]


def run_engine(video: Path, mode: str, plates: list[str], face_refs: list[Path], similarity: float):
    proc = VideoRedactProcessor()
    mode_cfg = get_detection_mode_config(mode)
    proc._use_model(proc._resolve_model_path(mode_cfg.model_name))
    thresholds = parse_confidence_thresholds({}, base_thresholds=mode_cfg.confidence_thresholds)
    meta = VideoProbe.probe(str(video), ffprobe_bin=proc.ffprobe_bin)
    print(f"{video.name}: {meta.width}x{meta.height} @ {meta.fps:.2f} fps, {meta.frames} frames; mode={mode} {thresholds}")

    t0 = time.monotonic()
    tm = proc._track_pass(
        input_video_path=str(video), metadata=meta, targets_set={"face", "plate"}, thresholds=thresholds,
        review_threshold=0.25, throttler=ProgressThrottler(callback=None), imgsz=mode_cfg.imgsz,
    )
    print(f"tracking pass: {time.monotonic() - t0:.0f} s, {len(tm.tracks)} tracks")

    if face_refs:
        mgr = proc._get_whitelist_manager()
        specs = [{"bytes": p.read_bytes(), "key": str(p)} for p in face_refs]
        refs = mgr.load_reference_embeddings(faces_specs=specs, yolo_model=proc._get_model(),
                                             class_mapping=proc.class_mapping)
        proc._evaluate_face_whitelist(track_mgr=tm, ref_embeddings=refs, similarity_threshold=similarity,
                                      whitelist_mgr=mgr)
    # Always run the plate pass: it reads every plate track's text (and merges split plate tracks).
    proc._evaluate_plate_whitelist(track_mgr=tm, whitelist_plates=plates)
    return meta, tm


def engine_json(meta, tm) -> dict:
    tracks = []
    for t in sorted(tm.tracks.values(), key=lambda t: t.track_id):
        if not t.detections:
            continue
        tracks.append({
            "trackId": t.track_id, "label": t.label, "whitelisted": t.whitelisted,
            "similarity": t.similarity, "plateText": t.plate_text,
            "boxes": {str(f): {"box": d.box, "conf": d.confidence, "interp": d.is_interpolated}
                      for f, d in sorted(t.detections.items())},
            "held": {str(f): b for f, b in sorted(t.held_boxes.items())},
        })
    return {"video": {"width": meta.width, "height": meta.height, "fps": meta.fps, "frames": meta.frames},
            "tracks": tracks}


def cvat_xml(meta, tm, step: int) -> bytes:
    root = ET.Element("annotations")
    ET.SubElement(root, "version").text = "1.1"
    last_frame = meta.frames - 1
    for n, t in enumerate(sorted(tm.tracks.values(), key=lambda t: t.track_id)):
        frames = sorted(f for f, d in t.detections.items() if not d.is_interpolated)
        if not frames:
            continue
        el = ET.SubElement(root, "track", id=str(n), label=t.label, source="auto")
        # Keyframes: first, last, every `step`-th detection, and both sides of any gap.
        keep = {frames[0], frames[-1]}
        for i, f in enumerate(frames):
            if i % step == 0:
                keep.add(f)
            if i + 1 < len(frames) and frames[i + 1] - f > 1:
                keep.update((f, frames[i + 1]))
        all_frames = sorted(t.detections)  # includes Engine-interpolated frames: no "outside" inside short gaps
        decision = "kept" if t.whitelisted else "blurred"
        if t.similarity is not None:
            decision += f" sim={t.similarity:.2f}"
        if t.plate_text:
            decision += f" read={t.plate_text}"
        for f in sorted(keep):
            x1, y1, x2, y2 = t.detections[f].box
            box = ET.SubElement(el, "box", frame=str(f), keyframe="1", outside="0", occluded="0",
                                xtl=str(x1), ytl=str(y1), xbr=str(x2), ybr=str(y2), z_order="0")
            ET.SubElement(box, "attribute", name="identity").text = "unknown"
            ET.SubElement(box, "attribute", name="plate_text").text = t.plate_text or ""
            ET.SubElement(box, "attribute", name="engine").text = decision
        # Mark the track absent after each run of frames, so CVAT doesn't interpolate across long gaps.
        for i, f in enumerate(all_frames):
            nxt = all_frames[i + 1] if i + 1 < len(all_frames) else None
            if (nxt is None or nxt - f > 1) and f + 1 <= last_frame:
                x1, y1, x2, y2 = t.detections[f].box
                ET.SubElement(el, "box", frame=str(f + 1), keyframe="1", outside="1", occluded="0",
                              xtl=str(x1), ytl=str(y1), xbr=str(x2), ybr=str(y2), z_order="0")
        el[:] = sorted(el, key=lambda b: int(b.get("frame")))
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


class Cvat:
    def __init__(self, user: str, password: str):
        self.s = requests.Session()
        r = self.s.post(f"{CVAT_URL}/api/auth/login", json={"username": user, "password": password})
        r.raise_for_status()
        self.s.headers["X-CSRFToken"] = self.s.cookies.get("csrftoken", "")

    def _wait(self, rq_id: str):
        while True:
            r = self.s.get(f"{CVAT_URL}/api/requests/{rq_id}")
            r.raise_for_status()
            st = r.json()["status"]
            if st == "finished":
                return
            if st == "failed":
                raise RuntimeError(r.json().get("message"))
            time.sleep(2)

    def project_id(self) -> int:
        r = self.s.get(f"{CVAT_URL}/api/projects", params={"name": PROJECT_NAME})
        r.raise_for_status()
        if r.json()["results"]:
            return r.json()["results"][0]["id"]
        r = self.s.post(f"{CVAT_URL}/api/projects", json={"name": PROJECT_NAME, "labels": LABELS})
        r.raise_for_status()
        return r.json()["id"]

    def task_id(self, name: str, video: Path) -> int:
        r = self.s.get(f"{CVAT_URL}/api/tasks", params={"name": name})
        r.raise_for_status()
        if r.json()["results"]:
            return r.json()["results"][0]["id"]
        r = self.s.post(f"{CVAT_URL}/api/tasks", json={"name": name, "project_id": self.project_id()})
        r.raise_for_status()
        tid = r.json()["id"]
        with video.open("rb") as fh:
            r = self.s.post(f"{CVAT_URL}/api/tasks/{tid}/data",
                            data={"image_quality": 95, "use_zip_chunks": "true", "use_cache": "true",
                                  "sorting_method": "lexicographical"},
                            files={"client_files[0]": (video.name, fh)})
        r.raise_for_status()
        self._wait(r.json()["rq_id"])
        return tid

    def upload(self, tid: int, xml: bytes):
        r = self.s.post(f"{CVAT_URL}/api/tasks/{tid}/annotations", params={"format": "CVAT 1.1"},
                       files={"annotation_file": ("prelabel.xml", xml)})
        r.raise_for_status()
        self._wait(r.json()["rq_id"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("--name", help="CVAT task name (default: parent dir + file name)")
    ap.add_argument("--mode", default="max_privacy", choices=["fast", "max_privacy"])
    ap.add_argument("--plate", action="append", default=[], help="owner plate text (repeatable)")
    ap.add_argument("--face-ref", action="append", default=[], type=Path, help="owner reference photo (repeatable)")
    ap.add_argument("--similarity", type=float, default=0.45)
    ap.add_argument("--step", type=int, default=5, help="keyframe every N detected frames")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "datasets/whitelist-videos/bench/prelabels")
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--upload-only", action="store_true", help="skip the Engine; upload the existing <out>/<name>.cvat.xml")
    a = ap.parse_args()

    name = a.name or f"{a.video.parent.name}-{a.video.stem}"
    a.out.mkdir(parents=True, exist_ok=True)
    if a.upload_only:
        xml = (a.out / f"{name}.cvat.xml").read_bytes()
    else:
        meta, tm = run_engine(a.video, a.mode, a.plate, a.face_ref, a.similarity)
        (a.out / f"{name}.engine.json").write_text(json.dumps(engine_json(meta, tm)))
        xml = cvat_xml(meta, tm, a.step)
        (a.out / f"{name}.cvat.xml").write_bytes(xml)
        print(f"wrote {a.out}/{name}.engine.json and .cvat.xml")
    if a.no_upload:
        return
    user, password = (Path.home() / "cvat-local/login.txt").read_text().split()
    cvat = Cvat(user, password)
    tid = cvat.task_id(name, a.video)
    cvat.upload(tid, xml)
    print(f"CVAT task {tid}: {CVAT_URL}/tasks/{tid}")


if __name__ == "__main__":
    main()
