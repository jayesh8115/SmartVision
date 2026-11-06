"""
SmartVision - Database Engine & Session Management
Provides SQLAlchemy session lifecycle for FastAPI dependency injection.
"""

from typing import Generator
import logging
from app.config import get_settings

log = logging.getLogger(__name__)

settings = get_settings()

db_url = settings.database_url
if not db_url and settings.mysql_password:
    db_url = (
        f"mysql+pymysql://{settings.mysql_user}:{settings.mysql_password}@"
        f"{settings.mysql_host}:{settings.mysql_port}/{settings.mysql_db}?charset=utf8mb4"
    )

engine = None
SessionLocal = None

if db_url:
    try:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        engine = create_engine(
            db_url,
            pool_pre_ping=True,      # Recycle stale connections
            pool_recycle=3600,       # Recycle connections older than 1 hr
            pool_size=10,            # Maintain up to 10 connections
            max_overflow=20,         # Allow temporary bursts
        )
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    except Exception as e:
        log.warning("Could not initialize SQLAlchemy engine with %s: %s", db_url, e)


def get_db() -> Generator:
    """FastAPI Dependency for obtaining transactional database sessions."""
    if SessionLocal is None:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

