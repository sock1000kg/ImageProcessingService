"""Face Whitelist management and embedding caching for Vlogger Mode."""
import io
import logging
from typing import Dict, Any, List, Optional
import numpy as np
import cv2
from PIL import Image

from .face_embedding import FaceEmbedder

logger = logging.getLogger(__name__)


class WhitelistReferenceError(ValueError):
    """Raised when a whitelist reference face image cannot be downloaded, decoded, or contains no face."""
    pass


class WhitelistManager:
    """Manages downloading, face detection, embedding extraction, and caching of whitelist reference faces.

    Caches extracted 512-d embeddings in-memory using reference key as cache key
    to avoid re-downloading and re-computing for multiple images in the same batch.
    """

    def __init__(self, embedder: Optional[FaceEmbedder] = None, max_cache_size: int = 1000):
        self.embedder = embedder or FaceEmbedder()
        self.max_cache_size = max_cache_size
        self._cache: Dict[str, np.ndarray] = {}

    def get_cached_embedding(self, cache_key: str) -> Optional[np.ndarray]:
        """Retrieve cached embedding vector by key."""
        return self._cache.get(cache_key)

    def cache_embedding(self, cache_key: str, embedding: np.ndarray) -> None:
        """Store embedding vector into in-memory cache."""
        if len(self._cache) >= self.max_cache_size:
            # Simple eviction: pop oldest item
            oldest_key = next(iter(self._cache))
            self._cache.pop(oldest_key, None)
        self._cache[cache_key] = embedding

    def clear_cache(self) -> None:
        """Clear all cached embeddings."""
        self._cache.clear()

    def extract_face_from_reference_image(
        self,
        img_bytes: bytes,
        yolo_model: Any,
        class_mapping: Dict[str, str],
        ref_identifier: str = "unknown",
    ) -> np.ndarray:
        """Decode reference image, detect faces with YOLO, and extract embedding for the largest face.

        Args:
            img_bytes: Raw bytes of the reference image.
            yolo_model: YOLO model instance.
            class_mapping: Mapping of YOLO class names to normalized labels ('face').
            ref_identifier: Reference identifier/key for logging and error reporting.

        Returns:
            512-dimensional normalized embedding vector.

        Raises:
            WhitelistReferenceError: If image cannot be decoded or no face is detected.
        """
        if not img_bytes or len(img_bytes) == 0:
            raise WhitelistReferenceError(
                f"Whitelist reference image '{ref_identifier}' is empty (0 bytes)."
            )

        try:
            pil_img = Image.open(io.BytesIO(img_bytes))
            pil_img.load()
            if pil_img.mode != "RGB":
                pil_img = pil_img.convert("RGB")
        except Exception as e:
            raise WhitelistReferenceError(
                f"Cannot identify or decode whitelist reference image '{ref_identifier}': {e}"
            )

        w, h = pil_img.size
        if w <= 0 or h <= 0:
            raise WhitelistReferenceError(
                f"Invalid dimensions for whitelist reference image '{ref_identifier}': {w}x{h}"
            )

        img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        # Detect faces using YOLO
        try:
            results = yolo_model.predict(
                source=pil_img,
                conf=0.25,  # Slightly lower threshold to ensure we don't miss clear reference portraits
                imgsz=640,  # Why: reference photos are large faces, and this keeps matching stable
                verbose=False,
            )
            result = results[0]
        except Exception as e:
            raise WhitelistReferenceError(
                f"YOLO inference failed on whitelist reference image '{ref_identifier}': {e}"
            )

        # Find largest face by bounding box area: (x2 - x1) * (y2 - y1)
        best_box = None
        best_area = -1

        boxes = result.boxes
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                raw_label = yolo_model.names.get(cls_id, str(cls_id))
                norm_label = class_mapping.get(raw_label)

                if norm_label != "face":
                    continue

                xyxy = box.xyxy[0].tolist()
                x1 = max(0, min(w, int(round(xyxy[0]))))
                y1 = max(0, min(h, int(round(xyxy[1]))))
                x2 = max(0, min(w, int(round(xyxy[2]))))
                y2 = max(0, min(h, int(round(xyxy[3]))))

                area = (x2 - x1) * (y2 - y1)
                if area > best_area and (x2 > x1) and (y2 > y1):
                    best_area = area
                    best_box = (x1, y1, x2, y2)

        if best_box is None:
            raise WhitelistReferenceError(
                f"No face detected in whitelist reference image '{ref_identifier}'."
            )

        bx1, by1, bx2, by2 = best_box
        face_roi = img_bgr[by1:by2, bx1:bx2]
        return self.embedder.extract_embedding(face_roi)

    def load_reference_embeddings(
        self,
        faces_specs: List[Dict[str, Any]],
        yolo_model: Any,
        class_mapping: Dict[str, str],
        storage_client: Optional[Any] = None,
    ) -> List[np.ndarray]:
        """Load, extract, and cache embeddings for all reference face specs in params.whitelist.faces.

        Args:
            faces_specs: List of face specs from job params, e.g. [{"bucket": "...", "key": "..."}].
            yolo_model: YOLO model instance.
            class_mapping: Mapping of YOLO class names.
            storage_client: MinIO storage client for downloading reference images.

        Returns:
            List of 512-d normalized embeddings corresponding to faces_specs.

        Raises:
            WhitelistReferenceError: If any reference face fails to download, decode, or has no face.
        """
        embeddings = []

        for idx, spec in enumerate(faces_specs):
            if not isinstance(spec, dict):
                raise WhitelistReferenceError(
                    f"Invalid whitelist face specification at index {idx}: expected object, got {type(spec)}"
                )

            # Check if raw bytes or precomputed embedding was passed directly (useful for tests)
            if "embedding" in spec:
                if isinstance(spec["embedding"], np.ndarray):
                    embeddings.append(spec["embedding"])
                    continue
                elif isinstance(spec["embedding"], (list, tuple)):
                    emb_arr = np.array(spec["embedding"], dtype=np.float32)
                    norm = np.linalg.norm(emb_arr)
                    if norm > 0:
                        emb_arr /= norm
                    embeddings.append(emb_arr)
                    continue

            if "bytes" in spec and isinstance(spec["bytes"], (bytes, bytearray)):
                cache_key = spec.get("key", f"direct_bytes_{idx}")
                cached = self.get_cached_embedding(cache_key)
                if cached is not None:
                    embeddings.append(cached)
                    continue

                emb = self.extract_face_from_reference_image(
                    spec["bytes"], yolo_model, class_mapping, ref_identifier=cache_key
                )
                self.cache_embedding(cache_key, emb)
                embeddings.append(emb)
                continue

            bucket = spec.get("bucket", "uploads")
            key = spec.get("key")
            if not key:
                raise WhitelistReferenceError(
                    f"Whitelist face specification at index {idx} is missing 'key'."
                )

            cache_key = f"{bucket}/{key}"
            cached = self.get_cached_embedding(cache_key)
            if cached is not None:
                logger.debug(f"Whitelist embedding cache HIT for '{cache_key}'")
                embeddings.append(cached)
                continue

            logger.info(f"Whitelist embedding cache MISS for '{cache_key}', downloading from storage...")
            if storage_client is None:
                raise WhitelistReferenceError(
                    f"StorageClient is required to download whitelist reference image '{cache_key}'."
                )

            try:
                img_bytes = storage_client.download_file(bucket, key)
            except Exception as e:
                logger.error(f"Failed to download whitelist reference image '{cache_key}': {e}")
                raise WhitelistReferenceError(
                    f"Failed to download whitelist reference image '{cache_key}': {e}"
                )

            emb = self.extract_face_from_reference_image(
                img_bytes, yolo_model, class_mapping, ref_identifier=cache_key
            )
            self.cache_embedding(cache_key, emb)
            embeddings.append(emb)

        return embeddings
