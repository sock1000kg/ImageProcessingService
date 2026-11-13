"""Face whitelist accuracy on LFW: does the Engine keep the owner's face and redact everyone else's?

Uses the Engine's own path: its YOLO face detector (largest face, as ``WhitelistManager.extract_face_from_reference_image``
does for a reference photo) and its ``FaceEmbedder`` (MobileFaceNet/ArcFace, cosine similarity). A face is kept when its
similarity to a whitelist photo is >= the threshold, so:

- **owner kept (true accept)**: the share of an owner's other photos scoring >= threshold against their enrolment photo.
  A photo with no detected face counts as not kept (the Engine would redact it).
- **stranger leaked (false accept)**: the share of photos of OTHER people scoring >= threshold against one enrolment
  photo. This is the privacy leak. A photo with no detected face cannot leak.
- **k-person whitelist**: the chance a stranger scores >= threshold against at least one of k enrolled people.

Photos are also scored after being shrunk to a given face width and JPEG re-compressed, to imitate small, compressed faces in
video. LFW photos are large frontal faces, so the "clean" row is the best case and the small rows are the realistic ones.

Setup, from the repo root: ``engine/training/face/fetch.sh``. Run from the repo root:
    MODELS_DIR=engine/models engine/.venv/bin/python engine/training/face/eval_face_whitelist.py
Writes ``results/face_whitelist.json``.
"""

import argparse
import json
import random
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "engine"))
from src.processors.face_embedding import FaceEmbedder  # noqa: E402
from src.processors.image_redact import ImageRedactProcessor  # noqa: E402

LFW = REPO / "engine/training/datasets/lfw/raw/lfw"
THRESHOLDS = (0.30, 0.35, 0.40, 0.45, 0.50, 0.60)
FACE_WIDTHS = (None, 64, 40, 24)  # None = the detected crop as is
MARGINS = (0.0, 0.15, 0.30)  # box grown by this share of its size per side; 0 = what the Engine does today
ENROL_COUNTS = (1, 3)  # reference photos per person: one, or a "profile" of several angles
JPEG_QUALITY = 35
WHITELIST_SIZES = (1, 5)  # people on the whitelist
TARGET_FPR = (1e-3, 1e-4)


def largest_face(processor, img_bgr):
    """(image, box) of the largest face, found the way the Engine finds a reference face (conf 0.25, imgsz 640)."""
    h, w = img_bgr.shape[:2]
    result = processor.model.predict(source=img_bgr, conf=0.25, imgsz=640, verbose=False)[0]
    best, best_area = None, 0
    for box in result.boxes if result.boxes is not None else []:
        raw = processor.model.names.get(int(box.cls[0].item()), "")
        if processor.class_mapping.get(raw) != "face":
            continue
        x1, y1, x2, y2 = (int(round(v)) for v in box.xyxy[0].tolist())
        x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
        if (x2 - x1) * (y2 - y1) > best_area:
            best, best_area = (img_bgr, (x1, y1, x2, y2)), (x2 - x1) * (y2 - y1)
    return best


def crop_with_margin(img_bgr, box, margin, mask_outside=False):
    """The face box grown by ``margin`` of its size on every side (0 = the raw box the Engine uses today).

    ``mask_outside`` paints everything outside the detector box with the box's mean colour, so the crop keeps the wider
    framing but shows no hair or background. It separates "framing" from "context" as the cause of margin changing scores.
    """
    h, w = img_bgr.shape[:2]
    x1, y1, x2, y2 = box
    mx, my = round((x2 - x1) * margin), round((y2 - y1) * margin)
    cx1, cy1, cx2, cy2 = max(0, x1 - mx), max(0, y1 - my), min(w, x2 + mx), min(h, y2 + my)
    crop = img_bgr[cy1:cy2, cx1:cx2]
    if mask_outside and margin > 0:
        crop = np.empty_like(crop)
        crop[:] = img_bgr[y1:y2, x1:x2].reshape(-1, 3).mean(axis=0)
        crop[y1 - cy1:y2 - cy1, x1 - cx1:x2 - cx1] = img_bgr[y1:y2, x1:x2]
    return crop


# Where ArcFace training put the eyes, nose and mouth corners in its 112x112 crops (the InsightFace template).
ARCFACE_TEMPLATE = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]], dtype=np.float32
)
YUNET = REPO / "engine/training/datasets/yunet/yunet.onnx"


