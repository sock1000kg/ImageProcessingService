"""Tests for YuNet-based face alignment in FaceEmbedder (runnable as a script)."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.face_embedding import FaceEmbedder, ARCFACE_TEMPLATE, align_face

MODELS_DIR = os.environ.get("MODELS_DIR", "models")


def test_align_identity():
    rng = np.random.RandomState(0)
    img = rng.randint(0, 255, (112, 112, 3), dtype=np.uint8)
    out = align_face(img, ARCFACE_TEMPLATE)
    assert out is not None and out.shape == (112, 112, 3)
    assert np.abs(out.astype(int) - img.astype(int)).max() <= 1
    print("✅ align identity")


def test_missing_align_model_matches_resize():
    emb = FaceEmbedder(models_dir=MODELS_DIR, align_model="does_not_exist.onnx")
    rng = np.random.RandomState(1)
    crop = rng.randint(0, 255, (150, 130, 3), dtype=np.uint8)
    got = emb.extract_embedding(crop)
    ref = FaceEmbedder(models_dir=MODELS_DIR)
    ref._align = lambda _img: None  # old path: plain resize
    assert np.allclose(got, ref.extract_embedding(crop), atol=1e-6)
    print("✅ missing align model falls back")


def test_no_face_falls_back():
    emb = FaceEmbedder(models_dir=MODELS_DIR)
    vec = emb.extract_embedding(np.full((160, 160, 3), 128, dtype=np.uint8))
    assert vec.shape == (512,)
    assert abs(float(np.linalg.norm(vec)) - 1.0) < 1e-4
    print("✅ no-face crop falls back")


if __name__ == "__main__":
    test_align_identity()
    test_missing_align_model_matches_resize()
    test_no_face_falls_back()
    print("🎉 face alignment tests passed")
