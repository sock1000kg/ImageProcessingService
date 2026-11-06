#!/usr/bin/env python3
"""Unit tests for review warning evaluation (reviewThreshold -> lowConfidence -> needsReview).

Python 3 stdlib only (unittest).
Verifies:
1. Low-confidence detection over missed face: flagged and leaky.
2. High-confidence correct detections: not flagged, not leaky.
3. Silent miss: leaky image with no detection down to 0.05 counted as silent.
4. Calibration bins on a known set: detection counts, TP share, and GT protection share.
5. Monotonic R sweep: flag rate and caught counts never decrease as reviewThreshold R rises.
6. What-if row: detections in [0.20, operating_threshold) raise flag and increase catch rate.
7. Tiny face handling: excluding GT targets with width < 16 px.
8. Single and combined report generation (review.json and review.md with notes block).
"""

import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from review import (
    CALIBRATION_BINS,
    evaluate_review_for_class,
    evaluate_run_review,
    format_single_markdown,
    generate_combined_review_report,
    write_single_review_report,
)


class TestReviewEvaluation(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_review_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_low_confidence_detection_over_missed_face_flagged_and_leaky(self):
        """Image with low-confidence detection (0.40) insufficiently covering a face -> flagged & leaky."""
        labels = {
            "img1.jpg": {
                "image": "img1.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [100, 100, 200, 200], "ignore": False}],
            }
        }
        # Det box [100, 100, 130, 130] has low coverage (< 70%) over [100, 100, 200, 200]
        # Confidence 0.40 >= operating threshold 0.35, but < default reviewThreshold 0.50
        dets = {
            "img1.jpg": [
                {"label": "face", "box": [100, 100, 130, 130], "confidence": 0.40}
            ]
        }

        res = evaluate_review_for_class(
            "face", labels, dets, operating_threshold=0.35, default_review_threshold=0.50
        )

        self.assertEqual(res["total_images"], 1)
        self.assertEqual(res["leaky_images"], 1)

        # At default R = 0.50
        def_sweep = next(s for s in res["sweep"] if s["is_default"])
        self.assertEqual(def_sweep["flagged_count"], 1)
        self.assertEqual(def_sweep["flag_rate"], 1.0)
        self.assertEqual(def_sweep["caught_all_count"], 1)
        self.assertEqual(def_sweep["catch_rate_all"], 1.0)
        self.assertEqual(def_sweep["precision_all"], 1.0)

    def test_high_confidence_correct_detections_not_flagged_not_leaky(self):
        """Image with only high-confidence (0.85) accurate detection -> not flagged, not leaky."""
        labels = {
            "img2.jpg": {
                "image": "img2.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [100, 100, 200, 200], "ignore": False}],
            }
        }
        dets = {
            "img2.jpg": [
                {"label": "face", "box": [100, 100, 200, 200], "confidence": 0.85}
            ]
        }

        res = evaluate_review_for_class(
            "face", labels, dets, operating_threshold=0.35, default_review_threshold=0.50
        )

        self.assertEqual(res["total_images"], 1)
        self.assertEqual(res["leaky_images"], 0)

        def_sweep = next(s for s in res["sweep"] if s["is_default"])
        self.assertEqual(def_sweep["flagged_count"], 0)
        self.assertEqual(def_sweep["flag_rate"], 0.0)
        self.assertEqual(def_sweep["caught_all_count"], 0)
        self.assertEqual(def_sweep["catch_rate_all"], 0.0)

    def test_silent_miss_counted_as_silent(self):
        """Leaky image with no detection touching missed face down to 0.05 is counted as silent miss."""
        labels = {
            "silent.jpg": {
                "image": "silent.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [100, 100, 200, 200], "ignore": False}],
            },
            "candidate.jpg": {
                "image": "candidate.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [100, 100, 200, 200], "ignore": False}],
            },
        }
        # silent.jpg: detection is far away [800, 800, 900, 900], no overlap with face
        # candidate.jpg: sub-threshold detection at [100, 100, 180, 180] with conf 0.15 (touches face)
        dets = {
            "silent.jpg": [
                {"label": "face", "box": [800, 800, 900, 900], "confidence": 0.10}
            ],
            "candidate.jpg": [
                {"label": "face", "box": [100, 100, 180, 180], "confidence": 0.15}
            ],
        }

        res = evaluate_review_for_class(
            "face", labels, dets, operating_threshold=0.35, default_review_threshold=0.50
        )

        self.assertEqual(res["leaky_images"], 2)
        # Only silent.jpg is silent miss (candidate.jpg has a 0.15 candidate detection)
        self.assertEqual(res["silent_misses"]["count"], 1)
        self.assertAlmostEqual(res["silent_misses"]["share"], 0.5, places=4)

    def test_calibration_bins_on_known_set(self):
        """Verify calibration binning, true positives (IoU >= 0.5), and coverage >= 70%."""
        labels = {
            "cal.jpg": {
                "image": "cal.jpg",
                "subset": "wider",
                "boxes": [
                    {"label": "face", "box": [100, 100, 200, 200], "ignore": False},
                    {"label": "face", "box": [300, 300, 400, 400], "ignore": False},
                ],
            }
        }
        # Predictions in different bins:
        # 1. conf 0.08: matches [100, 100, 200, 200] with IoU 1.0 (TP & protects)
        # 2. conf 0.15: bogus [600, 600, 700, 700] (FP & doesn't protect)
        # 3. conf 0.45: matches [300, 300, 400, 400] with IoU 1.0 (TP & protects)
        # 4. conf 0.75: bogus [700, 700, 800, 800] (FP & doesn't protect)
        dets = {
            "cal.jpg": [
                {"label": "face", "box": [100, 100, 200, 200], "confidence": 0.08},
                {"label": "face", "box": [600, 600, 700, 700], "confidence": 0.15},
                {"label": "face", "box": [300, 300, 400, 400], "confidence": 0.45},
                {"label": "face", "box": [700, 700, 800, 800], "confidence": 0.75},
            ]
        }

        res = evaluate_review_for_class("face", labels, dets, operating_threshold=0.35)
        cal = {c["bin"]: c for c in res["calibration"]}

        # Bin 0.05–0.10: 1 detection, TP=1, protects=1
        self.assertEqual(cal["0.05–0.10"]["count"], 1)
        self.assertEqual(cal["0.05–0.10"]["tp_count"], 1)
        self.assertEqual(cal["0.05–0.10"]["protect_count"], 1)

        # Bin 0.10–0.20: 1 detection, TP=0, protects=0
        self.assertEqual(cal["0.10–0.20"]["count"], 1)
        self.assertEqual(cal["0.10–0.20"]["tp_count"], 0)
        self.assertEqual(cal["0.10–0.20"]["protect_count"], 0)

        # Bin 0.40–0.50: 1 detection, TP=1, protects=1
        self.assertEqual(cal["0.40–0.50"]["count"], 1)
        self.assertEqual(cal["0.40–0.50"]["tp_count"], 1)
        self.assertEqual(cal["0.40–0.50"]["protect_count"], 1)

        # Bin 0.70–0.80: 1 detection, TP=0, protects=0
        self.assertEqual(cal["0.70–0.80"]["count"], 1)
        self.assertEqual(cal["0.70–0.80"]["tp_count"], 0)
        self.assertEqual(cal["0.70–0.80"]["protect_count"], 0)

    def test_r_sweep_monotonic(self):
        """Verify that flag rate and caught counts never decrease as review threshold R increases."""
        labels = {}
        dets = {}
        # 10 images with varying detection confidences
        confs = [0.36, 0.42, 0.48, 0.52, 0.58, 0.64, 0.72, 0.81, 0.89, 0.94]
        for idx, conf in enumerate(confs):
            fn = f"img_{idx}.jpg"
            labels[fn] = {
                "image": fn,
                "subset": "wider",
                "boxes": [{"label": "face", "box": [100, 100, 200, 200], "ignore": False}],
            }
            # Slightly shifted box so it has < 70% coverage -> leaky
            dets[fn] = [
                {"label": "face", "box": [100, 100, 130, 130], "confidence": conf}
            ]

        res = evaluate_review_for_class("face", labels, dets, operating_threshold=0.35)
        sweep = res["sweep"]
        self.assertGreaterEqual(len(sweep), 5)

        for i in range(1, len(sweep)):
            prev = sweep[i - 1]
            curr = sweep[i]
            # Flag rate must be monotonically non-decreasing
            self.assertGreaterEqual(
                curr["flag_rate"],
                prev["flag_rate"],
                f"Flag rate decreased from R={prev['threshold']} to R={curr['threshold']}",
            )
            # Flagged count must be non-decreasing
            self.assertGreaterEqual(curr["flagged_count"], prev["flagged_count"])
            # Caught leaks must be non-decreasing
            self.assertGreaterEqual(curr["caught_all_count"], prev["caught_all_count"])
            self.assertGreaterEqual(curr["catch_rate_all"], prev["catch_rate_all"])

    def test_what_if_row(self):
        """Verify what-if scenario where detections in [0.20, 0.35) also raise the warning flag."""
        labels = {
            "img_wi.jpg": {
                "image": "img_wi.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [100, 100, 200, 200], "ignore": False}],
            }
        }
        # Detection at 0.25 is dropped by engine at operating threshold 0.35
        # Under normal R=0.50, image has no kept detections -> not flagged
        # Under what-if, 0.25 flags the image
        dets = {
            "img_wi.jpg": [
                {"label": "face", "box": [100, 100, 130, 130], "confidence": 0.25}
            ]
        }

        res = evaluate_review_for_class(
            "face", labels, dets, operating_threshold=0.35, default_review_threshold=0.50
        )
        def_sweep = next(s for s in res["sweep"] if s["is_default"])
        self.assertEqual(def_sweep["flagged_count"], 0)
        self.assertEqual(def_sweep["catch_rate_all"], 0.0)

        # What-if flags the image and catches the leak
        wi = res["what_if"]
        self.assertEqual(wi["flagged_count"], 1)
        self.assertEqual(wi["caught_all_count"], 1)
        self.assertEqual(wi["catch_rate_all"], 1.0)

    def test_tiny_face_filtering(self):
        """Verify that tiny GT faces (width < 16 px) are excluded in leaky_images_no_tiny."""
        labels = {
            "tiny.jpg": {
                "image": "tiny.jpg",
                "subset": "wider",
                # Box width is 10px (< 16px)
                "boxes": [{"label": "face", "box": [50, 50, 60, 60], "ignore": False}],
            }
        }
        dets = {"tiny.jpg": []}

        res = evaluate_review_for_class("face", labels, dets, operating_threshold=0.35)
        self.assertEqual(res["leaky_images"], 1)
        self.assertEqual(res["leaky_images_no_tiny"], 0)

    def test_single_and_combined_reports(self):
        """Verify writing review.json, review.md, and combined report with '>' block."""
        run_dir = os.path.join(self.test_dir, "test_run_640")
        os.makedirs(run_dir, exist_ok=True)

        meta = {"dataset": "small", "imgsz": 640}
        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f)

        # Labels file
        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        with open(labels_file, "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "image": "face1.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [100, 100, 200, 200], "ignore": False}],
            }) + "\n")
            f.write(json.dumps({
                "image": "plate1.jpg",
                "subset": "vn",
                "boxes": [{"label": "plate", "box": [50, 50, 150, 90], "ignore": False}],
            }) + "\n")

        # Detections file
        with open(os.path.join(run_dir, "detections.jsonl"), "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "original_filename": "face1.jpg",
                "detections": [{"label": "face", "box": [100, 100, 140, 140], "confidence": 0.42}],
            }) + "\n")
            f.write(json.dumps({
                "original_filename": "plate1.jpg",
                "detections": [{"label": "plate", "box": [50, 50, 150, 90], "confidence": 0.88}],
            }) + "\n")

        eval_res = evaluate_run_review(run_dir, labels_file, operating_threshold_arg=0.35)
        json_path, md_path = write_single_review_report(run_dir, eval_res)

        self.assertTrue(os.path.isfile(json_path))
        self.assertTrue(os.path.isfile(md_path))

        with open(json_path, "r", encoding="utf-8") as f:
            loaded_json = json.load(f)
        self.assertIn("metrics", loaded_json)
        self.assertIn("face", loaded_json["metrics"])
        self.assertIn("plate", loaded_json["metrics"])

        with open(md_path, "r", encoding="utf-8") as f:
            md_text = f.read()
        self.assertIn("Review Warning Evaluation", md_text)
        self.assertIn("Face Review Warning Evaluation", md_text)
        self.assertIn("License Plate Review Warning Evaluation", md_text)

        # Test combined report
        combined_out = os.path.join(self.test_dir, "review_summary.md")
        generate_combined_review_report([eval_res], combined_out)
        self.assertTrue(os.path.isfile(combined_out))

        with open(combined_out, "r", encoding="utf-8") as f:
            comb_text = f.read()
        self.assertTrue(comb_text.startswith("> Review Warning"))
        self.assertIn("## Review Warning Comparison Across Runs", comb_text)

    def test_combine_skips_non_directory_and_missing_detections(self):
        """Verify --combine skips plain files like comparison.md or dirs without detections.jsonl."""
        import subprocess

        base_dir = os.path.join(self.test_dir, "combine_skip_test")
        os.makedirs(base_dir, exist_ok=True)

        # 1. Valid run directory
        run1 = os.path.join(base_dir, "run1")
        os.makedirs(run1, exist_ok=True)
        with open(os.path.join(run1, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"dataset": "small", "imgsz": 640}, f)
        with open(os.path.join(run1, "detections.jsonl"), "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "original_filename": "face1.jpg",
                "detections": [{"label": "face", "box": [10, 10, 50, 50], "confidence": 0.42}],
            }) + "\n")

        # 2. Plain file matching the glob (e.g. comparison.md)
        comp_file = os.path.join(base_dir, "comparison.md")
        with open(comp_file, "w", encoding="utf-8") as f:
            f.write("# Dummy comparison\n")

        # 3. Directory without detections.jsonl
        empty_dir = os.path.join(base_dir, "empty_dir")
        os.makedirs(empty_dir, exist_ok=True)

        # Labels file
        labels_file = os.path.join(base_dir, "labels.jsonl")
        with open(labels_file, "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "image": "face1.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [10, 10, 50, 50], "ignore": False}],
            }) + "\n")

        combined_out = os.path.join(base_dir, "combined_review.md")
        review_script = os.path.join(os.path.dirname(__file__), "review.py")

        # Run review.py passing run1, comparison.md, and empty_dir (simulating glob match)
        proc = subprocess.run(
            [
                "python3", review_script,
                "--combine",
                run1, comp_file, empty_dir,
                "--labels", labels_file,
                "--out", combined_out,
            ],
            capture_output=True,
            text=True,
        )

        self.assertEqual(proc.returncode, 0, f"review.py failed: {proc.stderr}")
        self.assertIn("Skipping", proc.stdout)
        self.assertIn("comparison.md", proc.stdout)
        self.assertIn("empty_dir", proc.stdout)
        self.assertTrue(os.path.isfile(combined_out), "combined_review.md was not written")
        with open(combined_out, "r", encoding="utf-8") as f:
            comb_text = f.read()
        self.assertIn("Review Warning", comb_text)
        self.assertIn("run1", comb_text)


if __name__ == "__main__":
    unittest.main()
