"""Face Embedding extraction module using lightweight MobileFaceNet / ArcFace ONNX.

Optimized for CPU execution with low RAM footprint (< 35MB) and low latency (< 20ms/face).
Supports both onnxruntime (preferred) and cv2.dnn (zero-dependency fallback).
"""
import os
import logging
import numpy as np
import cv2

logger = logging.getLogger(__name__)


class FaceEmbedder:
    """Lightweight 512-d Face Embedding extractor for CPU."""

    def __init__(self, model_name: str = "w600k_mbf.onnx", models_dir: str = "models"):
        self.model_name = model_name
        self.models_dir = models_dir
        self.session = None
        self.net = None
        self.backend = None

        candidate_paths = [
            os.path.join(models_dir, model_name),
            os.path.join("models", model_name),
            os.path.join("engine", "models", model_name),
            os.path.join("/app", "models", model_name),
            model_name,
            os.path.join("engine", "models", "mobilefacenet.onnx"),
            os.path.join("models", "mobilefacenet.onnx"),
        ]

        model_path = None
        for p in candidate_paths:
            if os.path.exists(p) and os.path.isfile(p):
                model_path = p
                break

        if not model_path:
            raise FileNotFoundError(
                f"Face embedding model '{model_name}' not found in candidate paths: {candidate_paths}"
            )

        self.model_path = model_path
        self._init_runtime(model_path)

    def _init_runtime(self, model_path: str):
        """Initialize ONNX Runtime or cv2.dnn backend."""
        try:
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 2
            opts.inter_op_num_threads = 1
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            self.session = ort.InferenceSession(
                model_path,
                sess_options=opts,
                providers=["CPUExecutionProvider"],
            )
            self.input_name = self.session.get_inputs()[0].name
            self.backend = "onnxruntime"
            logger.info(f"FaceEmbedder initialized with onnxruntime backend from {model_path}")
            return
        except ImportError:
            logger.info("onnxruntime not installed, attempting fallback to cv2.dnn...")
        except Exception as e:
            logger.warning(f"Failed to initialize onnxruntime: {e}, falling back to cv2.dnn...")

        # Fallback to OpenCV DNN module
        try:
            self.net = cv2.dnn.readNetFromONNX(model_path)
            self.backend = "cv2.dnn"
            logger.info(f"FaceEmbedder initialized with cv2.dnn backend from {model_path}")
        except Exception as e:
            logger.error(f"Failed to load ONNX model via cv2.dnn: {e}")
            raise RuntimeError(f"Could not load face embedding model {model_path}: {e}")

    def extract_embedding(self, face_bgr: np.ndarray) -> np.ndarray:
        """Extract a 512-dimensional normalized face embedding vector from a BGR face crop.

        Args:
            face_bgr: Face crop in BGR format (H, W, 3).

        Returns:
            512-dimensional L2-normalized float32 numpy array.
        """
        if face_bgr is None or face_bgr.size == 0:
            raise ValueError("Invalid or empty face crop provided for embedding extraction.")

        h, w = face_bgr.shape[:2]
        if h <= 0 or w <= 0:
            raise ValueError(f"Invalid face crop dimensions: {w}x{h}")

        # Standard ArcFace input dimensions: 112x112
        if (w, h) != (112, 112):
            face_resized = cv2.resize(face_bgr, (112, 112), interpolation=cv2.INTER_LINEAR)
        else:
            face_resized = face_bgr

        if self.backend == "onnxruntime":
            # Convert BGR -> RGB and normalize: (pixel - 127.5) / 127.5
            face_rgb = cv2.cvtColor(face_resized, cv2.COLOR_BGR2RGB).astype(np.float32)
            face_norm = (face_rgb - 127.5) / 127.5
            # Transpose to (1, 3, 112, 112)
            blob = np.transpose(face_norm, (2, 0, 1))[np.newaxis, ...]

            outputs = self.session.run(None, {self.input_name: blob})
            raw_vec = outputs[0].flatten().astype(np.float32)
        else:
            # cv2.dnn fallback
            blob = cv2.dnn.blobFromImage(
                face_resized,
                scalefactor=1.0 / 127.5,
                size=(112, 112),
                mean=(127.5, 127.5, 127.5),
                swapRB=True,
            )
            self.net.setInput(blob)
            out = self.net.forward()
            raw_vec = out.flatten().astype(np.float32)

        # L2 normalize
        norm = np.linalg.norm(raw_vec)
        if norm > 1e-12:
            return raw_vec / norm
        return raw_vec

    @staticmethod
    def compute_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Compute Cosine Similarity between two L2-normalized vectors.

        Clamped to [0.0, 1.0].
        """
        if vec1 is None or vec2 is None:
            return 0.0
        dot = float(np.dot(vec1, vec2))
        return max(0.0, min(1.0, dot))
