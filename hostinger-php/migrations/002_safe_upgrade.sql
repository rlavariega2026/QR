-- Migración compatible para instalaciones existentes de Generador QR LAV
-- Conserva todas las cuentas, proyectos, imágenes y plantillas previas.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_primary_superadmin TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL;

UPDATE users SET is_primary_superadmin = 1 WHERE LOWER(username) = 'lavariega' AND role = 'superadmin';

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS logo_file_id VARCHAR(64) NULL;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS include_content TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS logo_file_id VARCHAR(64) NULL;

INSERT IGNORE INTO schema_migrations (name, applied_at) VALUES ('002_safe_upgrade', NOW());
