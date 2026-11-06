from functools import lru_cache
import os
from pathlib import Path
from typing import Optional

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:
    from pydantic import BaseSettings  # type: ignore
    SettingsConfigDict = None  # type: ignore

# Absolute path to the backend/ directory — works regardless of CWD.
BASE_DIR = Path(__file__).resolve().parents[1]
_ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    if SettingsConfigDict is not None:
        model_config = SettingsConfigDict(
            env_file=(str(_ENV_FILE), ".env"),
            env_file_encoding="utf-8",
            extra="ignore",
            case_sensitive=False,
        )
    else:
        class Config:
            env_file = (str(_ENV_FILE), ".env")
            env_file_encoding = "utf-8"
            extra = "ignore"
            case_sensitive = False

    app_name: str = "SmartVision API"
    model_backend: str = "imagenet"  # imagenet | custom
    model_path: str = str(BASE_DIR / "models" / "resnet50_cifar100.keras")
    labels_path: str = str(BASE_DIR / "models" / "cifar100_classes.json")
    input_size: int = 224
    preprocess: str = "resnet"  # resnet | rescale
    conf_threshold: float = 0.50
    top_k: int = 5
    max_upload_mb: int = 10
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    use_s3: bool = False
    aws_region: str = "ap-south-1"
    s3_bucket: str = ""
    database_url: Optional[str] = None
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_db: str = "smartvision_db"
    mysql_user: str = "smartvision_user"
    mysql_password: str = ""

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

