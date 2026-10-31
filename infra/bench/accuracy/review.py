#!/usr/bin/env python3
"""Review warning (reviewThreshold -> lowConfidence -> needsReview) evaluation.

Python 3 stdlib only. No external dependencies.
Reuses IoU, coverage, redacted box calculation, and label loading from evaluate.py.

Evaluates:
- Catch rate, flag rate, and flag precision across review threshold R sweep (from operating threshold to 0.95).
- Silent misses: leaky images whose missed GT boxes have no detection down to 0.05.
- What-if analysis: catch and flag rates if detections in [0.20, operating_threshold) also raised the warning.
- Calibration: detection precision (IoU >= 0.5) and privacy protection share (coverage >= 70%) across confidence bins.

Usage:
    review.py <run_dir> [--labels dataset/labels-<set>.jsonl] [--operating-threshold T]
    review.py --combine <run_dir1> <run_dir2> ... [--labels <labels_file>] [--out <output_path>]
"""

import argparse
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

# Re-use shared evaluator logic directly
try:
    from evaluate import (
        compute_coverage,
        compute_iou,
        get_redacted_box,
        find_detections,
        load_detections,
        load_labels,
        manifest_path_to_filename,
    )
except ImportError:
    sys.path.insert(0, os.path.dirname(__file__))
    from evaluate import (
        compute_coverage,
        compute_iou,
        get_redacted_box,
        find_detections,
        load_detections,
        load_labels,
        manifest_path_to_filename,
    )

CALIBRATION_BINS: List[Tuple[str, float, float]] = [
    ("0.05–0.10", 0.05, 0.10),
    ("0.10–0.20", 0.10, 0.20),
    ("0.20–0.30", 0.20, 0.30),
    ("0.30–0.40", 0.30, 0.40),
    ("0.40–0.50", 0.40, 0.50),
    ("0.50–0.60", 0.50, 0.60),
    ("0.60–0.70", 0.60, 0.70),
    ("0.70–0.80", 0.70, 0.80),
    ("0.80–0.90", 0.80, 0.90),
    ("0.90–1.00", 0.90, 1.001),
]


