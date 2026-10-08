"""MinIO Storage Client wrapper for Engine."""
import io
import logging
from minio import Minio
from minio.error import S3Error
from .config import settings

logger = logging.getLogger(__name__)


class StorageClient:
    def __init__(self):
        self.client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        logger.info(f"Connected to MinIO at {settings.minio_endpoint}")

    def download_file(self, bucket: str, key: str) -> bytes:
        """Download an object from MinIO and return as raw bytes."""
        try:
            response = self.client.get_object(bucket, key)
            data = response.read()
            response.close()
            response.release_conn()
            logger.info(f"Downloaded {len(data)} bytes from {bucket}/{key}")
            return data
        except S3Error as e:
            logger.error(f"Failed to download from MinIO: {bucket}/{key} - {e}")
            raise

    def upload_file(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload raw bytes to MinIO object storage."""
        try:
            # Ensure bucket exists
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)

            data_stream = io.BytesIO(data)
            self.client.put_object(
                bucket_name=bucket,
                object_name=key,
                data=data_stream,
                length=len(data),
                content_type=content_type,
            )
            logger.info(f"Uploaded {len(data)} bytes to {bucket}/{key}")
            return f"{bucket}/{key}"
        except S3Error as e:
            logger.error(f"Failed to upload to MinIO: {bucket}/{key} - {e}")
            raise
