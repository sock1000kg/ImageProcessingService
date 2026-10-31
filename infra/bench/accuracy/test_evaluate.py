#!/usr/bin/env python3
"""Unit-style tests for detection quality and privacy recall evaluation.

Python 3 stdlib only (unittest).
Verifies:
1. Perfect predictions: P = R = AP = 1.0.
2. Shifted box: IoU < 0.5 -> FP + FN, but still privacy-protected if coverage >= 70%.
3. Ignore boxes: WIDER invalid=1 not counted in valid GT; predictions matching ignore boxes are neither TP nor FP.
4. Size buckets: tiny (<16px), small (16-32px), medium (32-96px), large (>96px) counts and recall.
5. Deface license plates: plate metrics report "not supported" and recall 0.
6. Combined markdown: generates valid report with '>' notes block at top.
"""

import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from evaluate import (
    evaluate_run,
    generate_combined_report,
    compute_iou,
    compute_coverage,
    load_labels,
    manifest_path_to_filename,
)


class TestAccuracyEvaluation(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_eval_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_compute_iou(self):
        """Test compute_iou with various box geometries, bottom edge differences, and shift."""
        # 1. Different bottom edges: [0, 0, 10, 10] vs [0, 0, 10, 100] -> 0.1
        box1 = [0, 0, 10, 10]
        box2 = [0, 0, 10, 100]
        iou1 = compute_iou(box1, box2)
        self.assertAlmostEqual(iou1, 0.1, places=6)
        self.assertGreaterEqual(iou1, 0.0)
        self.assertLessEqual(iou1, 1.0)

        # Reverse order symmetry
        iou1_rev = compute_iou(box2, box1)
        self.assertAlmostEqual(iou1_rev, 0.1, places=6)

        # 2. Vertically shifted box: [0, 0, 10, 10] vs [0, 5, 10, 15]
        # Inter: [0, 5, 10, 10] area = 50. Union: 100 + 100 - 50 = 150. IoU = 50 / 150 = 1/3
        box3 = [0, 5, 10, 15]
        iou2 = compute_iou(box1, box3)
        self.assertAlmostEqual(iou2, 1.0 / 3.0, places=6)
        self.assertGreaterEqual(iou2, 0.0)
        self.assertLessEqual(iou2, 1.0)

        # 3. Disjoint boxes -> 0.0
        box_disjoint = [20, 20, 30, 30]
        iou_disjoint = compute_iou(box1, box_disjoint)
        self.assertEqual(iou_disjoint, 0.0)

        # 4. Identical boxes -> 1.0
        iou_identical = compute_iou(box1, [0, 0, 10, 10])
        self.assertAlmostEqual(iou_identical, 1.0, places=6)

        # 5. Invalid / inverted boxes -> 0.0
        iou_invalid = compute_iou([10, 10, 0, 0], [0, 0, 10, 10])
        self.assertEqual(iou_invalid, 0.0)

    def test_load_labels_valid_prefix(self):
        """Test that load_labels prefixes valid_ for Dataset/Valid/ to avoid collision."""
        labels_file = os.path.join(self.test_dir, "test_prefix.jsonl")
        with open(labels_file, "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "image": "ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset/Dataset/Test/1.jpg",
                "subset": "vn",
                "boxes": [{"label": "plate", "box": [10, 10, 50, 50], "ignore": False}],
            }) + "\n")
            f.write(json.dumps({
                "image": "ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset/Dataset/Valid/1.jpg",
                "subset": "vn",
                "boxes": [{"label": "plate", "box": [20, 20, 60, 60], "ignore": False}],
            }) + "\n")
        mapping = load_labels(labels_file)
        self.assertIn("1.jpg", mapping)
        self.assertIn("valid_1.jpg", mapping)
        self.assertEqual(mapping["1.jpg"]["boxes"][0]["box"], [10, 10, 50, 50])
        self.assertEqual(mapping["valid_1.jpg"]["boxes"][0]["box"], [20, 20, 60, 60])
        self.assertEqual(len(mapping), 2)

    def test_manifest_path_to_filename(self):
        """Verify mapping manifest paths to local filenames for all subsets."""
        self.assertEqual(
            manifest_path_to_filename("WIDER_val/images/0--Parade/0_Parade_0_102.jpg"),
            "0_Parade_0_102.jpg",
        )
        self.assertEqual(
            manifest_path_to_filename("Dataset/Test/1.jpg"),
            "1.jpg",
        )
        self.assertEqual(
            manifest_path_to_filename("Dataset/Valid/1.jpg"),
            "valid_1.jpg",
        )

    def test_manifest_images_unique_and_exist(self):
        """Verify that small (100), large (1000), and max (3726) manifests yield unique filenames.
        If images directories exist, verify that all filenames exist on disk.
        """
        import subprocess

        bench_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        dataset_dir = os.path.join(bench_dir, "dataset")
        eval_script = os.path.join(os.path.dirname(__file__), "evaluate.py")

        sets = [
            ("images.txt", 100, "images"),
            ("images-1000.txt", 1000, "images-1000"),
            ("images-max.txt", 3726, "images-max"),
        ]

        for manifest_name, expected_count, img_folder in sets:
            manifest_path = os.path.join(dataset_dir, manifest_name)
            self.assertTrue(os.path.isfile(manifest_path), f"Manifest {manifest_name} missing")

            res = subprocess.run(
                ["python3", eval_script, "--list-images", manifest_path],
                capture_output=True,
                text=True,
                check=True,
            )
            names = [line.strip() for line in res.stdout.splitlines() if line.strip()]
            self.assertEqual(
                len(names),
                expected_count,
                f"{manifest_name} produced {len(names)} names, expected {expected_count}",
            )
            self.assertEqual(
                len(set(names)),
                expected_count,
                f"{manifest_name} contains duplicate filenames!",
            )

            folder_path = os.path.join(dataset_dir, img_folder)
            if os.path.isdir(folder_path):
                missing_on_disk = [
                    n for n in names if not os.path.isfile(os.path.join(folder_path, n))
                ]
                self.assertEqual(
                    len(missing_on_disk),
                    0,
                    f"{manifest_name}: {len(missing_on_disk)} images missing in {img_folder}: {missing_on_disk[:5]}",
                )

    def test_perfect_predictions(self):
        """Perfect predictions must yield P = R = AP = 1.0 and Privacy Recall = 1.0."""
        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        run_dir = os.path.join(self.test_dir, "run_perfect")
        os.makedirs(run_dir, exist_ok=True)

        labels = [
            {
                "image": "WIDER_val/images/test_face.jpg",
                "subset": "wider",
                "boxes": [
                    {"label": "face", "box": [100, 100, 200, 200], "ignore": False},
                    {"label": "face", "box": [300, 300, 450, 450], "ignore": False},
                ],
            },
            {
                "image": "Dataset/Test/test_plate.jpg",
                "subset": "vn",
                "boxes": [
                    {"label": "plate", "box": [50, 50, 150, 100], "ignore": False},
                ],
            },
        ]
        with open(labels_file, "w", encoding="utf-8") as f:
            for l in labels:
                f.write(json.dumps(l) + "\n")

        dets = [
            {
                "original_filename": "test_face.jpg",
                "image_size": [800, 800],
                "detections": [
                    {"label": "face", "confidence": 0.95, "box": [100, 100, 200, 200]},
                    {"label": "face", "confidence": 0.90, "box": [300, 300, 450, 450]},
                ],
            },
            {
                "original_filename": "test_plate.jpg",
                "image_size": [640, 480],
                "detections": [
                    {"label": "plate", "confidence": 0.88, "box": [50, 50, 150, 100]},
                ],
            },
        ]
        with open(os.path.join(run_dir, "detections.jsonl"), "w", encoding="utf-8") as f:
            for d in dets:
                f.write(json.dumps(d) + "\n")

        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"mode": "fixed", "padding": 0.1}, f)

        res = evaluate_run(run_dir, labels_file, operating_threshold_arg=0.35)
        fm = res["metrics"]["face"]
        pm = res["metrics"]["plate"]

        self.assertAlmostEqual(fm["ap50"], 1.0, places=4)
        self.assertAlmostEqual(fm["operating"]["precision"], 1.0, places=4)
        self.assertAlmostEqual(fm["operating"]["recall"], 1.0, places=4)
        self.assertAlmostEqual(fm["operating"]["f1"], 1.0, places=4)
        self.assertAlmostEqual(fm["privacy_recall"], 1.0, places=4)

        self.assertAlmostEqual(pm["ap50"], 1.0, places=4)
        self.assertAlmostEqual(pm["operating"]["precision"], 1.0, places=4)
        self.assertAlmostEqual(pm["operating"]["recall"], 1.0, places=4)
        self.assertAlmostEqual(pm["operating"]["f1"], 1.0, places=4)
        self.assertAlmostEqual(pm["privacy_recall"], 1.0, places=4)

    def test_shifted_box_privacy_protected(self):
        """One shifted box with IoU < 0.5 results in FP + FN, but still privacy-protected if coverage >= 70%."""
        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        run_dir = os.path.join(self.test_dir, "run_shifted")
        os.makedirs(run_dir, exist_ok=True)

        # GT box: 100x100 square
        labels = [
            {
                "image": "WIDER_val/images/img1.jpg",
                "subset": "wider",
                "boxes": [
                    {"label": "face", "box": [100, 100, 200, 200], "ignore": False},
                ],
            }
        ]
        with open(labels_file, "w", encoding="utf-8") as f:
            for l in labels:
                f.write(json.dumps(l) + "\n")

        # Shifted box: [135, 100, 240, 200].
        # IoU with [100, 100, 200, 200] is 6500 / 14000 = 0.464 < 0.5.
        # With padding 0.1 (pad_x=11), redacted box is [124, 90, 251, 210].
        # Intersection with GT is 76 * 100 = 7600 -> coverage 76% >= 70%.
        dets = [
            {
                "original_filename": "img1.jpg",
                "image_size": [500, 500],
                "detections": [
                    {"label": "face", "confidence": 0.85, "box": [135, 100, 240, 200]},
                ],
            }
        ]
        with open(os.path.join(run_dir, "detections.jsonl"), "w", encoding="utf-8") as f:
            for d in dets:
                f.write(json.dumps(d) + "\n")

        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"mode": "fixed", "padding": 0.1}, f)

        res = evaluate_run(run_dir, labels_file, operating_threshold_arg=0.35)
        fm = res["metrics"]["face"]

        # Detection should fail IoU >= 0.5: 0 TP, 1 FP, 1 FN
        self.assertEqual(fm["operating"]["tp"], 0)
        self.assertEqual(fm["operating"]["fp"], 1)
        self.assertEqual(fm["operating"]["fn"], 1)
        self.assertAlmostEqual(fm["operating"]["recall"], 0.0, places=4)

        # But privacy coverage is 76% >= 70%, so privacy recall must be 1.0!
        self.assertAlmostEqual(fm["privacy_recall"], 1.0, places=4)

    def test_ignore_boxes_not_counted(self):
        """Ignore boxes (e.g. WIDER invalid=1) must not be counted as valid GT and matching them is neither TP nor FP."""
        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        run_dir = os.path.join(self.test_dir, "run_ignore")
        os.makedirs(run_dir, exist_ok=True)

        labels = [
            {
                "image": "WIDER_val/images/img_ign.jpg",
                "subset": "wider",
                "boxes": [
                    {"label": "face", "box": [100, 100, 200, 200], "ignore": False},  # valid
                    {"label": "face", "box": [300, 300, 350, 350], "ignore": True},   # ignored (invalid)
                ],
            }
        ]
        with open(labels_file, "w", encoding="utf-8") as f:
            for l in labels:
                f.write(json.dumps(l) + "\n")

        dets = [
            {
                "original_filename": "img_ign.jpg",
                "image_size": [500, 500],
                "detections": [
                    {"label": "face", "confidence": 0.95, "box": [100, 100, 200, 200]},  # TP
                    {"label": "face", "confidence": 0.85, "box": [300, 300, 350, 350]},  # Matches ignore -> neither TP nor FP
                    {"label": "face", "confidence": 0.80, "box": [10, 10, 30, 30]},       # Background -> FP
                ],
            }
        ]
        with open(os.path.join(run_dir, "detections.jsonl"), "w", encoding="utf-8") as f:
            for d in dets:
                f.write(json.dumps(d) + "\n")

        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"mode": "fixed", "padding": 0.1}, f)

        res = evaluate_run(run_dir, labels_file, operating_threshold_arg=0.35)
        fm = res["metrics"]["face"]

        # Only 1 valid GT box
        self.assertEqual(fm["gt_count"], 1)
        # Exactly 1 TP (first pred), 0 for second pred (ignored), 1 FP (third pred)
        self.assertEqual(fm["operating"]["tp"], 1)
        self.assertEqual(fm["operating"]["fp"], 1)
        self.assertEqual(fm["operating"]["fn"], 0)
        self.assertAlmostEqual(fm["operating"]["precision"], 0.5, places=4)
        self.assertAlmostEqual(fm["operating"]["recall"], 1.0, places=4)

    def test_face_size_buckets(self):
        """Verify face size buckets: tiny (<16px), small (16-32px), medium (32-96px), large (>96px)."""
        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        run_dir = os.path.join(self.test_dir, "run_sizes")
        os.makedirs(run_dir, exist_ok=True)

        labels = [
            {
                "image": "WIDER_val/images/img_sizes.jpg",
                "subset": "wider",
                "boxes": [
                    {"label": "face", "box": [10, 10, 22, 22], "ignore": False},     # width 12 (<16 -> tiny)
                    {"label": "face", "box": [50, 50, 75, 75], "ignore": False},     # width 25 (16-32 -> small)
                    {"label": "face", "box": [100, 100, 160, 160], "ignore": False}, # width 60 (32-96 -> medium)
                    {"label": "face", "box": [200, 200, 320, 320], "ignore": False}, # width 120 (>96 -> large)
                ],
            }
        ]
        with open(labels_file, "w", encoding="utf-8") as f:
            for l in labels:
                f.write(json.dumps(l) + "\n")

        # Predictions match medium and large, but miss tiny and small
        dets = [
            {
                "original_filename": "img_sizes.jpg",
                "image_size": [500, 500],
                "detections": [
                    {"label": "face", "confidence": 0.90, "box": [100, 100, 160, 160]},
                    {"label": "face", "confidence": 0.85, "box": [200, 200, 320, 320]},
                ],
            }
        ]
        with open(os.path.join(run_dir, "detections.jsonl"), "w", encoding="utf-8") as f:
            for d in dets:
                f.write(json.dumps(d) + "\n")

        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"mode": "fixed"}, f)

        res = evaluate_run(run_dir, labels_file, operating_threshold_arg=0.35)
        sizes = res["face_sizes"]

        self.assertEqual(sizes["tiny"]["count"], 1)
        self.assertAlmostEqual(sizes["tiny"]["recall"], 0.0, places=4)

        self.assertEqual(sizes["small"]["count"], 1)
        self.assertAlmostEqual(sizes["small"]["recall"], 0.0, places=4)

        self.assertEqual(sizes["medium"]["count"], 1)
        self.assertAlmostEqual(sizes["medium"]["recall"], 1.0, places=4)

        self.assertEqual(sizes["large"]["count"], 1)
        self.assertAlmostEqual(sizes["large"]["recall"], 1.0, places=4)

    def test_deface_plate_not_supported(self):
        """Deface run must report plates as not supported and recall 0."""
        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        run_dir = os.path.join(self.test_dir, "run_deface")
        os.makedirs(run_dir, exist_ok=True)

        labels = [
            {
                "image": "WIDER_val/images/face.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [10, 10, 50, 50], "ignore": False}],
            },
            {
                "image": "Dataset/Test/plate.jpg",
                "subset": "vn",
                "boxes": [{"label": "plate", "box": [20, 20, 80, 50], "ignore": False}],
            },
        ]
        with open(labels_file, "w", encoding="utf-8") as f:
            for l in labels:
                f.write(json.dumps(l) + "\n")

        dets = [
            {
                "original_filename": "face.jpg",
                "image_size": [100, 100],
                "detections": [{"label": "face", "confidence": 0.8, "box": [10, 10, 50, 50]}],
            },
            {
                "original_filename": "plate.jpg",
                "image_size": [100, 100],
                "detections": [],
            },
        ]
        with open(os.path.join(run_dir, "detections.jsonl"), "w", encoding="utf-8") as f:
            for d in dets:
                f.write(json.dumps(d) + "\n")

        with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"tool": "deface", "mode": "deface"}, f)

        res = evaluate_run(run_dir, labels_file)
        self.assertTrue(res["is_deface"])
        pm = res["metrics"]["plate"]
        self.assertFalse(pm["supported"])
        self.assertEqual(pm["operating"]["recall"], 0.0)

    def test_combine_reports(self):
        """Generate combined accuracy report and verify '>' notes block."""
        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        with open(labels_file, "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "image": "WIDER_val/images/img.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [10, 10, 50, 50], "ignore": False}],
            }) + "\n")

        # Create two run dirs
        r1 = os.path.join(self.test_dir, "run1")
        r2 = os.path.join(self.test_dir, "run2")
        os.makedirs(r1, exist_ok=True)
        os.makedirs(r2, exist_ok=True)

        for r, is_def in [(r1, False), (r2, True)]:
            with open(os.path.join(r, "detections.jsonl"), "w", encoding="utf-8") as f:
                f.write(json.dumps({
                    "original_filename": "img.jpg",
                    "image_size": [100, 100],
                    "detections": [{"label": "face", "confidence": 0.9, "box": [10, 10, 50, 50]}],
                }) + "\n")
            with open(os.path.join(r, "meta.json"), "w", encoding="utf-8") as f:
                if is_def:
                    json.dump({"tool": "deface", "mode": "deface", "scale": "640x480"}, f)
                else:
                    json.dump({"mode": "fixed", "padding": 0.1}, f)

        res1 = evaluate_run(r1, labels_file)
        res2 = evaluate_run(r2, labels_file)

        out_md = os.path.join(self.test_dir, "accuracy.md")
        generate_combined_report([res1, res2], out_md)

        self.assertTrue(os.path.isfile(out_md))
        with open(out_md, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertTrue(content.startswith("> Accuracy & Privacy Recall Benchmark Comparison:"))
        self.assertIn("not supported", content)
        self.assertIn("`run1`", content)
        self.assertIn("`run2`", content)

    def test_cli_single_run_and_combine(self):
        """CLI invocation of evaluate.py with single run and --combine mode."""
        import subprocess

        labels_file = os.path.join(self.test_dir, "labels.jsonl")
        with open(labels_file, "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "image": "WIDER_val/images/img.jpg",
                "subset": "wider",
                "boxes": [{"label": "face", "box": [10, 10, 50, 50], "ignore": False}],
            }) + "\n")

        r1 = os.path.join(self.test_dir, "cli_run1")
        os.makedirs(r1, exist_ok=True)
        with open(os.path.join(r1, "detections.jsonl"), "w", encoding="utf-8") as f:
            f.write(json.dumps({
                "original_filename": "img.jpg",
                "image_size": [100, 100],
                "detections": [{"label": "face", "confidence": 0.9, "box": [10, 10, 50, 50]}],
            }) + "\n")
        with open(os.path.join(r1, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"mode": "fixed", "padding": 0.1}, f)

        eval_script = os.path.join(os.path.dirname(__file__), "evaluate.py")

        # 1. Single run CLI
        res = subprocess.run(
            ["python3", eval_script, r1, "--labels", labels_file],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res.returncode, 0, f"CLI single run failed: {res.stderr}")
        self.assertTrue(os.path.isfile(os.path.join(r1, "accuracy.json")))
        self.assertTrue(os.path.isfile(os.path.join(r1, "accuracy.md")))

        # 2. Combine CLI
        out_combined = os.path.join(self.test_dir, "combined_accuracy.md")
        res_comb = subprocess.run(
            ["python3", eval_script, "--combine", r1, "--labels", labels_file, "--out", out_combined],
            capture_output=True,
            text=True,
        )
        self.assertEqual(res_comb.returncode, 0, f"CLI combine failed: {res_comb.stderr}")
        self.assertTrue(os.path.isfile(out_combined))

    def test_help_flags(self):
        """Verify help text of run.sh, deface.sh, and fetch.sh."""
        import subprocess

        bench_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

        # run.sh
        run_res = subprocess.run(
            ["bash", os.path.join(bench_root, "run.sh"), "--help"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(run_res.returncode, 0)
        self.assertIn("--confidence", run_res.stdout)
        self.assertIn("--save-detections", run_res.stdout)
        self.assertIn("--dataset", run_res.stdout)
        self.assertIn("max", run_res.stdout)

        # deface.sh
        def_res = subprocess.run(
            ["bash", os.path.join(bench_root, "compare", "deface.sh"), "--help"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(def_res.returncode, 0)
        self.assertIn("--threshold", def_res.stdout)
        self.assertIn("--scale", def_res.stdout)
        self.assertIn("--save-detections", def_res.stdout)
        self.assertIn("--dataset", def_res.stdout)
        self.assertIn("max", def_res.stdout)

        # fetch.sh
        fetch_res = subprocess.run(
            ["bash", os.path.join(bench_root, "dataset", "fetch.sh"), "--help"],
            capture_output=True,
            text=True,
        )
        self.assertEqual(fetch_res.returncode, 0)
        self.assertIn("--labels", fetch_res.stdout)
        self.assertIn("--set", fetch_res.stdout)
        self.assertIn("max", fetch_res.stdout)


if __name__ == "__main__":
    unittest.main()