def evaluate_review_for_class(
    target_class: str,
    labels_by_img: Dict[str, Dict[str, Any]],
    dets_by_img: Dict[str, List[Dict[str, Any]]],
    operating_threshold: float = 0.35,
    padding: float = 0.1,
    default_review_threshold: float = 0.50,
) -> Dict[str, Any]:
    """Evaluate review warning metrics and calibration for a single class (face or plate)."""
    allowed_subset = "wider" if target_class == "face" else "vn"
    subset_images = [
        fn for fn, l_rec in labels_by_img.items() if l_rec.get("subset") == allowed_subset
    ]
    total_images = len(subset_images)

    # 1. Parse ground truth per image
    valid_gt: Dict[str, List[List[float]]] = {}
    ignore_gt: Dict[str, List[List[float]]] = {}
    total_valid_gt = 0
    total_valid_gt_no_tiny = 0

    for fn in subset_images:
        l_rec = labels_by_img.get(fn, {})
        v_list: List[List[float]] = []
        i_list: List[List[float]] = []
        for b in l_rec.get("boxes", []):
            if b.get("label") != target_class:
                continue
            box = [float(v) for v in b.get("box", [])]
            if b.get("ignore", False):
                i_list.append(box)
            else:
                v_list.append(box)
                total_valid_gt += 1
                if max(0.0, box[2] - box[0]) >= 16.0:
                    total_valid_gt_no_tiny += 1
        valid_gt[fn] = v_list
        ignore_gt[fn] = i_list

    # 2. Extract kept detections (confidence >= operating_threshold) and determine leaks
    leaky_images: Set[str] = set()
    leaky_images_no_tiny: Set[str] = set()
    missed_gt_by_img: Dict[str, List[List[float]]] = {}
    missed_gt_no_tiny_by_img: Dict[str, List[List[float]]] = {}

    for fn in subset_images:
        v_boxes = valid_gt.get(fn, [])
        all_img_dets = [
            d for d in dets_by_img.get(fn, []) if d.get("label") == target_class
        ]
        kept_dets = [
            d for d in all_img_dets if float(d.get("confidence", 0.0)) >= operating_threshold
        ]
        redacted_boxes = [
            get_redacted_box(d.get("box", [0, 0, 0, 0]), is_deface=False, padding=padding)
            for d in kept_dets
        ]

        missed: List[List[float]] = []
        missed_nt: List[List[float]] = []
        for g_box in v_boxes:
            cov = compute_coverage(g_box, redacted_boxes)
            if cov < 0.70:
                missed.append(g_box)
                if max(0.0, g_box[2] - g_box[0]) >= 16.0:
                    missed_nt.append(g_box)

        if missed:
            leaky_images.add(fn)
            missed_gt_by_img[fn] = missed
        if missed_nt:
            leaky_images_no_tiny.add(fn)
            missed_gt_no_tiny_by_img[fn] = missed_nt

    # 3. Silent misses: share of leaky images whose missed GT boxes have no detection down to 0.05
    # Touching rule: IoU >= 0.1 or coverage >= 30% (with standard padding expansion)
    silent_miss_images: Set[str] = set()
    silent_miss_images_no_tiny: Set[str] = set()

    for fn in leaky_images:
        all_img_dets = [
            d for d in dets_by_img.get(fn, []) if d.get("label") == target_class
        ]
        has_any_candidate = False
        for g_box in missed_gt_by_img.get(fn, []):
            for d in all_img_dets:
                d_box = [float(v) for v in d.get("box", [0, 0, 0, 0])]
                iou = compute_iou(d_box, g_box)
                r_det = get_redacted_box(d_box, is_deface=False, padding=padding)
                cov = compute_coverage(g_box, [r_det])
                if iou >= 0.10 or cov >= 0.30:
                    has_any_candidate = True
                    break
            if has_any_candidate:
                break
        if not has_any_candidate:
            silent_miss_images.add(fn)

    for fn in leaky_images_no_tiny:
        all_img_dets = [
            d for d in dets_by_img.get(fn, []) if d.get("label") == target_class
        ]
        has_any_candidate = False
        for g_box in missed_gt_no_tiny_by_img.get(fn, []):
            for d in all_img_dets:
                d_box = [float(v) for v in d.get("box", [0, 0, 0, 0])]
                iou = compute_iou(d_box, g_box)
                r_det = get_redacted_box(d_box, is_deface=False, padding=padding)
                cov = compute_coverage(g_box, [r_det])
                if iou >= 0.10 or cov >= 0.30:
                    has_any_candidate = True
                    break
            if has_any_candidate:
                break
        if not has_any_candidate:
            silent_miss_images_no_tiny.add(fn)

    silent_share = (
        len(silent_miss_images) / len(leaky_images) if leaky_images else 0.0
    )
    silent_share_no_tiny = (
        len(silent_miss_images_no_tiny) / len(leaky_images_no_tiny)
        if leaky_images_no_tiny
        else 0.0
    )

    # 4. Sweep review threshold R from operating_threshold up to 0.95 in 0.05 steps
    # Flagged image: any kept detection (conf >= operating_threshold) has conf < R
    sweep_results: List[Dict[str, Any]] = []
    # Build list of R values: start at operating_threshold, then multiples of 0.05 up to 0.95
    r_candidates: List[float] = [operating_threshold]
    first_step = int(math.ceil(round(operating_threshold * 100.0) / 5.0) * 5)
    for r_int in range(first_step, 96, 5):
        val = round(r_int / 100.0, 2)
        if val > operating_threshold and val not in r_candidates:
            r_candidates.append(val)
    r_candidates.sort()

    for R in r_candidates:
        flagged: Set[str] = set()
        for fn in subset_images:
            all_img_dets = [
                d for d in dets_by_img.get(fn, []) if d.get("label") == target_class
            ]
            if any(
                operating_threshold <= float(d.get("confidence", 0.0)) < R
                for d in all_img_dets
            ):
                flagged.add(fn)

        flagged_count = len(flagged)
        flag_rate = flagged_count / total_images if total_images > 0 else 0.0

        caught_all = flagged & leaky_images
        caught_all_count = len(caught_all)
        catch_rate_all = (
            caught_all_count / len(leaky_images) if leaky_images else 0.0
        )
        precision_all = (
            caught_all_count / flagged_count if flagged_count > 0 else 0.0
        )

        caught_nt = flagged & leaky_images_no_tiny
        caught_nt_count = len(caught_nt)
        catch_rate_nt = (
            caught_nt_count / len(leaky_images_no_tiny)
            if leaky_images_no_tiny
            else 0.0
        )
        precision_nt = (
            caught_nt_count / flagged_count if flagged_count > 0 else 0.0
        )

        is_default = abs(R - default_review_threshold) < 1e-4

        sweep_results.append({
            "threshold": R,
            "is_default": is_default,
            "flagged_count": flagged_count,
            "flag_rate": round(flag_rate, 4),
            "caught_all_count": caught_all_count,
            "catch_rate_all": round(catch_rate_all, 4),
            "precision_all": round(precision_all, 4),
            "caught_no_tiny_count": caught_nt_count,
            "catch_rate_no_tiny": round(catch_rate_nt, 4),
            "precision_no_tiny": round(precision_nt, 4),
        })

    # 5. What-if row: detections in [0.20, operating_threshold) also raise the warning flag
    what_if_flagged: Set[str] = set()
    for fn in subset_images:
        all_img_dets = [
            d for d in dets_by_img.get(fn, []) if d.get("label") == target_class
        ]
        # Flagged if any kept detection < default_review_threshold OR any detection in [0.20, operating_threshold)
        # Equivalently: any detection with 0.20 <= confidence < default_review_threshold
        if any(
            0.20 <= float(d.get("confidence", 0.0)) < default_review_threshold
            for d in all_img_dets
        ):
            what_if_flagged.add(fn)

    wi_flagged_count = len(what_if_flagged)
    wi_flag_rate = wi_flagged_count / total_images if total_images > 0 else 0.0

    wi_caught_all = what_if_flagged & leaky_images
    wi_caught_all_count = len(wi_caught_all)
    wi_catch_rate_all = (
        wi_caught_all_count / len(leaky_images) if leaky_images else 0.0
    )
    wi_precision_all = (
        wi_caught_all_count / wi_flagged_count if wi_flagged_count > 0 else 0.0
    )

    wi_caught_nt = what_if_flagged & leaky_images_no_tiny
    wi_caught_nt_count = len(wi_caught_nt)
    wi_catch_rate_nt = (
        wi_caught_nt_count / len(leaky_images_no_tiny)
        if leaky_images_no_tiny
        else 0.0
    )
    wi_precision_nt = (
        wi_caught_nt_count / wi_flagged_count if wi_flagged_count > 0 else 0.0
    )

    what_if_result = {
        "description": "What-If (conf 0.20–0.50 flags)",
        "flagged_count": wi_flagged_count,
        "flag_rate": round(wi_flag_rate, 4),
        "caught_all_count": wi_caught_all_count,
        "catch_rate_all": round(wi_catch_rate_all, 4),
        "precision_all": round(wi_precision_all, 4),
        "caught_no_tiny_count": wi_caught_nt_count,
        "catch_rate_no_tiny": round(wi_catch_rate_nt, 4),
        "precision_no_tiny": round(wi_precision_nt, 4),
    }

    # 6. Calibration: confidence bins [0.05–0.10, ..., 0.90–1.00]
    # Detections evaluated for IoU >= 0.5 (greedy matching) and GT coverage >= 70%
    all_preds: List[Tuple[float, str, List[float]]] = []
    for fn in subset_images:
        for d in dets_by_img.get(fn, []):
            if d.get("label") == target_class:
                conf = float(d.get("confidence", 0.0))
                b_box = [float(v) for v in d.get("box", [0, 0, 0, 0])]
                all_preds.append((conf, fn, b_box))

    # Sort descending by confidence for standard greedy matching
    all_preds.sort(key=lambda p: p[0], reverse=True)

    matched_gt: Set[Tuple[str, int]] = set()
    pred_results: List[Tuple[float, bool, bool]] = []  # (score, is_tp, protects_gt)

    for score, fn, p_box in all_preds:
        v_boxes = valid_gt.get(fn, [])
        i_boxes = ignore_gt.get(fn, [])

        best_iou = 0.0
        best_gt_idx = -1
        for idx, g_box in enumerate(v_boxes):
            if (fn, idx) in matched_gt:
                continue
            iou = compute_iou(p_box, g_box)
            if iou > best_iou:
                best_iou = iou
                best_gt_idx = idx

        best_ign_iou = 0.0
        for g_box in i_boxes:
            iou = compute_iou(p_box, g_box)
            if iou > best_ign_iou:
                best_ign_iou = iou

        is_tp = False
        if best_iou >= 0.5 and best_iou >= best_ign_iou:
            matched_gt.add((fn, best_gt_idx))
            is_tp = True

        r_box = get_redacted_box(p_box, is_deface=False, padding=padding)
        protects_gt = any(compute_coverage(g, [r_box]) >= 0.70 for g in v_boxes)

        pred_results.append((score, is_tp, protects_gt))

    calibration_results: List[Dict[str, Any]] = []
    for b_label, b_min, b_max in CALIBRATION_BINS:
        in_bin = [r for r in pred_results if b_min <= r[0] < b_max]
        cnt = len(in_bin)
        tp_cnt = sum(1 for r in in_bin if r[1])
        prot_cnt = sum(1 for r in in_bin if r[2])
        tp_share = tp_cnt / cnt if cnt > 0 else 0.0
        prot_share = prot_cnt / cnt if cnt > 0 else 0.0
        calibration_results.append({
            "bin": b_label,
            "min_conf": b_min,
            "max_conf": b_max,
            "count": cnt,
            "tp_count": tp_cnt,
            "tp_share": round(tp_share, 4),
            "protect_count": prot_cnt,
            "protect_share": round(prot_share, 4),
        })

    return {
        "class": target_class,
        "subset": allowed_subset,
        "total_images": total_images,
        "total_gt": total_valid_gt,
        "total_gt_no_tiny": total_valid_gt_no_tiny,
        "leaky_images": len(leaky_images),
        "leaky_images_no_tiny": len(leaky_images_no_tiny),
        "silent_misses": {
            "count": len(silent_miss_images),
            "share": round(silent_share, 4),
            "count_no_tiny": len(silent_miss_images_no_tiny),
            "share_no_tiny": round(silent_share_no_tiny, 4),
        },
        "what_if": what_if_result,
        "sweep": sweep_results,
        "calibration": calibration_results,
    }


