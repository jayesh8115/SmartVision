"""
SmartVision - SQLAlchemy Database Models (MySQL 8.0+)
Maps 1:1 with database/schema.sql.
"""

from datetime import datetime
from typing import List, Optional
import uuid

try:
    from sqlalchemy import (
        Boolean,
        Column,
        DateTime,
        DECIMAL,
        Enum,
        ForeignKey,
        Integer,
        JSON,
        String,
        Text,
        BigInteger,
        SmallInteger,
        UniqueConstraint,
        Index,
    )
    from sqlalchemy.orm import declarative_base, relationship

    Base = declarative_base()

    class User(Base):
        __tablename__ = "users"

        id = Column(BigInteger, primary_key=True, autoincrement=True)
        user_uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
        username = Column(String(50), unique=True, nullable=False, index=True)
        email = Column(String(255), unique=True, nullable=False, index=True)
        password_hash = Column(String(255), nullable=False)
        full_name = Column(String(100), nullable=True)
        avatar_url = Column(String(512), nullable=True)
        role = Column(Enum("user", "admin", name="user_role_enum"), nullable=False, default="user")
        is_active = Column(Boolean, nullable=False, default=True)
        last_login_at = Column(DateTime, nullable=True)
        created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
        updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

        sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
        images = relationship("ImageRecord", back_populates="user")
        classifications = relationship("Classification", back_populates="user")
        feedback = relationship("ClassificationFeedback", back_populates="user")


    class UserSession(Base):
        __tablename__ = "user_sessions"

        id = Column(BigInteger, primary_key=True, autoincrement=True)
        user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
        refresh_token_hash = Column(String(64), unique=True, nullable=False)
        user_agent = Column(String(512), nullable=True)
        ip_address = Column(String(45), nullable=True)
        expires_at = Column(DateTime, nullable=False)
        revoked = Column(Boolean, nullable=False, default=False)
        created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

        user = relationship("User", back_populates="sessions")


    class ImageRecord(Base):
        __tablename__ = "images"

        id = Column(BigInteger, primary_key=True, autoincrement=True)
        image_uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
        user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
        original_filename = Column(String(255), nullable=False)
        file_size_kb = Column(DECIMAL(10, 2), nullable=False)
        mime_type = Column(String(64), nullable=False)
        width = Column(Integer, nullable=False)
        height = Column(Integer, nullable=False)
        sha256_hash = Column(String(64), nullable=True, index=True)
        storage_backend = Column(Enum("s3", "local", name="storage_backend_enum"), nullable=False, default="s3")
        storage_key = Column(String(512), nullable=False)
        created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

        user = relationship("User", back_populates="images")
        classifications = relationship("Classification", back_populates="image", cascade="all, delete-orphan")


    class Classification(Base):
        __tablename__ = "classifications"

        id = Column(BigInteger, primary_key=True, autoincrement=True)
        classification_uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
        user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
        image_id = Column(BigInteger, ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
        task_type = Column(
            Enum("classification", "explain_gradcam", "ai_detection", name="task_type_enum"),
            nullable=False,
            default="classification",
        )
        model_name = Column(String(120), nullable=False)
        model_backend = Column(String(50), nullable=False, default="imagenet")
        status = Column(Enum("confident", "not_sure", name="status_enum"), nullable=False, default="confident")
        top1_label = Column(String(100), nullable=False, index=True)
        top1_confidence = Column(DECIMAL(6, 5), nullable=False)
        low_confidence = Column(Boolean, nullable=False, default=False)
        inference_ms = Column(DECIMAL(8, 2), nullable=False)
        gradcam_key = Column(String(512), nullable=True)
        ai_verdict = Column(Enum("likely_real", "likely_ai", "uncertain", name="ai_verdict_enum"), nullable=True)
        ai_probability = Column(DECIMAL(6, 5), nullable=True)
        warnings = Column(JSON, nullable=True)
        raw_response = Column(JSON, nullable=True)
        created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

        __table_args__ = (
            Index("idx_classifications_user_history", "user_id", "created_at"),
            Index("idx_classifications_task_date", "task_type", "created_at"),
        )

        user = relationship("User", back_populates="classifications")
        image = relationship("ImageRecord", back_populates="classifications")
        top_k = relationship("ClassificationTopK", back_populates="classification", cascade="all, delete-orphan")
        feedback = relationship("ClassificationFeedback", back_populates="classification", cascade="all, delete-orphan")


    class ClassificationTopK(Base):
        __tablename__ = "classification_top_k"

        id = Column(BigInteger, primary_key=True, autoincrement=True)
        classification_id = Column(BigInteger, ForeignKey("classifications.id", ondelete="CASCADE"), nullable=False, index=True)
        rank_position = Column(SmallInteger, nullable=False)
        label = Column(String(100), nullable=False)
        confidence = Column(DECIMAL(6, 5), nullable=False)

        __table_args__ = (
            UniqueConstraint("classification_id", "rank_position", name="uq_classification_rank"),
            Index("idx_top_k_label_conf", "label", "confidence"),
        )

        classification = relationship("Classification", back_populates="top_k")


    class ClassificationFeedback(Base):
        __tablename__ = "classification_feedback"

        id = Column(BigInteger, primary_key=True, autoincrement=True)
        classification_id = Column(BigInteger, ForeignKey("classifications.id", ondelete="CASCADE"), nullable=False, index=True)
        user_id = Column(BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
        is_correct = Column(Boolean, nullable=False)
        user_suggested_label = Column(String(100), nullable=True)
        comment = Column(Text, nullable=True)
        created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

        classification = relationship("Classification", back_populates="feedback")
        user = relationship("User", back_populates="feedback")

except ImportError:
    # Fallback dummy classes when SQLAlchemy is not installed in runtime environment
    class Base:  # type: ignore
        pass

    class User:  # type: ignore
        pass

    class UserSession:  # type: ignore
        pass

    class ImageRecord:  # type: ignore
        pass

    class Classification:  # type: ignore
        pass

    class ClassificationTopK:  # type: ignore
        pass

    class ClassificationFeedback:  # type: ignore
        pass
