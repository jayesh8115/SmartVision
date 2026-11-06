"""Optional AWS S3 storage for uploads. Off unless USE_S3=true."""
import base64
import logging
import uuid
from typing import Optional

from app.config import Settings

log = logging.getLogger(__name__)


def save_upload(settings: Settings, data: bytes, filename: str, content_type: str) -> Optional[str]:
    if not settings.use_s3 or not settings.s3_bucket:
        return None
    import boto3  # credentials come from env vars or the EC2 IAM role

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    key = f"uploads/{uuid.uuid4().hex}.{ext}"
    boto3.client("s3", region_name=settings.aws_region).put_object(
        Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type or "image/jpeg"
    )
    return key


def save_heatmap(settings: Settings, png_base64: str) -> Optional[str]:
    """Store the Grad-CAM overlay under gradcam/. Never raises: a failed upload must not break /explain."""
    if not settings.use_s3 or not settings.s3_bucket:
        return None
    try:
        import boto3

        key = f"gradcam/{uuid.uuid4().hex}.png"
        boto3.client("s3", region_name=settings.aws_region).put_object(
            Bucket=settings.s3_bucket,
            Key=key,
            Body=base64.b64decode(png_base64),
            ContentType="image/png",
        )
        return key
    except Exception:
        log.exception("Grad-CAM heatmap upload to S3 failed")
        return None