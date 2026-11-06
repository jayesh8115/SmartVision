-- =============================================================================
-- SmartVision Database Schema (MySQL 8.0+)
-- Production Schema for User Management, Image Uploads, Classification Results,
-- Model Explanations (Grad-CAM), AI Image Detection & Feedback.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS smartvision_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smartvision_db;

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE
-- Stores registered accounts, authentication details, role-based access, and audit info.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_uuid CHAR(36) NOT NULL UNIQUE COMMENT 'Public UUID for APIs and frontend reference',
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL COMMENT 'Bcrypt or Argon2id password hash',
    full_name VARCHAR(100) NULL,
    avatar_url VARCHAR(512) NULL,
    role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_username (username),
    INDEX idx_users_role (role),
    INDEX idx_users_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User profiles and credentials';

-- -----------------------------------------------------------------------------
-- 2. USER SESSIONS / REFRESH TOKENS TABLE (Optional auth session tracking)
-- Stores refresh tokens, device info, and revocation flags for JWT auth.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    refresh_token_hash CHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 hash of refresh token',
    user_agent VARCHAR(512) NULL,
    ip_address VARCHAR(45) NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User sessions and refresh token management';

-- -----------------------------------------------------------------------------
-- 3. IMAGES TABLE
-- Stores uploaded image assets metadata, S3 object keys, dimensions, and hash.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS images (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    image_uuid CHAR(36) NOT NULL UNIQUE COMMENT 'Unique identifier for image access',
    user_id BIGINT UNSIGNED NULL COMMENT 'Null for guest uploads; references users.id if logged in',
    original_filename VARCHAR(255) NOT NULL,
    file_size_kb DECIMAL(10, 2) NOT NULL,
    mime_type VARCHAR(64) NOT NULL COMMENT 'image/jpeg, image/png, image/webp, etc.',
    width INT UNSIGNED NOT NULL,
    height INT UNSIGNED NOT NULL,
    sha256_hash CHAR(64) NULL COMMENT 'Content hash to detect duplicate uploads or cache predictions',
    storage_backend ENUM('s3', 'local') NOT NULL DEFAULT 's3',
    storage_key VARCHAR(512) NOT NULL COMMENT 'S3 object key (e.g., uploads/uuid.jpg) or local filepath',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_images_user (user_id),
    INDEX idx_images_sha256 (sha256_hash),
    INDEX idx_images_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Metadata for images uploaded for inference';

-- -----------------------------------------------------------------------------
-- 4. CLASSIFICATIONS TABLE
-- Main inference record storing predictions, latencies, model info, and warnings.
-- Handles both ImageNet/ResNet-50 predictions, Grad-CAM explanations, and AI detector scans.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    classification_uuid CHAR(36) NOT NULL UNIQUE COMMENT 'Public classification result identifier',
    user_id BIGINT UNSIGNED NULL COMMENT 'User who ran this classification (NULL if guest)',
    image_id BIGINT UNSIGNED NOT NULL COMMENT 'Associated uploaded image',
    task_type ENUM('classification', 'explain_gradcam', 'ai_detection') NOT NULL DEFAULT 'classification',
    model_name VARCHAR(120) NOT NULL COMMENT 'E.g., ResNet-50 (ImageNet pretrained, 1000 classes)',
    model_backend VARCHAR(50) NOT NULL DEFAULT 'imagenet' COMMENT 'imagenet, custom, or clip',
    status ENUM('confident', 'not_sure') NOT NULL DEFAULT 'confident',
    top1_label VARCHAR(100) NOT NULL COMMENT 'Top-1 predicted label (e.g. golden retriever, AI-generated)',
    top1_confidence DECIMAL(6, 5) NOT NULL COMMENT 'Top-1 probability score between 0.00000 and 1.00000',
    low_confidence BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'True if top-1 confidence falls below CONF_THRESHOLD',
    inference_ms DECIMAL(8, 2) NOT NULL COMMENT 'Inference latency in milliseconds',
    gradcam_key VARCHAR(512) NULL COMMENT 'S3 object key for Grad-CAM overlay heatmap (e.g. gradcam/uuid.png)',
    ai_verdict ENUM('likely_real', 'likely_ai', 'uncertain') NULL COMMENT 'Applicable when task_type=ai_detection',
    ai_probability DECIMAL(6, 5) NULL COMMENT 'AI probability score from AI detector',
    warnings JSON NULL COMMENT 'Array of string warning codes, e.g. ["low_resolution"]',
    raw_response JSON NULL COMMENT 'Full JSON response payload for reproducibility and caching',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_top1_conf CHECK (top1_confidence >= 0.00000 AND top1_confidence <= 1.00000),
    CONSTRAINT chk_ai_prob CHECK (ai_probability IS NULL OR (ai_probability >= 0.00000 AND ai_probability <= 1.00000)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
    -- Composite index optimized for the history table query:
    -- SELECT * FROM classifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    INDEX idx_classifications_user_history (user_id, created_at DESC),
    INDEX idx_classifications_image (image_id),
    INDEX idx_classifications_top1 (top1_label),
    INDEX idx_classifications_status (status),
    INDEX idx_classifications_task_date (task_type, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Model inference records and classification outputs';

-- -----------------------------------------------------------------------------
-- 5. CLASSIFICATION TOP-K BREAKDOWN TABLE
-- Normalized storage for Top-K candidate predictions (e.g., Top-3 or Top-5).
-- Allows aggregate class frequency querying, analytics, and precision metrics.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classification_top_k (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    classification_id BIGINT UNSIGNED NOT NULL,
    rank_position TINYINT UNSIGNED NOT NULL COMMENT '1 for Top-1, 2 for Top-2, etc.',
    label VARCHAR(100) NOT NULL,
    confidence DECIMAL(6, 5) NOT NULL COMMENT 'Confidence score between 0.00000 and 1.00000',
    CONSTRAINT chk_top_k_conf CHECK (confidence >= 0.00000 AND confidence <= 1.00000),
    CONSTRAINT uq_classification_rank UNIQUE (classification_id, rank_position),
    FOREIGN KEY (classification_id) REFERENCES classifications(id) ON DELETE CASCADE,
    INDEX idx_top_k_label_conf (label, confidence DESC),
    INDEX idx_top_k_classification (classification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Top-K class candidates per inference';

-- -----------------------------------------------------------------------------
-- 6. CLASSIFICATION FEEDBACK TABLE
-- Collects user/expert corrections on prediction accuracy for active learning.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classification_feedback (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    classification_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL COMMENT 'User providing feedback',
    is_correct BOOLEAN NOT NULL COMMENT '1 if model prediction was correct, 0 if wrong',
    user_suggested_label VARCHAR(100) NULL COMMENT 'Correct label provided by the user',
    comment TEXT NULL COMMENT 'User notes, reasoning, or edge case remarks',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (classification_id) REFERENCES classifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_feedback_classification (classification_id),
    INDEX idx_feedback_user (user_id),
    INDEX idx_feedback_correct (is_correct)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User feedback and ground truth corrections';

-- -----------------------------------------------------------------------------
-- 7. CLASSIFICATION HISTORY VIEW
-- Ready-to-query view perfectly matching the React ClassificationHistory component:
-- Returns image metadata, top-1 label, confidence, status, latency, and timestamp.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_classification_history AS
SELECT 
    c.id AS record_id,
    c.classification_uuid,
    c.user_id,
    u.username,
    u.email,
    i.image_uuid,
    i.original_filename AS image_name,
    i.file_size_kb,
    i.storage_key,
    c.task_type,
    c.model_name,
    c.status,
    c.top1_label,
    c.top1_confidence,
    ROUND(c.top1_confidence * 100, 1) AS confidence_percentage,
    c.low_confidence,
    c.inference_ms,
    c.gradcam_key,
    c.ai_verdict,
    c.ai_probability,
    c.warnings,
    c.created_at AS scan_timestamp
FROM classifications c
JOIN images i ON c.image_id = i.id
LEFT JOIN users u ON c.user_id = u.id;

-- -----------------------------------------------------------------------------
-- 8. SEED DATA (For local development, testing, and validation)
-- -----------------------------------------------------------------------------

-- Sample Users
INSERT INTO users (id, user_uuid, username, email, password_hash, full_name, role)
VALUES 
(1, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'demouser', 'demo@smartvision.io', '$2b$12$e80yq7K3fR/Q6M/uG0oV7.o2u2lFq4mO8hE1f1jP/nJzZ.mN.iF4W', 'Demo User', 'user'),
(2, 'b2c3d4e5-f6a7-8901-bcde-f12345678901', 'admin', 'admin@smartvision.io', '$2b$12$e80yq7K3fR/Q6M/uG0oV7.o2u2lFq4mO8hE1f1jP/nJzZ.mN.iF4W', 'System Administrator', 'admin')
ON DUPLICATE KEY UPDATE username=VALUES(username);

-- Sample Image 1: Golden Retriever
INSERT INTO images (id, image_uuid, user_id, original_filename, file_size_kb, mime_type, width, height, sha256_hash, storage_backend, storage_key)
VALUES 
(1, 'c3d4e5f6-a7b8-9012-cdef-123456789012', 1, 'golden_retriever.jpg', 324.50, 'image/jpeg', 1024, 768, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 's3', 'uploads/c3d4e5f6-a7b8-9012-cdef-123456789012.jpg')
ON DUPLICATE KEY UPDATE original_filename=VALUES(original_filename);

-- Sample Image 2: AI-Generated Cyberpunk Portrait
INSERT INTO images (id, image_uuid, user_id, original_filename, file_size_kb, mime_type, width, height, sha256_hash, storage_backend, storage_key)
VALUES 
(2, 'd4e5f6a7-b8c9-0123-def1-234567890123', 1, 'midjourney_portrait.png', 1420.80, 'image/png', 1024, 1024, '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', 's3', 'uploads/d4e5f6a7-b8c9-0123-def1-234567890123.png')
ON DUPLICATE KEY UPDATE original_filename=VALUES(original_filename);

-- Sample Classification 1: ResNet-50 Golden Retriever Prediction with Grad-CAM
INSERT INTO classifications (
    id, classification_uuid, user_id, image_id, task_type, model_name, model_backend,
    status, top1_label, top1_confidence, low_confidence, inference_ms, gradcam_key, warnings, raw_response
) VALUES (
    1,
    'e5f6a7b8-c9d0-1234-ef12-345678901234',
    1,
    1,
    'explain_gradcam',
    'ResNet-50 (ImageNet pretrained, 1000 classes)',
    'imagenet',
    'confident',
    'golden_retriever',
    0.92450,
    FALSE,
    42.80,
    'gradcam/e5f6a7b8-c9d0-1234-ef12-345678901234.png',
    JSON_ARRAY(),
    JSON_OBJECT(
        'status', 'confident',
        'top1', JSON_OBJECT('label', 'golden_retriever', 'confidence', 0.9245),
        'model_name', 'ResNet-50 (ImageNet pretrained, 1000 classes)',
        'inference_ms', 42.8
    )
) ON DUPLICATE KEY UPDATE top1_label=VALUES(top1_label);

-- Sample Top-K for Classification 1
INSERT INTO classification_top_k (classification_id, rank_position, label, confidence)
VALUES 
(1, 1, 'golden_retriever', 0.92450),
(1, 2, 'Labrador_retriever', 0.05120),
(1, 3, 'cocker_spaniel', 0.01240)
ON DUPLICATE KEY UPDATE confidence=VALUES(confidence);

-- Sample Classification 2: AI Detector result
INSERT INTO classifications (
    id, classification_uuid, user_id, image_id, task_type, model_name, model_backend,
    status, top1_label, top1_confidence, low_confidence, inference_ms, ai_verdict, ai_probability, warnings, raw_response
) VALUES (
    2,
    'f6a7b8c9-d0e1-2345-f123-456789012345',
    1,
    2,
    'ai_detection',
    'openai/clip-vit-base-patch32 (v2-sq256-jpeg85)',
    'clip',
    'confident',
    'AI-generated',
    0.96320,
    FALSE,
    88.50,
    'likely_ai',
    0.96320,
    JSON_ARRAY(),
    JSON_OBJECT(
        'label', 'AI-generated',
        'confidence', 0.9632,
        'verdict', 'likely_ai',
        'ai_probability', 0.9632,
        'probabilities', JSON_OBJECT('real', 0.0368, 'ai', 0.9632)
    )
) ON DUPLICATE KEY UPDATE top1_label=VALUES(top1_label);

-- Sample Feedback for Classification 1
INSERT INTO classification_feedback (classification_id, user_id, is_correct, user_suggested_label, comment)
VALUES (1, 1, TRUE, 'golden_retriever', 'Spot on classification with accurate Grad-CAM heatmap over dog head.')
ON DUPLICATE KEY UPDATE is_correct=VALUES(is_correct);

