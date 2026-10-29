FROM python:3.11-slim

# Prevent Python from writing .pyc and buffer stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MODELS_DIR=/app/models

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

# Pre-download AI model weights during build time (so Pods can run completely offline)
RUN mkdir -p /app/models && \
    python -c "from ultralytics import YOLO; YOLO('yolov8n-oiv7.pt')" && \
    mv yolov8n-oiv7.pt /app/models/ 2>/dev/null || true

# Copy source code and local model weights
COPY src/ /app/src/
COPY models/ /app/models/

# Create non-root user (uid 10001) and configure directory permissions for Kubernetes securityContext
RUN useradd -u 10001 -m -s /bin/bash appuser && \
    mkdir -p /tmp/Ultralytics /home/appuser/.config /home/appuser/.cache && \
    chown -R appuser:appuser /app /tmp /home/appuser

# Run as non-root user (uid 10001)
USER 10001

# Default entrypoint
CMD ["python", "-m", "src.main"]
