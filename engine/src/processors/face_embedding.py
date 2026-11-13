"""Face Embedding extraction module using lightweight MobileFaceNet / ArcFace ONNX.

Optimized for CPU execution with low RAM footprint (< 35MB) and low latency (< 20ms/face).
Supports both onnxruntime (preferred) and cv2.dnn (zero-dependency fallback).
"""
import os
import logging
import numpy as np
import cv2

logger = logging.getLogger(__name__)

# Where ArcFace expects the eyes, nose tip and mouth corners inside the 112x112 input.
ARCFACE_TEMPLATE = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]],
    dtype=np.float32,
)


def align_face(image_bgr: np.ndarray, points: np.ndarray):
    """Warp `image_bgr` to 112x112 so the 5 landmark `points` land on ARCFACE_TEMPLATE.

    Returns None when no transform can be estimated.
    """
    pts = np.asarray(points, dtype=np.float32).reshape(5, 2)
    matrix, _ = cv2.estimateAffinePartial2D(pts, ARCFACE_TEMPLATE, method=cv2.LMEDS)
    if matrix is None:
        return None
    return cv2.warpAffine(image_bgr, matrix, (112, 112), borderValue=0.0)


class FaceEmbedder:
    """Lightweight 512-d Face Embedding extractor for CPU.

    ArcFace (w600k_mbf) expects faces rotated and scaled so eyes, nose and mouth corners sit on fixed
    positions. Resizing the raw YOLO box loses that (owner kept ~39% of the time on LFW vs ~86% aligned),
    so each crop is aligned with the 5 landmarks from YuNet. If alignment is unavailable (model file
    missing, no face found, bad transform, any error) it logs one warning and falls back to the plain
    resize of the crop.
    """

    def __init__(
        self,
        model_name: str = "w600k_mbf.onnx",
        models_dir: str = "models",
        align_model: str = "yunet.onnx",
    ):
        self.model_name = model_name
        self.models_dir = models_dir
        self.align_model = align_model
        self._detector = None
        self._align_unavailable = False
        self._align_warned = False
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
        self._align_path = os.path.join(os.path.dirname(model_path), align_model)

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

    def _warn_align_once(self, reason: str):
        if not self._align_warned:
            self._align_warned = True
            logger.warning(f"Face alignment unavailable ({reason}); using plain resize (lower accuracy).")

    def _get_detector(self):
        """Load the YuNet landmark detector once; None if the model file is missing."""
        if self._detector is None and not self._align_unavailable:
            if not os.path.isfile(self._align_path):
                self._align_unavailable = True
                self._warn_align_once(f"{self._align_path} not found")
            else:
                self._detector = cv2.FaceDetectorYN.create(self._align_path, "", (320, 320), 0.6)
        return self._detector

    def _align(self, face_bgr: np.ndarray):
        """Return the 112x112 aligned crop, or None to fall back to resize."""
        try:
            detector = self._get_detector()
            if detector is None:
                return None
            h, w = face_bgr.shape[:2]
            ph, pw = h // 2, w // 2
            padded = cv2.copyMakeBorder(face_bgr, ph, ph, pw, pw, cv2.BORDER_REPLICATE)
            detector.setInputSize((padded.shape[1], padded.shape[0]))
            _, faces = detector.detect(padded)
            if faces is None or len(faces) == 0:
                self._warn_align_once("no face found by YuNet in a crop")
                return None
            best = max(faces, key=lambda f: f[2] * f[3])
            aligned = align_face(padded, best[4:14])
            if aligned is None:
                self._warn_align_once("could not estimate the alignment transform")
            return aligned
        except Exception as e:
            self._warn_align_once(f"error: {e}")
            return None

    def extract_embedding(self, face_bgr: np.ndarray) -> np.ndarray:
        """Extract a 512-dimensional normalized face embedding vector from a BGR face crop.

        The crop is aligned to the ArcFace template using YuNet landmarks (see class docstring); when
        that is not possible it falls back to resizing the crop to 112x112.

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
        aligned = self._align(face_bgr)
        if aligned is not None:
            face_resized = aligned
        elif (w, h) != (112, 112):
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