def aligned_face(yunet, img_bgr):
    """Largest face rotated and scaled so its 5 landmarks sit on the ArcFace template; None if YuNet finds no face.

    Not what the Engine does (it has no landmarks): this is the upper bound that alignment would give.
    """
    yunet.setInputSize((img_bgr.shape[1], img_bgr.shape[0]))
    _, faces = yunet.detect(img_bgr)
    if faces is None or len(faces) == 0:
        return None
    best = max(faces, key=lambda f: f[2] * f[3])
    points = best[4:14].reshape(5, 2).astype(np.float32)
    matrix, _ = cv2.estimateAffinePartial2D(points, ARCFACE_TEMPLATE, method=cv2.LMEDS)
    return None if matrix is None else cv2.warpAffine(img_bgr, matrix, (112, 112), flags=cv2.INTER_LINEAR)


def degrade(crop, width):
    """Shrink the face crop to ``width`` px and JPEG round-trip it, like a small face in compressed video."""
    if width is None:
        return crop
    h = max(1, round(crop.shape[0] * width / crop.shape[1]))
    small = cv2.resize(crop, (width, h), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    return cv2.imdecode(buf, cv2.IMREAD_COLOR) if ok else small


def pick_photos(people, n_owners, n_strangers, max_photos, seed):
    """Owners: people with > max(ENROL_COUNTS) photos (the first ones enrol, the next one tests). Strangers: other people's photos."""
    rng = random.Random(seed)
    names = sorted(people)
    multi = [n for n in names if len(people[n]) > max(ENROL_COUNTS)]
    owners = rng.sample(multi, min(n_owners, len(multi)))
    others = [n for n in names if n not in set(owners)]
    stranger_people = rng.sample(others, min(n_strangers, len(others)))
    photos = {n: [str(p) for p in sorted(people[n])[:max_photos]] for n in owners}
    photos.update({n: [str(sorted(people[n])[0])] for n in stranger_people})
    return owners, photos


def embed_all(processor, embedder, paths, mask_outside=False, yunet=None):
    """{path: {(margin, width): embedding or None}}; None when no face was found."""
    out = {}
    for i, path in enumerate(paths, 1):
        img = cv2.imread(path)
        if yunet is not None:  # aligned variant: one crop per photo, margin does not apply
            crop = aligned_face(yunet, img)
            out[path] = {(0.0, w): (embedder.extract_embedding(degrade(crop, w)) if crop is not None else None) for w in FACE_WIDTHS}
            continue
        found = largest_face(processor, img)
        out[path] = {
            (m, w): (embedder.extract_embedding(degrade(crop_with_margin(*found, m, mask_outside), w)) if found else None)
            for m in MARGINS
            for w in FACE_WIDTHS
        }
        if i % 250 == 0:
            print(f"  embedded {i}/{len(paths)}", flush=True)
    return out


def profile_sim(profile, e):
    """Engine rule: a face's score against a person is its best score over that person's reference photos."""
    return max(float(r @ e) for r in profile)


def score(owners, photos, emb, key, enrol_n, seed):
    """Similarities for one (margin, width) and profile size: owner test photos (positives) and everyone else's (negatives).

    Every owner is tested on the same photo (index ``max(ENROL_COUNTS)``) whatever ``enrol_n`` is, so profile sizes compare.
    """
    test_idx = max(ENROL_COUNTS)
    profiles = {o: [emb[p][key] for p in photos[o][:enrol_n] if emb[p][key] is not None] for o in owners}
    enrolled = [o for o in owners if profiles[o]]
    pos, neg, pos_missing, tests = [], [], 0, 0
    for o in enrolled:
        tests += 1
        e = emb[photos[o][test_idx]][key]
        if e is None:
            pos_missing += 1
        else:
            pos.append(profile_sim(profiles[o], e))
    # Per stranger photo: its best similarity to a random k-subset of enrolled people (k = whitelist size).
    rng = random.Random(seed)
    best_by_k = {k: [] for k in WHITELIST_SIZES if k > 1}
    for name in sorted(photos):
        for p in photos[name]:
            e = emb[p][key]
            if e is None:
                continue
            sims = {o: profile_sim(profiles[o], e) for o in enrolled if o != name}
            neg.extend(sims.values())
            pool = list(sims)
            for k in best_by_k:
                for _ in range(5):
                    best_by_k[k].append(max(sims[o] for o in rng.sample(pool, k)))
    return np.array(pos), np.array(neg), pos_missing, tests, {k: np.array(v) for k, v in best_by_k.items() if v}


def main():
    parser = argparse.ArgumentParser(description="Face whitelist true-accept and false-accept rates on LFW.")
    parser.add_argument("--owners", type=int, default=600)
    parser.add_argument("--strangers", type=int, default=600, help="extra people used only as strangers")
    parser.add_argument("--max-photos", type=int, default=4, help="photos used per owner (the first ENROL_COUNTS enrol, the next one tests)")
    parser.add_argument("--mask-outside-box", action="store_true",
                        help="paint the margin with the box's mean colour; writes results/face_whitelist_masked.json")
    parser.add_argument("--align", action="store_true",
                        help="upper bound: align faces with YuNet landmarks; writes results/face_whitelist_aligned.json")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--model", default="yolo26n-1280-e20-crowd.pt", help="detector file in the Engine's models dir")
    args = parser.parse_args()

    people = {d.name: sorted(d.glob("*.jpg")) for d in LFW.iterdir() if d.is_dir()}
    owners, photos = pick_photos(people, args.owners, args.strangers, args.max_photos, args.seed)
    paths = sorted({p for v in photos.values() for p in v})
    print(f"{len(owners)} owners, {len(photos) - len(owners)} stranger-only people, {len(paths)} photos")

    processor = ImageRedactProcessor(model_name=args.model, imgsz=640)
    embedder = FaceEmbedder(model_name="w600k_mbf.onnx")
    yunet = cv2.FaceDetectorYN.create(str(YUNET), "", (320, 320), 0.6) if args.align else None
    margins = (0.0,) if args.align else MARGINS
    emb = embed_all(processor, embedder, paths, args.mask_outside_box, yunet)
    no_face = sum(e[(0.0, None)] is None for e in emb.values())
    print(f"no face found in {no_face} of {len(paths)} photos")

    results = {"model": args.model, "owners": len(owners), "photos": len(paths), "no_face_photos": no_face, "runs": {}}
    for enrol_n in ENROL_COUNTS:
        for margin in margins:
            for width in FACE_WIDTHS:
                pos, neg, pos_missing, tests, best_by_k = score(owners, photos, emb, (margin, width), enrol_n, args.seed)
                label = f"enrol{enrol_n}/margin{margin:.2f}/" + ("clean" if width is None else f"{width}px")
                rows = {}
                for t in THRESHOLDS:
                    row = {"owner_kept": float((pos >= t).sum() / max(1, tests)), "stranger_leaked_1": float((neg >= t).mean())}
                    for k, arr in best_by_k.items():
                        row[f"stranger_leaked_{k}"] = float((arr >= t).mean())
                    rows[f"{t:.2f}"] = row
                at_fpr = {}
                for target in TARGET_FPR:
                    t = float(np.quantile(neg, 1 - target))
                    at_fpr[f"{target:g}"] = {"threshold": round(t, 4), "owner_kept": float((pos >= t).sum() / max(1, tests))}
                med = float(np.median(pos)) if pos.size else None
                results["runs"][label] = {
                    "owner_test_photos": tests,
                    "stranger_pairs": int(neg.size),
                    "owner_similarity_median": med,
                    "stranger_similarity_p99": float(np.quantile(neg, 0.99)),
                    "stranger_similarity_max": float(neg.max()),
                    "by_threshold": rows,
                    "threshold_for_stranger_leak": at_fpr,
                }
                print(f"\n== {label}   owner tests {tests}, stranger pairs {neg.size}")
                print(f"  owner median {med:.3f}   stranger p99 {np.quantile(neg, 0.99):.3f}   max {neg.max():.3f}")
                print(f"  {'thr':>5} {'owner kept':>11} {'leak 1':>9} " + " ".join(f"leak {k:>2}" for k in best_by_k))
                for t, r in rows.items():
                    print(f"  {t:>5} {r['owner_kept']:>11.1%} {r['stranger_leaked_1']:>9.3%} "
                          + " ".join(f"{r.get(f'stranger_leaked_{k}', 0):>7.3%}" for k in best_by_k))
                for target, v in at_fpr.items():
                    print(f"  threshold for {float(target):.2%} stranger leak: {v['threshold']:.3f}  -> owner kept {v['owner_kept']:.1%}")

    suffix = "_aligned" if args.align else "_masked" if args.mask_outside_box else ""
    out = HERE / f"results/face_whitelist{suffix}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(results, indent=1) + "\n")


if __name__ == "__main__":
    main()
