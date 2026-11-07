"""Unit tests for Face Whitelisting / Vlogger Mode (Milestone 2).

Tests:
1. FaceEmbedder: embedding shape (512,), L2 normalization, cosine similarity calculation.
2. WhitelistManager & Cache: in-memory caching by key, avoiding duplicate downloads/extractions.
3. WhitelistReferenceError: empty, corrupt reference images, or images with no detectable face.
4. Two-Person Scenario (Vlogger Mode): 1 whitelisted face + 1 stranger:
   - Whitelisted face: whitelisted=True, redacted=False, similarity >= threshold, whitelistRef=0.
   - Stranger face: whitelisted=False, redacted=True, similarity < threshold, no whitelistRef.
   - Outside & whitelisted face pixels preserved, stranger face redacted.
5. Contract §3B Compliance: counts.whitelistedFace, counts.redacted, similarity field on every face.
"""
import io
import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import numpy as np
import cv2
from PIL import Image

# Ensure engine directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.processors.face_embedding import FaceEmbedder
from src.processors.whitelist import WhitelistManager, WhitelistReferenceError
from src.processors.image_redact import ImageRedactProcessor


class MockStorageClient:
    """Mock MinIO client for testing whitelist downloading and caching."""

    def __init__(self, objects: dict = None):
        self.objects = objects or {}
        self.download_counts = {}

    def download_file(self, bucket: str, key: str) -> bytes:
        cache_key = f"{bucket}/{key}"
        self.download_counts[cache_key] = self.download_counts.get(cache_key, 0) + 1
        if key in self.objects:
            return self.objects[key]
        if cache_key in self.objects:
            return self.objects[cache_key]
        raise ValueError(f"Object not found in mock storage: {cache_key}")


