"""Recreate a CVAT video task as an image task (one exact frame per image) and carry its labels over.

Why: CVAT seeks into B-frame H.264 inexactly, so each reload can show a box on a different frame than it was drawn on.
Frames extracted with ffmpeg (-fps_mode passthrough) are exact. The old task is renamed <name>-video-old; delete it
once the new one checks out. Needs the local CVAT (http://localhost:8099) and its login in ~/cvat-local/login.txt.

    to_frames.py <task name> <video path>
"""

import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import requests

URL = "http://localhost:8099"
CVAT_HOME = Path.home() / "cvat-local"  # the local CVAT install: login.txt
BENCH_DIR = Path(__file__).resolve().parents[1] / "datasets/whitelist-videos/bench"  # labels, Engine runs (gitignored)


def login():
    user, password = (CVAT_HOME / "login.txt").read_text().split()
    session = requests.Session()
    session.post(f"{URL}/api/auth/login", json={"username": user, "password": password}).raise_for_status()
    session.headers["X-CSRFToken"] = session.cookies.get("csrftoken", "")
    return session


def wait(session, request_id):
    """Wait for a CVAT background request (export, upload, import) and return its final status."""
    while True:
        status = session.get(f"{URL}/api/requests/{request_id}").json()
        if status["status"] == "finished":
            return status
        if status["status"] == "failed":
            raise RuntimeError(status.get("message"))
        time.sleep(2)


def main():
    name, video = sys.argv[1], Path(sys.argv[2])
    s = login()
    old = next(t for t in s.get(f"{URL}/api/tasks", params={"name": name}).json()["results"] if t["name"] == name)

    # 1. The current labels, kept as a backup next to the other bench files
    r = s.post(f"{URL}/api/tasks/{old['id']}/dataset/export",
               params={"format": "CVAT for video 1.1", "save_images": "false"})
    r.raise_for_status()
    status = wait(s, r.json()["rq_id"])
    labels = BENCH_DIR / "prelabels" / f"{name}.before-frames.zip"
    labels.write_bytes(s.get(status["result_url"]).content)
    xml = zipfile.ZipFile(labels).read("annotations.xml")

    # 2. Exact frames
    tmp = Path(tempfile.mkdtemp())
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-fps_mode", "passthrough", "-q:v", "2",
                    str(tmp / "%06d.jpg")], check=True)
    frames = sorted(tmp.glob("*.jpg"))
    print(f"{name}: {len(frames)} frames extracted, CVAT task had {old['size']}")
    if len(frames) != old["size"]:
        sys.exit("frame count differs from the CVAT task: stopping")
    archive = tmp / "frames.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_STORED) as z:
        for f in frames:
            z.write(f, f.name)

    # 3. A new task with the same name and project; the old one is renamed, not deleted
    s.patch(f"{URL}/api/tasks/{old['id']}", json={"name": f"{name}-video-old"}).raise_for_status()
    r = s.post(f"{URL}/api/tasks", json={"name": name, "project_id": old["project_id"]})
    r.raise_for_status()
    task_id = r.json()["id"]
    with archive.open("rb") as fh:
        r = s.post(f"{URL}/api/tasks/{task_id}/data",
                   data={"image_quality": 95, "use_zip_chunks": "true", "use_cache": "true",
                         "sorting_method": "lexicographical"},
                   files={"client_files[0]": ("frames.zip", fh)})
    r.raise_for_status()
    wait(s, r.json()["rq_id"])
    r = s.post(f"{URL}/api/tasks/{task_id}/annotations", params={"format": "CVAT 1.1"},
               files={"annotation_file": ("annotations.xml", xml)})
    r.raise_for_status()
    wait(s, r.json()["rq_id"])
    subprocess.run(["rm", "-rf", str(tmp)], check=True)
    print(f"{name}: new task {task_id} {URL}/tasks/{task_id} (old task {old['id']} renamed {name}-video-old)")


if __name__ == "__main__":
    main()