def evaluate_run_review(
    run_dir: str,
    labels_file: str,
    operating_threshold_arg: Optional[float] = None,
    padding: float = 0.1,
) -> Dict[str, Any]:
    """Evaluate review warning for all classes on a single benchmark run."""
    meta_path = os.path.join(run_dir, "meta.json")
    meta: Dict[str, Any] = {}
    if os.path.isfile(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

    # Operating threshold resolution
    if operating_threshold_arg is not None:
        op_thresh = operating_threshold_arg
    else:
        op_thresh = 0.35

    dets_file = find_detections(run_dir)
    if dets_file is None:
        raise FileNotFoundError(
            f"detections.jsonl not found in {run_dir}. Run must be recorded with --save-detections."
        )

    labels_by_img = load_labels(labels_file)
    dets_by_img = load_detections(dets_file)

    face_res = evaluate_review_for_class(
        "face",
        labels_by_img,
        dets_by_img,
        operating_threshold=op_thresh,
        padding=padding,
    )
    plate_res = evaluate_review_for_class(
        "plate",
        labels_by_img,
        dets_by_img,
        operating_threshold=op_thresh,
        padding=padding,
    )

    return {
        "run_dir": run_dir,
        "meta": meta,
        "tool": meta.get("tool", "engine"),
        "operating_threshold": op_thresh,
        "default_review_threshold": 0.50,
        "padding": padding,
        "labels_file": labels_file,
        "metrics": {
            "face": face_res,
            "plate": plate_res,
        },
    }


def format_single_markdown(eval_res: Dict[str, Any]) -> str:
    """Format single run review evaluation report in GitHub-flavored markdown."""
    run_dir = eval_res.get("run_dir", "")
    run_name = os.path.basename(run_dir.rstrip("/"))
    meta = eval_res.get("meta", {})
    op_thresh = eval_res.get("operating_threshold", 0.35)
    def_rev = eval_res.get("default_review_threshold", 0.50)
    dataset = meta.get("dataset", "unknown")
    imgsz = meta.get("imgsz", 640)

    lines: List[str] = [
        f"# Review Warning Evaluation (`reviewThreshold` → `needsReview`)",
        f"",
        f"- **Run**: `{run_name}`",
        f"- **Dataset**: `{dataset}` ({imgsz}px input resolution)",
        f"- **Operating Threshold**: `{op_thresh}` (detections below are dropped by engine)",
        f"- **Default Review Threshold**: `{def_rev}` (kept detections below raise `lowConfidence`)",
        f"- **Privacy Rule**: coverage ≥ 70% with padding expansion (0.1 default)",
        f"- **Whitelist**: None (baseline benchmark without whitelist)",
        f"",
    ]

    for class_key, title, subset_name in [
        ("face", "Face Review Warning Evaluation", "WIDER FACE subset"),
        ("plate", "License Plate Review Warning Evaluation", "Vietnamese License Plates subset"),
    ]:
        m = eval_res["metrics"][class_key]
        tot_img = m["total_images"]
        leaky = m["leaky_images"]
        leaky_nt = m["leaky_images_no_tiny"]
        silent = m["silent_misses"]
        wi = m["what_if"]

        lines.extend([
            f"## {title} ({subset_name})",
            f"",
            f"### Overview",
            f"- **Images**: {tot_img}",
            f"- **Ground Truth Targets**: {m['total_gt']} valid targets ({m['total_gt_no_tiny']} with width ≥ 16 px)",
            f"- **Leaky Images (All)**: {leaky} / {tot_img} ({leaky / tot_img:.1%})" if tot_img else f"- **Leaky Images (All)**: 0",
            f"- **Leaky Images (≥16 px)**: {leaky_nt} / {tot_img} ({leaky_nt / tot_img:.1%})" if tot_img else f"- **Leaky Images (≥16 px)**: 0",
            f"- **Silent Misses (All)**: {silent['count']} / {leaky} leaky images ({silent['share']:.1%}) have NO detection down to 0.05",
            f"- **Silent Misses (≥16 px)**: {silent['count_no_tiny']} / {leaky_nt} leaky images ({silent['share_no_tiny']:.1%})",
            f"",
            f"### Review Threshold Sweep",
            f"",
            f"| Review Threshold (R) | Flagged | Flag Rate | Caught Leaks (All) | Catch Rate (All) | Flag Precision (All) | Caught Leaks (≥16px) | Catch Rate (≥16px) | Flag Precision (≥16px) |",
            f"| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ])

        for s in m["sweep"]:
            r_str = f"**{s['threshold']:.2f} (default)**" if s["is_default"] else f"{s['threshold']:.2f}"
            fl_cnt = s["flagged_count"]
            fl_rate = f"{s['flag_rate']:.4f}"
            c_all = f"{s['caught_all_count']} / {leaky}"
            cr_all = f"{s['catch_rate_all']:.4f}"
            p_all = f"{s['precision_all']:.4f}"
            c_nt = f"{s['caught_no_tiny_count']} / {leaky_nt}"
            cr_nt = f"{s['catch_rate_no_tiny']:.4f}"
            p_nt = f"{s['precision_no_tiny']:.4f}"
            lines.append(
                f"| {r_str} | {fl_cnt} | {fl_rate} | {c_all} | {cr_all} | {p_all} | {c_nt} | {cr_nt} | {p_nt} |"
            )

        # What-if row
        lines.append(
            f"| *What-If (0.20 ≤ conf < {def_rev:.2f})* | *{wi['flagged_count']}* | *{wi['flag_rate']:.4f}* | "
            f"*{wi['caught_all_count']} / {leaky}* | *{wi['catch_rate_all']:.4f}* | *{wi['precision_all']:.4f}* | "
            f"*{wi['caught_no_tiny_count']} / {leaky_nt}* | *{wi['catch_rate_no_tiny']:.4f}* | *{wi['precision_no_tiny']:.4f}* |"
        )
        lines.extend([
            f"",
            f"*Note: The What-If row models the effect if detections between 0.20 and operating threshold ({op_thresh:.2f}) also raised the warning flag (clearly labelled scenario, not a recommendation).* ",
            f"",
            f"### Calibration by Confidence Bin",
            f"",
            f"| Confidence Bin | Detection Count | True Positives (IoU ≥ 0.5) | TP Share (Precision) | Protecting Detections (Cov ≥ 70%) | Protection Share |",
            f"| --- | --- | --- | --- | --- | --- |",
        ])

        for cal in m["calibration"]:
            lines.append(
                f"| {cal['bin']} | {cal['count']} | {cal['tp_count']} | {cal['tp_share']:.4f} | {cal['protect_count']} | {cal['protect_share']:.4f} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def write_single_review_report(
    run_dir: str, eval_res: Dict[str, Any]
) -> Tuple[str, str]:
    """Write review.json and review.md in run directory."""
    json_path = os.path.join(run_dir, "review.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(eval_res, f, indent=2)

    md_path = os.path.join(run_dir, "review.md")
    content = format_single_markdown(eval_res)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)

    return json_path, md_path


def generate_combined_review_report(
    eval_results: List[Dict[str, Any]], out_path: str
) -> None:
    """Generate combined review warning markdown report across runs."""
    notes_block = [
        "> Review Warning (`reviewThreshold` → `lowConfidence` → `needsReview`) Evaluation Summary:",
        "> - Warning Mechanism: Engine drops detections < operatingThreshold (default 0.35); kept detections get lowConfidence = confidence < reviewThreshold (default 0.50). Web flags image as needsReview if any kept detection has lowConfidence (no whitelist in benchmark).",
        "> - Leaks: An image has a leak if any non-ignored ground truth target is not privacy-protected (coverage < 70%). Also evaluated excluding tiny targets (< 16 px width).",
        "> - Catch Rate = (flagged ∩ leaky) / leaky: fraction of leaky images caught by the warning.",
        "> - Flag Rate = flagged / all images: fraction of images sent to human review.",
        "> - Flag Precision = (flagged ∩ leaky) / flagged: fraction of flagged images that actually contain a leak.",
        "> - Silent Misses: share of leaky images whose missed targets have NO detection at all down to 0.05 (IoU >= 0.1 or coverage >= 30%); uncatchable by kept detections.",
        "> - What-If: theoretical catch rate if sub-operating detections (0.20 <= conf < 0.35) also raised the warning flag (clearly labelled, not a recommendation).",
        "",
        "## Review Warning Comparison Across Runs (at default reviewThreshold = 0.50)",
        "",
        "| Run | Tool | Input Scale | Class | Images | Leaky (All) | Leaky (≥16px) | Flagged | Flag Rate | Catch Rate (All) | Catch Rate (≥16px) | Flag Precision | Silent Misses (%) | What-If Catch Rate |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    table_rows: List[str] = []

    for r in eval_results:
        meta = r.get("meta", {})
        tool = r.get("tool", "engine")
        run_name = os.path.basename(r.get("run_dir", "").rstrip("/"))
        scale_desc = f"{meta.get('imgsz', 640)}px"

        for class_key, class_name in [("face", "Faces"), ("plate", "Plates")]:
            m = r["metrics"][class_key]
            tot_img = m["total_images"]
            leaky = m["leaky_images"]
            leaky_nt = m["leaky_images_no_tiny"]
            silent = m["silent_misses"]
            wi = m["what_if"]

            def_sweep = next((s for s in m["sweep"] if s["is_default"]), m["sweep"][0])

            fl_cnt = def_sweep["flagged_count"]
            fl_rate = f"{def_sweep['flag_rate']:.4f}"
            cr_all = f"{def_sweep['catch_rate_all']:.4f}"
            cr_nt = f"{def_sweep['catch_rate_no_tiny']:.4f}"
            p_all = f"{def_sweep['precision_all']:.4f}"
            silent_str = f"{silent['share']:.1%}"
            wi_cr = f"{wi['catch_rate_all']:.4f}"

            table_rows.append(
                f"| `{run_name}` | {tool} | {scale_desc} | {class_name} | {tot_img} | {leaky} | {leaky_nt} | "
                f"{fl_cnt} | {fl_rate} | **{cr_all}** | **{cr_nt}** | {p_all} | {silent_str} | *{wi_cr}* |"
            )

    detail_sections: List[str] = [
        "",
        "## Detailed Review Sweep by Run",
        "",
    ]

    for r in eval_results:
        run_name = os.path.basename(r.get("run_dir", "").rstrip("/"))
        detail_sections.append(f"### Run `{run_name}`")
        detail_sections.append("")
        for class_key, class_name in [("face", "Faces (WIDER)"), ("plate", "Plates (VN)")]:
            m = r["metrics"][class_key]
            detail_sections.append(f"#### {class_name} Sweep")
            detail_sections.append("")
            detail_sections.append(
                "| R | Flagged | Flag Rate | Caught (All) | Catch Rate (All) | Precision (All) | Caught (≥16px) | Catch Rate (≥16px) | Precision (≥16px) |"
            )
            detail_sections.append(
                "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
            )
            for s in m["sweep"]:
                r_lbl = f"**{s['threshold']:.2f}***" if s["is_default"] else f"{s['threshold']:.2f}"
                detail_sections.append(
                    f"| {r_lbl} | {s['flagged_count']} | {s['flag_rate']:.4f} | "
                    f"{s['caught_all_count']} | {s['catch_rate_all']:.4f} | {s['precision_all']:.4f} | "
                    f"{s['caught_no_tiny_count']} | {s['catch_rate_no_tiny']:.4f} | {s['precision_no_tiny']:.4f} |"
                )
            wi = m["what_if"]
            detail_sections.append(
                f"| *What-If* | *{wi['flagged_count']}* | *{wi['flag_rate']:.4f}* | "
                f"*{wi['caught_all_count']}* | *{wi['catch_rate_all']:.4f}* | *{wi['precision_all']:.4f}* | "
                f"*{wi['caught_no_tiny_count']}* | *{wi['catch_rate_no_tiny']:.4f}* | *{wi['precision_no_tiny']:.4f}* |"
            )
            detail_sections.append("")

    full_md = "\n".join(notes_block + table_rows + detail_sections) + "\n"
    out_dir = os.path.dirname(os.path.abspath(out_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(full_md)
    print(f"Combined review summary written to: {out_path}")


def main() -> None:
    """CLI entrypoint for review warning evaluation."""
    parser = argparse.ArgumentParser(
        description="Evaluate review warning (reviewThreshold -> needsReview) on saved detections."
    )
    parser.add_argument("run_dirs", nargs="*", help="Run directory/directories to evaluate")
    parser.add_argument("--labels", help="Path to ground truth labels JSONL file")
    parser.add_argument(
        "--operating-threshold",
        type=float,
        default=None,
        help="Operating threshold override (default: 0.35)",
    )
    parser.add_argument(
        "--combine",
        action="store_true",
        help="Combine results across runs into a comparison report",
    )
    parser.add_argument(
        "--out",
        help="Output markdown path for combined summary (default: <parent_dir>/review.md)",
    )

    args = parser.parse_args()

    if not args.run_dirs:
        parser.print_help()
        sys.exit(1)

    # Filter run_dirs: skip non-directories and directories without detections.jsonl
    valid_dirs: List[str] = []
    for rdir in args.run_dirs:
        if not os.path.isdir(rdir):
            print(f"Skipping '{rdir}' (not a directory)")
            continue
        if find_detections(rdir) is None:
            print(f"Skipping '{rdir}' (no detections.jsonl)")
            continue
        valid_dirs.append(rdir)

    if not valid_dirs:
        sys.exit("ERROR: No valid run directories containing detections.jsonl found")

    labels_file = args.labels
    if not labels_file:
        for rdir in valid_dirs:
            first_meta = os.path.join(rdir, "meta.json")
            if os.path.isfile(first_meta):
                with open(first_meta, "r", encoding="utf-8") as f:
                    d = json.load(f).get("dataset", "small")
                bench_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
                cand = os.path.join(bench_root, "dataset", f"labels-{d}.jsonl")
                if os.path.isfile(cand):
                    labels_file = cand
                    break

    if not labels_file or not os.path.isfile(labels_file):
        sys.exit(
            f"ERROR: Ground truth labels file not found: {labels_file}. "
            "Please specify --labels dataset/labels-<set>.jsonl"
        )

    eval_results: List[Dict[str, Any]] = []

    for rdir in valid_dirs:
        print(f"Evaluating review warning for {rdir}...")
        eval_res = evaluate_run_review(
            rdir,
            labels_file,
            operating_threshold_arg=args.operating_threshold,
        )
        json_p, md_p = write_single_review_report(rdir, eval_res)
        eval_results.append(eval_res)

        fm = eval_res["metrics"]["face"]
        pm = eval_res["metrics"]["plate"]
        f_def = next((s for s in fm["sweep"] if s["is_default"]), fm["sweep"][0])
        p_def = next((s for s in pm["sweep"] if s["is_default"]), pm["sweep"][0])

        print(
            f"  Faces: Leaky={fm['leaky_images']}/{fm['total_images']} | "
            f"Flagged={f_def['flagged_count']} (rate={f_def['flag_rate']:.3f}) | "
            f"CatchRate={f_def['catch_rate_all']:.3f} (no-tiny={f_def['catch_rate_no_tiny']:.3f}) | "
            f"Precision={f_def['precision_all']:.3f} | SilentMisses={fm['silent_misses']['share']:.1%}"
        )
        print(
            f"  Plates: Leaky={pm['leaky_images']}/{pm['total_images']} | "
            f"Flagged={p_def['flagged_count']} (rate={p_def['flag_rate']:.3f}) | "
            f"CatchRate={p_def['catch_rate_all']:.3f} | "
            f"Precision={p_def['precision_all']:.3f} | SilentMisses={pm['silent_misses']['share']:.1%}"
        )
        print(f"  Saved: {json_p} and {md_p}")

    if args.combine:
        if args.out:
            out_file = args.out
        else:
            parent_dir = os.path.abspath(os.path.join(eval_results[0]["run_dir"], ".."))
            out_file = os.path.join(parent_dir, "review.md")
        generate_combined_review_report(eval_results, out_file)


if __name__ == "__main__":
    main()
