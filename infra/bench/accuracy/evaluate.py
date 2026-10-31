#!/usr/bin/env python3
"""Detection quality and privacy recall evaluation for image anonymization benchmarks.

Python 3 stdlib only. No pip dependencies.
Evaluates precision, recall, F1, AP@0.5, and privacy recall (>=70% coverage rule)
for our engine and deface on the same images.

Usage:
    evaluate.py <run_dir> --labels dataset/labels-<set>.jsonl [--operating-threshold T]
    evaluate.py --combine <run_dir1> <run_dir2> ... [--labels <labels_file>] [--out <output_path>]
"""

import argparse
import json
import math
import os
import re
import sys
from typing import Any, Dict, List, Optional, Set, Tuple


def compute_iou(boxA: List[float], boxB: List[float]) -> float:
    """Compute Intersection over Union between two boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0.0, xB - xA)
    inter_h = max(0.0, yB - yA)
    inter_area = inter_w * inter_h

    areaA = max(0.0, boxA[2] - boxA[0]) * max(0.0, boxA[3] - boxA[1])
    areaB = max(0.0, boxB[2] - boxB[0]) * max(0.0, boxB[3] - boxB[1])

    denom = areaA + areaB - inter_area
    return min(1.0, (inter_area / denom)) if denom > 0.0 else 0.0


def compute_coverage(gt_box: List[float], redacted_boxes: List[List[float]]) -> float:
    """Compute fraction of gt_box area covered by the union of redacted_boxes.

    Uses 1D vertical slice decomposition to analytically compute the exact union
    area of intersecting rectangles without rasterization.
    """
    gx1, gy1, gx2, gy2 = gt_box
    gt_area = max(0.0, gx2 - gx1) * max(0.0, gy2 - gy1)
    if gt_area <= 0.0:
        return 0.0

    # Clip all redacted boxes to the GT box boundaries
    clipped: List[Tuple[float, float, float, float]] = []
    for r in redacted_boxes:
        cx1 = max(gx1, float(r[0]))
        cy1 = max(gy1, float(r[1]))
        cx2 = min(gx2, float(r[2]))
        cy2 = min(gy2, float(r[3]))
        if cx2 > cx1 and cy2 > cy1:
            clipped.append((cx1, cy1, cx2, cy2))

    if not clipped:
        return 0.0

    # Coordinate compression along X axis
    x_set: Set[float] = set()
    for c in clipped:
        x_set.add(c[0])
        x_set.add(c[2])
    x_coords = sorted(x_set)

    total_union_area = 0.0
    for i in range(len(x_coords) - 1):
        x_left, x_right = x_coords[i], x_coords[i + 1]
        dx = x_right - x_left
        if dx <= 0.0:
            continue

        # Intervals along Y spanning this X slice
        y_intervals: List[Tuple[float, float]] = []
        for c in clipped:
            if c[0] <= x_left and c[2] >= x_right:
                y_intervals.append((c[1], c[3]))

        if not y_intervals:
            continue

        y_intervals.sort()
        merged_y = 0.0
        cur_y1, cur_y2 = y_intervals[0]
        for y1, y2 in y_intervals[1:]:
            if y1 < cur_y2:
                cur_y2 = max(cur_y2, y2)
            else:
                merged_y += cur_y2 - cur_y1
                cur_y1, cur_y2 = y1, y2
        merged_y += cur_y2 - cur_y1
        total_union_area += dx * merged_y

    return min(1.0, total_union_area / gt_area)


def get_redacted_box(
    box: List[float], is_deface: bool, padding: float = 0.1
) -> List[float]:
    """Compute the expanded redacted area for a detection box.

    For engine: expands box by padding (default 0.1).
    For deface: scales box center by mask_scale 1.3 (approximating ellipse with its bounding box).
    """
    x1, y1, x2, y2 = [float(v) for v in box]
    bw = x2 - x1
    bh = y2 - y1

    if is_deface:
        # deface uses mask_scale 1.3 centered on face
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        new_w = bw * 1.3
        new_h = bh * 1.3
        return [cx - new_w / 2.0, cy - new_h / 2.0, cx + new_w / 2.0, cy + new_h / 2.0]
    else:
        # engine expands by padding (default 0.1)
        pad_x = round(bw * padding)
        pad_y = round(bh * padding)
        return [x1 - pad_x, y1 - pad_y, x2 + pad_x, y2 + pad_y]


def manifest_path_to_filename(manifest_path: str) -> str:
    """Map manifest path to local image filename.

    WIDER FACE and Dataset/Test images retain their basename.
    Dataset/Valid images are prefixed with 'valid_' to prevent collisions
    with duplicate filenames in Dataset/Test.
    """
    base = os.path.basename(manifest_path)
    if "Dataset/Valid/" in manifest_path:
        return f"valid_{base}"
    return base


def load_labels(labels_file: str) -> Dict[str, Dict[str, Any]]:
    """Load normalised labels JSONL file mapped by image filename."""
    labels_by_img: Dict[str, Dict[str, Any]] = {}
    with open(labels_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            img_path = rec.get("image", "")
            key = manifest_path_to_filename(img_path)
            labels_by_img[key] = rec
    return labels_by_img


def load_detections(detections_file: str) -> Dict[str, List[Dict[str, Any]]]:
    """Load detections JSONL file mapped by image filename."""
    dets_by_img: Dict[str, List[Dict[str, Any]]] = {}
    with open(detections_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            fname = rec.get("original_filename") or rec.get("filename") or ""
            if fname:
                dets_by_img[fname] = rec.get("detections", [])
    return dets_by_img


def compute_ap_all_points(recalls: List[float], precisions: List[float]) -> float:
    """Compute AP using all-points interpolation (PASCAL VOC 2010+ / COCO standard)."""
    if not recalls or not precisions:
        return 0.0

    mrec = [0.0] + recalls + [1.0]
    mpre = [0.0] + precisions + [0.0]

    # Monotonic decreasing interpolation from right to left
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])

    # Integrate area under curve
    ap = 0.0
    for i in range(len(mrec) - 1):
        if mrec[i + 1] != mrec[i]:
            ap += (mrec[i + 1] - mrec[i]) * mpre[i + 1]
    return ap


def evaluate_class(
    target_class: str,
    labels_by_img: Dict[str, Dict[str, Any]],
    dets_by_img: Dict[str, List[Dict[str, Any]]],
    is_deface: bool,
    operating_threshold: float,
    padding: float = 0.1,
) -> Dict[str, Any]:
    """Evaluate detection metrics and privacy recall for a single class (face or plate)."""
    allowed_subset = "wider" if target_class == "face" else "vn"

    # Separate GT boxes per image
    valid_gt: Dict[str, List[List[float]]] = {}
    ignore_gt: Dict[str, List[List[float]]] = {}
    total_valid_gt = 0

    # Store GT metadata for size breakdown (faces only)
    gt_details: List[Dict[str, Any]] = []

    for fname, l_rec in labels_by_img.items():
        if l_rec.get("subset") != allowed_subset:
            continue
        v_list = []
        i_list = []
        for b in l_rec.get("boxes", []):
            if b.get("label") != target_class:
                continue
            box = [float(v) for v in b.get("box", [])]
            if b.get("ignore", False):
                i_list.append(box)
            else:
                v_idx = len(v_list)
                v_list.append(box)
                bw = max(0.0, box[2] - box[0])
                gt_details.append({
                    "fname": fname,
                    "gt_idx": v_idx,
                    "box": box,
                    "width": bw,
                })
        valid_gt[fname] = v_list
        ignore_gt[fname] = i_list
        total_valid_gt += len(v_list)

    if is_deface and target_class == "plate":
        return {
            "supported": False,
            "gt_count": total_valid_gt,
            "ap50": 0.0,
            "operating": {
                "threshold": operating_threshold,
                "tp": 0,
                "fp": 0,
                "fn": total_valid_gt,
                "precision": 0.0,
                "recall": 0.0,
                "f1": 0.0,
            },
            "best_f1": {
                "threshold": operating_threshold,
                "precision": 0.0,
                "recall": 0.0,
                "f1": 0.0,
            },
            "privacy_recall": 0.0,
        }

    # Gather predictions across allowed subset images
    all_preds: List[Tuple[float, str, List[float]]] = []
    for fname, l_rec in labels_by_img.items():
        if l_rec.get("subset") != allowed_subset:
            continue
        for det in dets_by_img.get(fname, []):
            if det.get("label") == target_class:
                score = float(det.get("confidence", 0.0))
                box = [float(v) for v in det.get("box", [])]
                all_preds.append((score, fname, box))

    # Sort descending by confidence score
    all_preds.sort(key=lambda p: p[0], reverse=True)

    # 1. Greedy matching for AP@0.5 curve
    matched_gt: Set[Tuple[str, int]] = set()
    tp_flags: List[int] = []
    fp_flags: List[int] = []
    pred_scores: List[float] = []

    for score, fname, p_box in all_preds:
        v_boxes = valid_gt.get(fname, [])
        i_boxes = ignore_gt.get(fname, [])

        best_iou = 0.0
        best_gt_idx = -1
        for idx, g_box in enumerate(v_boxes):
            if (fname, idx) in matched_gt:
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

        if best_iou >= 0.5 and best_iou >= best_ign_iou:
            matched_gt.add((fname, best_gt_idx))
            tp_flags.append(1)
            fp_flags.append(0)
            pred_scores.append(score)
        elif best_ign_iou >= 0.5:
            # Ignored: neither TP nor FP
            tp_flags.append(0)
            fp_flags.append(0)
            pred_scores.append(score)
        else:
            tp_flags.append(0)
            fp_flags.append(1)
            pred_scores.append(score)

    # Compute PR curve points
    recalls: List[float] = []
    precisions: List[float] = []
    cum_tp = 0
    cum_fp = 0
    for tp, fp in zip(tp_flags, fp_flags):
        cum_tp += tp
        cum_fp += fp
        if cum_tp + cum_fp > 0:
            rec = (cum_tp / total_valid_gt) if total_valid_gt > 0 else 0.0
            prec = cum_tp / (cum_tp + cum_fp)
            recalls.append(rec)
            precisions.append(prec)

    ap50 = compute_ap_all_points(recalls, precisions)

    # 2. Match at operating threshold
    op_preds = [p for p in all_preds if p[0] >= operating_threshold]
    matched_gt_op: Set[Tuple[str, int]] = set()
    op_tp = 0
    op_fp = 0

    for score, fname, p_box in op_preds:
        v_boxes = valid_gt.get(fname, [])
        i_boxes = ignore_gt.get(fname, [])

        best_iou = 0.0
        best_gt_idx = -1
        for idx, g_box in enumerate(v_boxes):
            if (fname, idx) in matched_gt_op:
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

        if best_iou >= 0.5 and best_iou >= best_ign_iou:
            matched_gt_op.add((fname, best_gt_idx))
            op_tp += 1
        elif best_ign_iou >= 0.5:
            pass  # neither TP nor FP
        else:
            op_fp += 1

    op_fn = max(0, total_valid_gt - op_tp)
    op_precision = (op_tp / (op_tp + op_fp)) if (op_tp + op_fp) > 0 else 0.0
    op_recall = (op_tp / total_valid_gt) if total_valid_gt > 0 else 0.0
    op_f1 = (
        (2.0 * op_precision * op_recall / (op_precision + op_recall))
        if (op_precision + op_recall) > 0
        else 0.0
    )

    # 3. Find Best-F1 threshold via single sweep over sorted predictions (no subsampling)
    best_thresh = operating_threshold
    best_p = op_precision
    best_r = op_recall
    best_f1 = op_f1

    running_tp = 0
    running_fp = 0
    num_preds = len(pred_scores)
    for i in range(num_preds):
        running_tp += tp_flags[i]
        running_fp += fp_flags[i]
        # Evaluate metrics at distinct score boundaries or at the end
        if i == num_preds - 1 or pred_scores[i] != pred_scores[i + 1]:
            thresh = pred_scores[i]
            p_val = (running_tp / (running_tp + running_fp)) if (running_tp + running_fp) > 0 else 0.0
            r_val = (running_tp / total_valid_gt) if total_valid_gt > 0 else 0.0
            f1_val = (
                (2.0 * p_val * r_val / (p_val + r_val)) if (p_val + r_val) > 0 else 0.0
            )
            if f1_val > best_f1:
                best_f1 = f1_val
                best_thresh = thresh
                best_p = p_val
                best_r = r_val

    # 4. Privacy Recall at operating threshold
    # Precompute redacted boxes per image for predictions >= operating_threshold
    redacted_boxes_by_img: Dict[str, List[List[float]]] = {}
    for score, fname, p_box in op_preds:
        r_box = get_redacted_box(p_box, is_deface=is_deface, padding=padding)
        redacted_boxes_by_img.setdefault(fname, []).append(r_box)

    protected_gt: Set[Tuple[str, int]] = set()
    for item in gt_details:
        fn = item["fname"]
        idx = item["gt_idx"]
        g_box = item["box"]
        r_boxes = redacted_boxes_by_img.get(fn, [])
        cov = compute_coverage(g_box, r_boxes)
        if cov >= 0.70:
            protected_gt.add((fn, idx))

    privacy_recall = (
        (len(protected_gt) / total_valid_gt) if total_valid_gt > 0 else 0.0
    )

    # 5. Face size breakdown (tiny < 16, small 16–32, medium 32–96, large > 96)
    size_breakdown: Optional[Dict[str, Dict[str, Any]]] = None
    if target_class == "face":
        buckets = {
            "tiny": {"min": 0.0, "max": 16.0, "count": 0, "matched": 0, "protected": 0},
            "small": {"min": 16.0, "max": 32.0, "count": 0, "matched": 0, "protected": 0},
            "medium": {"min": 32.0, "max": 96.0, "count": 0, "matched": 0, "protected": 0},
            "large": {"min": 96.0, "max": float("inf"), "count": 0, "matched": 0, "protected": 0},
        }
        for item in gt_details:
            fn = item["fname"]
            idx = item["gt_idx"]
            w = item["width"]
            b_key = "large"
            if w < 16.0:
                b_key = "tiny"
            elif w < 32.0:
                b_key = "small"
            elif w <= 96.0:
                b_key = "medium"

            buckets[b_key]["count"] += 1
            if (fn, idx) in matched_gt_op:
                buckets[b_key]["matched"] += 1
            if (fn, idx) in protected_gt:
                buckets[b_key]["protected"] += 1

        size_breakdown = {}
        for b_name, b_data in buckets.items():
            cnt = b_data["count"]
            r_val = (b_data["matched"] / cnt) if cnt > 0 else 0.0
            pr_val = (b_data["protected"] / cnt) if cnt > 0 else 0.0
            size_breakdown[b_name] = {
                "count": cnt,
                "recall": round(r_val, 4),
                "privacy_recall": round(pr_val, 4),
            }

    return {
        "supported": True,
        "gt_count": total_valid_gt,
        "ap50": round(ap50, 4),
        "operating": {
            "threshold": operating_threshold,
            "tp": op_tp,
            "fp": op_fp,
            "fn": op_fn,
            "precision": round(op_precision, 4),
            "recall": round(op_recall, 4),
            "f1": round(op_f1, 4),
        },
        "best_f1": {
            "threshold": round(best_thresh, 4),
            "precision": round(best_p, 4),
            "recall": round(best_r, 4),
            "f1": round(best_f1, 4),
        },
        "privacy_recall": round(privacy_recall, 4),
        "face_sizes": size_breakdown,
    }


def evaluate_run(
    run_dir: str,
    labels_file: str,
    operating_threshold_arg: Optional[float] = None,
) -> Dict[str, Any]:
    """Evaluate a single run directory and return structured metrics."""
    meta_path = os.path.join(run_dir, "meta.json")
    meta: Dict[str, Any] = {}
    if os.path.isfile(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

    is_deface = meta.get("tool") == "deface" or meta.get("mode") == "deface"

    if operating_threshold_arg is not None:
        op_thresh = operating_threshold_arg
    else:
        op_thresh = 0.2 if is_deface else 0.35

    padding = float(meta.get("padding", 0.1))

    dets_path = os.path.join(run_dir, "detections.jsonl")
    if not os.path.isfile(dets_path):
        raise FileNotFoundError(f"Detections file not found: {dets_path}")

    labels_by_img = load_labels(labels_file)
    dets_by_img = load_detections(dets_path)

    face_metrics = evaluate_class(
        "face",
        labels_by_img,
        dets_by_img,
        is_deface=is_deface,
        operating_threshold=op_thresh,
        padding=padding,
    )
    plate_metrics = evaluate_class(
        "plate",
        labels_by_img,
        dets_by_img,
        is_deface=is_deface,
        operating_threshold=op_thresh,
        padding=padding,
    )

    return {
        "run_dir": run_dir,
        "tool": "deface" if is_deface else "engine",
        "is_deface": is_deface,
        "meta": meta,
        "operating_threshold": op_thresh,
        "metrics": {
            "face": face_metrics,
            "plate": plate_metrics,
        },
        "face_sizes": face_metrics.get("face_sizes", {}),
    }


def write_single_report(run_dir: str, eval_res: Dict[str, Any]) -> None:
    """Write accuracy.json and accuracy.md to the run directory."""
    # 1. accuracy.json
    json_path = os.path.join(run_dir, "accuracy.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(eval_res, f, indent=2)

    # 2. accuracy.md
    md_path = os.path.join(run_dir, "accuracy.md")
    tool_name = eval_res["tool"]
    op_thresh = eval_res["operating_threshold"]
    fm = eval_res["metrics"]["face"]
    pm = eval_res["metrics"]["plate"]
    sizes = eval_res["face_sizes"] or {}

    lines = [
        f"# Detection Accuracy & Privacy Recall Report",
        f"",
        f"- **Tool**: `{tool_name}`",
        f"- **Run Directory**: `{run_dir}`",
        f"- **Operating Threshold**: `{op_thresh}`",
        f"",
        f"## Overall Detection Metrics",
        f"",
        f"| Class | Subset | GT Boxes | AP@0.5 | P (default) | R (default) | F1 (default) | Best Threshold | P (best) | R (best) | F1 (best) | Privacy Recall |",
        f"| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    # Face row
    lines.append(
        f"| Face | wider | {fm['gt_count']} | {fm['ap50']:.4f} | "
        f"{fm['operating']['precision']:.4f} | {fm['operating']['recall']:.4f} | {fm['operating']['f1']:.4f} | "
        f"{fm['best_f1']['threshold']:.4f} | {fm['best_f1']['precision']:.4f} | {fm['best_f1']['recall']:.4f} | "
        f"{fm['best_f1']['f1']:.4f} | **{fm['privacy_recall']:.4f}** |"
    )

    # Plate row
    if pm["supported"]:
        lines.append(
            f"| Plate | vn | {pm['gt_count']} | {pm['ap50']:.4f} | "
            f"{pm['operating']['precision']:.4f} | {pm['operating']['recall']:.4f} | {pm['operating']['f1']:.4f} | "
            f"{pm['best_f1']['threshold']:.4f} | {pm['best_f1']['precision']:.4f} | {pm['best_f1']['recall']:.4f} | "
            f"{pm['best_f1']['f1']:.4f} | **{pm['privacy_recall']:.4f}** |"
        )
    else:
        lines.append(
            f"| Plate | vn | {pm['gt_count']} | not supported | not supported | 0.0000 | not supported | "
            f"- | not supported | 0.0000 | not supported | not supported |"
        )

    lines.extend([
        f"",
        f"## Face Detection by Size",
        f"",
        f"| Size Bucket | GT Width (px) | GT Count | Recall (IoU>=0.5) | Privacy Recall (>=70% cov) |",
        f"| --- | --- | --- | --- | --- |",
    ])

    size_defs = [
        ("tiny", "< 16"),
        ("small", "16–32"),
        ("medium", "32–96"),
        ("large", "> 96"),
    ]
    for key, label in size_defs:
        s_data = sizes.get(key, {})
        lines.append(
            f"| {key.capitalize()} | {label} | {s_data.get('count', 0)} | "
            f"{s_data.get('recall', 0.0):.4f} | {s_data.get('privacy_recall', 0.0):.4f} |"
        )

    lines.append("")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def generate_combined_report(
    eval_results: List[Dict[str, Any]], out_path: str
) -> None:
    """Generate combined accuracy markdown report matching benchmark conventions."""
    notes_block = [
        "> Accuracy & Privacy Recall Benchmark Comparison:",
        "> - Model differences: our engine uses YOLOv8n-oiv7 at 640px letterboxed input; deface uses CenterFace ONNX.",
        "> - Matching rule: greedy matching by confidence score, IoU >= 0.5, each non-ignore GT used at most once.",
        "> - Ignore boxes: WIDER FACE invalid=1 annotations are flagged ignore; predictions matching ignore boxes are neither TP nor FP.",
        "> - Subset scoring: faces are scored exclusively on the WIDER subset; plates exclusively on the VN subset.",
        "> - Privacy recall: a GT target counts as protected if its bounding box area is covered >= 70% by the redacted area.",
        ">   Our engine expands boxes by run padding (0.1 default); deface expands boxes by mask_scale 1.3 (ellipse approximated by its bounding box).",
        "> - deface license plates: deface detects faces only; license plates rows report 'not supported' (recall 0 by design).",
        "",
        "## Overall Detection Quality & Privacy Recall",
        "",
        "| Run | Tool | Input Scale | Faces AP@0.5 | Faces P | Faces R | Faces F1 | Faces Priv Recall | Plates AP@0.5 | Plates P | Plates R | Plates F1 | Plates Priv Recall |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    table_rows = []
    size_rows = []
    best_f1_rows = []

    for r in eval_results:
        meta = r.get("meta", {})
        tool = r.get("tool", "engine")
        run_name = os.path.basename(r.get("run_dir", "").rstrip("/"))
        is_deface = r.get("is_deface", False)

        if is_deface:
            scale_desc = meta.get("scale", "full")
        else:
            scale_desc = "640px"

        fm = r["metrics"]["face"]
        pm = r["metrics"]["plate"]

        # Plates values
        if pm["supported"]:
            p_ap = f"{pm['ap50']:.4f}"
            p_p = f"{pm['operating']['precision']:.4f}"
            p_r = f"{pm['operating']['recall']:.4f}"
            p_f1 = f"{pm['operating']['f1']:.4f}"
            p_priv = f"**{pm['privacy_recall']:.4f}**"
        else:
            p_ap = "not supported"
            p_p = "not supported"
            p_r = "0.0000"
            p_f1 = "not supported"
            p_priv = "not supported"

        table_rows.append(
            f"| `{run_name}` | {tool} | {scale_desc} | "
            f"{fm['ap50']:.4f} | {fm['operating']['precision']:.4f} | {fm['operating']['recall']:.4f} | "
            f"{fm['operating']['f1']:.4f} | **{fm['privacy_recall']:.4f}** | "
            f"{p_ap} | {p_p} | {p_r} | {p_f1} | {p_priv} |"
        )

        # Face size row
        sizes = r.get("face_sizes", {})
        t_s = sizes.get("tiny", {})
        s_s = sizes.get("small", {})
        m_s = sizes.get("medium", {})
        l_s = sizes.get("large", {})

        size_rows.append(
            f"| `{run_name}` | {tool} | "
            f"{t_s.get('recall', 0.0):.3f} / {t_s.get('privacy_recall', 0.0):.3f} | "
            f"{s_s.get('recall', 0.0):.3f} / {s_s.get('privacy_recall', 0.0):.3f} | "
            f"{m_s.get('recall', 0.0):.3f} / {m_s.get('privacy_recall', 0.0):.3f} | "
            f"{l_s.get('recall', 0.0):.3f} / {l_s.get('privacy_recall', 0.0):.3f} |"
        )

        # Best-F1 rows
        best_f1_rows.append(
            f"| `{run_name}` | face | {fm['operating']['threshold']:.2f} | {fm['operating']['f1']:.4f} | "
            f"{fm['best_f1']['threshold']:.4f} | {fm['best_f1']['precision']:.4f} | {fm['best_f1']['recall']:.4f} | {fm['best_f1']['f1']:.4f} |"
        )
        if pm["supported"]:
            best_f1_rows.append(
                f"| `{run_name}` | plate | {pm['operating']['threshold']:.2f} | {pm['operating']['f1']:.4f} | "
                f"{pm['best_f1']['threshold']:.4f} | {pm['best_f1']['precision']:.4f} | {pm['best_f1']['recall']:.4f} | {pm['best_f1']['f1']:.4f} |"
            )

    doc = notes_block + table_rows + [
        "",
        "### Face Recall & Privacy Recall by Size",
        "",
        "| Run | Tool | Tiny (<16px) R / Priv | Small (16–32px) R / Priv | Medium (32–96px) R / Priv | Large (>96px) R / Priv |",
        "| --- | --- | --- | --- | --- | --- |",
    ] + size_rows + [
        "",
        "### Operating Thresholds vs Best-F1",
        "",
        "| Run | Class | Default Thresh | Default F1 | Best Thresh | Best P | Best R | Best F1 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ] + best_f1_rows + [""]

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(doc) + "\n")
    print(f"Combined accuracy report written to {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate detection quality and privacy recall."
    )
    parser.add_argument(
        "run_dirs",
        nargs="*",
        help="Run directory/directories containing detections.jsonl and meta.json",
    )
    parser.add_argument(
        "--labels",
        help="Path to dataset/labels-<set>.jsonl ground truth file",
    )
    parser.add_argument(
        "--operating-threshold",
        type=float,
        default=None,
        help="Override operating confidence threshold (default: 0.35 for engine, 0.2 for deface)",
    )
    parser.add_argument(
        "--combine",
        action="store_true",
        help="Generate a combined comparison table across the provided run directories",
    )
    parser.add_argument(
        "--out",
        help="Output markdown path for combined report (default: machine folder accuracy.md)",
    )
    parser.add_argument(
        "--list-images",
        help="Print local image filenames corresponding to manifest paths in given manifest file",
    )

    args = parser.parse_args()

    if args.list_images:
        if not os.path.isfile(args.list_images):
            sys.exit(f"ERROR: Manifest file not found: {args.list_images}")
        with open(args.list_images, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                if len(parts) < 2:
                    continue
                src_path = parts[1] if re.fullmatch(r"[0-9a-fA-F]{64}", parts[0]) else parts[0]
                print(manifest_path_to_filename(src_path))
        return

    if not args.run_dirs:
        parser.print_help()
        sys.exit(1)

    # Resolve labels file if not passed directly
    labels_file = args.labels
    if not labels_file:
        # Check first run dir meta.json
        first_meta = os.path.join(args.run_dirs[0], "meta.json")
        if os.path.isfile(first_meta):
            with open(first_meta, "r", encoding="utf-8") as f:
                d = json.load(f).get("dataset", "small")
            bench_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
            cand = os.path.join(bench_root, "dataset", f"labels-{d}.jsonl")
            if os.path.isfile(cand):
                labels_file = cand

    if not labels_file or not os.path.isfile(labels_file):
        sys.exit(
            f"ERROR: Ground truth labels file not found: {labels_file}. "
            "Please specify --labels dataset/labels-<set>.jsonl"
        )

    eval_results: List[Dict[str, Any]] = []

    for rdir in args.run_dirs:
        if not os.path.isdir(rdir):
            sys.exit(f"ERROR: Run directory not found: {rdir}")
        print(f"Evaluating {rdir}...")
        eval_res = evaluate_run(
            rdir, labels_file, operating_threshold_arg=args.operating_threshold
        )
        write_single_report(rdir, eval_res)
        eval_results.append(eval_res)

        fm = eval_res["metrics"]["face"]
        pm = eval_res["metrics"]["plate"]
        print(
            f"  Faces: AP@0.5 = {fm['ap50']:.4f} | P = {fm['operating']['precision']:.4f} | "
            f"R = {fm['operating']['recall']:.4f} | F1 = {fm['operating']['f1']:.4f} | "
            f"PrivRecall = {fm['privacy_recall']:.4f}"
        )
        if pm["supported"]:
            print(
                f"  Plates: AP@0.5 = {pm['ap50']:.4f} | P = {pm['operating']['precision']:.4f} | "
                f"R = {pm['operating']['recall']:.4f} | F1 = {pm['operating']['f1']:.4f} | "
                f"PrivRecall = {pm['privacy_recall']:.4f}"
            )
        else:
            print("  Plates: not supported")

    if args.combine:
        # Determine output location
        if args.out:
            out_file = args.out
        else:
            # Common machine directory parent
            parent_dir = os.path.abspath(os.path.join(args.run_dirs[0], ".."))
            out_file = os.path.join(parent_dir, "accuracy.md")
        generate_combined_report(eval_results, out_file)


if __name__ == "__main__":
    main()
