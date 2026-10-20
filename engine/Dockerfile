FROM python:3.11-slim

# Prevent Python from writing .pyc and buffer stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system dependencies for OpenCV and image operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download YOLOv8n-OIV7 (600 classes) weights into image during build time (so Pod can run offline)
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n-oiv7.pt')"

# Copy source code
COPY src/ /app/src/
COPY models/ /app/models/

# Create non-root user (uid 10001) and configure directory permissions for Kubernetes securityContext
RUN useradd -u 10001 -m -s /bin/bash appuser && \
    mkdir -p /tmp/Ultralytics && \
    chown -R appuser:appuser /app /tmp

USER 10001

# Default entrypoint
CMD ["python", "-m", "src.main"]