def create_solid_image(w=200, h=200, color=(128, 128, 128)) -> bytes:
    """Create a simple solid JPEG image."""
    img = Image.new("RGB", (w, h), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def test_face_embedder_basics():
    print("--- [TEST 1] FaceEmbedder: Output Shape, Norm & Cosine Similarity ---")
    embedder = FaceEmbedder(model_name="w600k_mbf.onnx")

    # Create dummy face crops
    crop1 = np.random.randint(50, 200, (112, 112, 3), dtype=np.uint8)
    crop2 = np.random.randint(50, 200, (112, 112, 3), dtype=np.uint8)

    emb1 = embedder.extract_embedding(crop1)
    emb2 = embedder.extract_embedding(crop2)

    assert emb1.shape == (512,), f"Expected shape (512,), got {emb1.shape}"
    assert emb2.shape == (512,), f"Expected shape (512,), got {emb2.shape}"

    norm1 = np.linalg.norm(emb1)
    norm2 = np.linalg.norm(emb2)
    assert abs(norm1 - 1.0) < 1e-4, f"Embedding is not unit normalized: {norm1}"
    assert abs(norm2 - 1.0) < 1e-4, f"Embedding is not unit normalized: {norm2}"

    self_sim = embedder.compute_similarity(emb1, emb1)
    assert abs(self_sim - 1.0) < 1e-4, f"Self-similarity should be 1.0, got {self_sim}"

    diff_sim = embedder.compute_similarity(emb1, emb2)
    assert 0.0 <= diff_sim <= 1.0, f"Similarity out of range [0, 1]: {diff_sim}"

    print(f"  ✅ Embedding shape: {emb1.shape}, L2-norm: {norm1:.4f}")
    print(f"  ✅ Self-similarity: {self_sim:.4f}, Random crop similarity: {diff_sim:.4f}")
    print("=> TEST 1 PASSED!\n")


def test_whitelist_cache_and_mock_storage():
    print("--- [TEST 2] WhitelistManager: In-Memory Embedding Cache ---")
    embedder = FaceEmbedder(model_name="w600k_mbf.onnx")
    manager = WhitelistManager(embedder=embedder)

    ref_key = "batch-1/whitelist/face-1.jpg"
    ref_emb = np.random.randn(512).astype(np.float32)
    ref_emb /= np.linalg.norm(ref_emb)

    mock_storage = MockStorageClient()

    # Pass precomputed embedding in spec (simulating cached or injected vector)
    specs = [{"bucket": "uploads", "key": ref_key, "embedding": ref_emb}]
    loaded = manager.load_reference_embeddings(specs, yolo_model=None, class_mapping={}, storage_client=mock_storage)

    assert len(loaded) == 1
    assert np.array_equal(loaded[0], ref_emb)
    print("  ✅ Direct embedding spec loaded successfully.")

    # Test cache mechanism with cache_embedding
    cache_key = f"uploads/{ref_key}"
    manager.cache_embedding(cache_key, ref_emb)
    cached_vec = manager.get_cached_embedding(cache_key)
    assert cached_vec is not None
    assert np.array_equal(cached_vec, ref_emb)

    # Calling load_reference_embeddings with only bucket & key should hit cache and NOT call storage
    specs2 = [{"bucket": "uploads", "key": ref_key}]
    loaded2 = manager.load_reference_embeddings(specs2, yolo_model=None, class_mapping={}, storage_client=mock_storage)
    assert len(loaded2) == 1
    assert np.array_equal(loaded2[0], ref_emb)
    assert mock_storage.download_counts.get(cache_key, 0) == 0, "Storage download was called despite cache hit!"

    print("  ✅ Cache HIT confirmed: 0 storage downloads performed.")
    print("=> TEST 2 PASSED!\n")


def test_whitelist_reference_errors():
    print("--- [TEST 3] WhitelistReferenceError: Invalid / Empty / No-Face Reference ---")
    embedder = FaceEmbedder(model_name="w600k_mbf.onnx")
    manager = WhitelistManager(embedder=embedder)

    processor = ImageRedactProcessor(model_name="yolov8n-oiv7.pt", face_embedder=embedder, whitelist_manager=manager)

    # 1. Empty bytes
    try:
        manager.extract_face_from_reference_image(b"", processor.model, processor.class_mapping, "empty.jpg")
        assert False, "Should have raised WhitelistReferenceError for empty bytes"
    except WhitelistReferenceError as e:
        print(f"  ✅ Empty image correctly raised WhitelistReferenceError: {e}")

    # 2. Corrupt bytes
    try:
        manager.extract_face_from_reference_image(b"INVALID_IMAGE_DATA", processor.model, processor.class_mapping, "corrupt.jpg")
        assert False, "Should have raised WhitelistReferenceError for corrupt bytes"
    except WhitelistReferenceError as e:
        print(f"  ✅ Corrupt data correctly raised WhitelistReferenceError: {e}")

    # 3. Solid image without any face
    solid_no_face = create_solid_image(w=200, h=200, color=(200, 200, 200))
    try:
        manager.extract_face_from_reference_image(solid_no_face, processor.model, processor.class_mapping, "solid_no_face.jpg")
        assert False, "Should have raised WhitelistReferenceError for image with no face"
    except WhitelistReferenceError as e:
        print(f"  ✅ Image without face correctly raised WhitelistReferenceError: {e}")

    print("=> TEST 3 PASSED!\n")


class MockYOLOBox:
    def __init__(self, cls_id, conf, xyxy):
        self.cls = [type("Tensor", (), {"item": lambda: cls_id})]
        self.conf = [type("Tensor", (), {"item": lambda: conf})]
        self.xyxy = [type("Tensor", (), {"tolist": lambda: xyxy})]


class MockYOLOResult:
    def __init__(self, boxes):
        self.boxes = boxes


class MockYOLOModel:
    def __init__(self, boxes):
        self.names = {0: "Human face", 1: "Vehicle registration plate"}
        self._boxes = boxes

    def predict(self, source, conf=0.35, imgsz=640, verbose=False):
        return [MockYOLOResult(self._boxes)]


def test_vlogger_mode_two_persons():
    print("--- [TEST 4] Vlogger Mode: 1 Whitelisted Face + 1 Stranger Face ---")

    # Generate two distinct synthetic embeddings
    np.random.seed(42)
    known_face_emb = np.random.randn(512).astype(np.float32)
    known_face_emb /= np.linalg.norm(known_face_emb)

    stranger_face_emb = np.random.randn(512).astype(np.float32)
    stranger_face_emb /= np.linalg.norm(stranger_face_emb)

    # Subclass FaceEmbedder to return our controlled vectors for the two face regions
    class ControlledEmbedder(FaceEmbedder):
        def __init__(self):
            super().__init__(model_name="w600k_mbf.onnx")

        def extract_embedding(self, face_bgr: np.ndarray) -> np.ndarray:
            # Distinguish based on average color / location
            mean_val = np.mean(face_bgr)
            if mean_val > 150:
                # Face 0 (Known): bright texture
                return known_face_emb.copy()
            else:
                # Face 1 (Stranger): darker texture
                return stranger_face_emb.copy()

    controlled_embedder = ControlledEmbedder()
    whitelist_manager = WhitelistManager(embedder=controlled_embedder)

    processor = ImageRedactProcessor(
        model_name="yolov8n-oiv7.pt",
        face_embedder=controlled_embedder,
        whitelist_manager=whitelist_manager,
    )

    # Create an image with 2 face boxes:
    # Face 0 (known): [40, 40, 100, 100], bright
    # Face 1 (stranger): [160, 40, 220, 100], dark
    w, h = 300, 200
    img = np.full((h, w, 3), 100, dtype=np.uint8)
    img[40:100, 40:100] = 220  # Bright -> triggers known_face_emb
    img[40:100, 160:220] = 50   # Dark -> triggers stranger_face_emb

    # Encode to JPEG bytes
    _, buf = cv2.imencode(".jpg", img)
    input_bytes = buf.tobytes()

    # Mock YOLO to return the 2 face boxes
    mock_boxes = [
        MockYOLOBox(cls_id=0, conf=0.92, xyxy=[40, 40, 100, 100]),   # Known
        MockYOLOBox(cls_id=0, conf=0.88, xyxy=[160, 40, 220, 100]),  # Stranger
    ]
    processor.model = MockYOLOModel(mock_boxes)

    # Job parameters with known face in whitelist
    params = {
        "redaction": {"targets": ["face"], "style": "blackout", "padding": 0.0},
        "confidenceThresholds": {"face": 0.35, "plate": 0.35},
        "reviewThreshold": 0.50,
        "whitelist": {
            "faces": [
                {"bucket": "uploads", "key": "batch-1/whitelist/face-1.jpg", "embedding": known_face_emb}
            ],
            "similarityThreshold": 0.60,
        },
    }

    out_bytes, summary, mime = processor.process(input_bytes, params=params, output_key="result.jpg")

    # 1. Check summary counts
    counts = summary["counts"]
    assert counts["face"] == 2, f"Expected 2 faces, got {counts['face']}"
    assert counts["whitelistedFace"] == 1, f"Expected 1 whitelisted face, got {counts['whitelistedFace']}"
    assert counts["redacted"] == 1, f"Expected 1 redacted target, got {counts['redacted']}"

    # 2. Check detections
    detections = summary["detections"]
    assert len(detections) == 2

    # Face 0 (Known):
    det_known = next(d for d in detections if d["box"] == [40, 40, 100, 100])
    assert det_known["whitelisted"] is True
    assert det_known["redacted"] is False
    assert det_known["whitelistRef"] == 0
    assert det_known["similarity"] >= 0.60
    print(f"  ✅ Whitelisted Face: similarity={det_known['similarity']}, whitelisted=True, redacted=False, ref={det_known['whitelistRef']}")

    # Face 1 (Stranger):
    det_stranger = next(d for d in detections if d["box"] == [160, 40, 220, 100])
    assert det_stranger["whitelisted"] is False
    assert det_stranger["redacted"] is True
    assert "whitelistRef" not in det_stranger
    assert det_stranger["similarity"] < 0.60
    print(f"  ✅ Stranger Face: similarity={det_stranger['similarity']}, whitelisted=False, redacted=True")

    # 3. Verify pixel preservation vs redaction
    out_img = cv2.imdecode(np.frombuffer(out_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)

    # Whitelisted face (40..100, 40..100) must NOT be redacted (it was bright 220)
    whitelisted_crop = out_img[40:100, 40:100]
    assert np.mean(whitelisted_crop) > 180, "Whitelisted face was incorrectly modified or redacted!"

    # Stranger face (40..100, 160..220) must be blacked out (near zeros due to JPEG lossy compression)
    stranger_crop = out_img[40:100, 160:220]
    assert np.max(stranger_crop) <= 5, f"Stranger face was not blacked out! Max value: {np.max(stranger_crop)}"

    print("  ✅ Visual verification: Whitelisted face preserved, stranger face redacted!")
    print("=> TEST 4 PASSED!\n")


if __name__ == "__main__":
    print("==================================================")
    print("🚀 BẮT ĐẦU CHẠY BỘ UNIT TEST MILESTONE 2 (WHITELIST)")
    print("==================================================")
    test_face_embedder_basics()
    test_whitelist_cache_and_mock_storage()
    test_whitelist_reference_errors()
    test_vlogger_mode_two_persons()
    print("==================================================")
    print("🎉 TẤT CẢ UNIT TESTS MILESTONE 2 ĐỀU ĐẠT CHUẨN 100%!")
    print("==================================================")
