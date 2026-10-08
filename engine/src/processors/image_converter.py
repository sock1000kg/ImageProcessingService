"""Image Format Converter & Resizer Processor."""
import io
import time
import logging
from typing import Tuple, Dict, Any
from PIL import Image
from .base import BaseProcessor

logger = logging.getLogger(__name__)


class ImageConverterProcessor(BaseProcessor):
    def process(self, input_bytes: bytes, params: Dict[str, Any]) -> Tuple[bytes, Dict[str, Any], str]:
        start_time = time.perf_counter()
        
        target_format = params.get("targetFormat", "JPEG").upper()
        if target_format == "JPG":
            target_format = "JPEG"
            
        quality = int(params.get("quality", 85))
        target_width = params.get("width")
        target_height = params.get("height")
        
        # Open source image
        image = Image.open(io.BytesIO(input_bytes))
        original_format = image.format or "UNKNOWN"
        original_size = image.size
        original_bytes_len = len(input_bytes)
        
        # If saving as JPEG, convert RGBA to RGB
        if target_format == "JPEG" and image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
            
        # Resize if specified
        if target_width and target_height:
            image = image.resize((int(target_width), int(target_height)), Image.Resampling.LANCZOS)
        elif target_width:
            aspect_ratio = original_size[1] / original_size[0]
            new_height = int(int(target_width) * aspect_ratio)
            image = image.resize((int(target_width), new_height), Image.Resampling.LANCZOS)
        elif target_height:
            aspect_ratio = original_size[0] / original_size[1]
            new_width = int(int(target_height) * aspect_ratio)
            image = image.resize((new_width, int(target_height)), Image.Resampling.LANCZOS)
            
        # Save output bytes
        output_buffer = io.BytesIO()
        image.save(output_buffer, format=target_format, quality=quality)
        output_bytes = output_buffer.getvalue()
        
        processing_time_ms = round((time.perf_counter() - start_time) * 1000)
        
        content_type = f"image/{target_format.lower()}"
        if target_format == "JPEG":
            content_type = "image/jpeg"
            
        result_summary = {
            "originalFormat": original_format,
            "targetFormat": target_format,
            "originalDimensions": [original_size[0], original_size[1]],
            "outputDimensions": [image.size[0], image.size[1]],
            "originalSizeBytes": original_bytes_len,
            "outputSizeBytes": len(output_bytes),
            "processingTimeMs": processing_time_ms,
        }
        
        logger.info(f"Image conversion complete: {original_format} -> {target_format} in {processing_time_ms}ms")
        return output_bytes, result_summary, content_type
