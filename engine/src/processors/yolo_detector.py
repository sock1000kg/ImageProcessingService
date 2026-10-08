"""YOLOv8 Object Detection Processor."""
import io
import time
import logging
from typing import Tuple, Dict, Any
from PIL import Image
from ultralytics import YOLO
from .base import BaseProcessor

logger = logging.getLogger(__name__)


import os

class YoloDetectorProcessor(BaseProcessor):
    def __init__(self, model_name: str = "yolov8n.pt"):
        """Load YOLO model weights into RAM ONCE at worker startup."""
        # Check if user already placed a model in model/ or models/
        candidate_paths = [
            "model/yolov8m.pt",
            "models/yolov8m.pt",
            "model/yolov8n.pt",
            "models/yolov8n.pt",
            model_name,
        ]
        chosen_model = model_name
        for p in candidate_paths:
            if os.path.exists(p):
                chosen_model = p
                break

        logger.info(f"Initializing YOLO model from: {chosen_model}...")
        self.model = YOLO(chosen_model)
        logger.info(f"YOLO model ({chosen_model}) loaded successfully!")

    def process(self, input_bytes: bytes, params: Dict[str, Any]) -> Tuple[bytes, Dict[str, Any], str]:
        start_time = time.perf_counter()
        
        # Read confidence threshold from params or default to 0.45
        conf_threshold = float(params.get("confidenceThreshold", 0.45))
        
        # Load image from bytes
        image = Image.open(io.BytesIO(input_bytes)).convert("RGB")
        
        # Run inference
        results = self.model(image, conf=conf_threshold)
        result = results[0]
        
        # Plot bounding boxes onto image
        plotted_bgr = result.plot()
        plotted_img = Image.fromarray(plotted_bgr)
        
        # Save output as JPEG bytes
        output_buffer = io.BytesIO()
        plotted_img.save(output_buffer, format="JPEG", quality=90)
        output_bytes = output_buffer.getvalue()
        
        # Collect detected object labels and details
        boxes = result.boxes
        detected_labels = []
        details = []
        
        if boxes is not None:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                label = self.model.names.get(cls_id, str(cls_id))
                conf = round(float(box.conf[0].item()), 4)
                xyxy = [round(float(coord), 1) for coord in box.xyxy[0].tolist()]
                
                detected_labels.append(label)
                details.append({
                    "label": label,
                    "confidence": conf,
                    "box": xyxy,
                })
        
        processing_time_ms = round((time.perf_counter() - start_time) * 1000)
        
        result_summary = {
            "objectsDetected": len(detected_labels),
            "labels": detected_labels,
            "details": details,
            "processingTimeMs": processing_time_ms,
        }
        
        logger.info(f"YOLO Detection complete: {len(detected_labels)} objects found in {processing_time_ms}ms")
        return output_bytes, result_summary, "image/jpeg"
