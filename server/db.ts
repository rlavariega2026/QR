import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'private_files');
const CHUNKS_DIR = path.resolve(process.cwd(), 'storage', 'chunks');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'qr_lav.sqlite');
export const PRIVATE_STORAGE_DIR = STORAGE_DIR;
export const CHUNK_STORAGE_DIR = CHUNKS_DIR;

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('superadmin', 'user')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
      is_primary_superadmin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      csrf_token TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      first_attempt_at INTEGER NOT NULL,
      locked_until INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      storage_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      has_alpha INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chunk_uploads (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      total_size INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      expected_sha256 TEXT NOT NULL,
      uploaded_chunks TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      qr_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      design_json TEXT NOT NULL,
      export_json TEXT NOT NULL,
      logo_file_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      include_content INTEGER NOT NULL DEFAULT 0,
      qr_type TEXT,
      data_json TEXT,
      design_json TEXT NOT NULL,
      export_json TEXT NOT NULL,
      logo_file_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_references (
      file_id TEXT NOT NULL,
      ref_type TEXT NOT NULL CHECK(ref_type IN ('project', 'template')),
      ref_id TEXT NOT NULL,
      PRIMARY KEY (file_id, ref_type, ref_id),
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
    CREATE INDEX IF NOT EXISTS idx_templates_owner ON templates(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_file_refs_ref ON file_references(ref_type, ref_id);
  `);

  const applied = db
    .prepare('SELECT 1 FROM schema_migrations WHERE name = ?')
    .get('001_initial_schema');
  if (!applied) {
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
      '001_initial_schema',
      new Date().toISOString()
    );
  }
}

export function extractReferencedFileIds(designJson: string): string[] {
  try {
    const parsed = JSON.parse(designJson) as { logo?: { fileId?: string | null } };
    const id = parsed?.logo?.fileId;
    return typeof id === 'string' && id.trim() !== '' ? [id.trim()] : [];
  } catch {
    return [];
  }
}

export function syncFileReferences(
  refType: 'project' | 'template',
  refId: string,
  fileIds: string[]
) {
  const previousRows = db
    .prepare('SELECT file_id FROM file_references WHERE ref_type = ? AND ref_id = ?')
    .all(refType, refId) as Array<{ file_id: string }>;

  db.prepare('DELETE FROM file_references WHERE ref_type = ? AND ref_id = ?').run(
    refType,
    refId
  );

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO file_references (file_id, ref_type, ref_id) VALUES (?, ?, ?)'
  );
  for (const fid of fileIds) {
    const exists = db.prepare('SELECT 1 FROM files WHERE id = ?').get(fid);
    if (exists) {
      insertStmt.run(fid, refType, refId);
    }
  }

  // Clean up any previously referenced files that now have 0 references
  for (const row of previousRows) {
    if (!fileIds.includes(row.file_id)) {
      cleanupUnreferencedFile(row.file_id);
    }
  }
}

export function cleanupUnreferencedFile(fileId: string) {
  const refCountRow = db
    .prepare('SELECT COUNT(*) as cnt FROM file_references WHERE file_id = ?')
    .get(fileId) as { cnt: number };
  if (refCountRow.cnt > 0) return;

  const fileRow = db
    .prepare('SELECT id, storage_name FROM files WHERE id = ?')
    .get(fileId) as { id: string; storage_name: string } | undefined;
  if (!fileRow) return;

  // Also check if any project or template still directly points to logo_file_id
  const projCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM projects WHERE logo_file_id = ?')
      .get(fileId) as { cnt: number }
  ).cnt;
  const tplCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM templates WHERE logo_file_id = ?')
      .get(fileId) as { cnt: number }
  ).cnt;

  if (projCount === 0 && tplCount === 0) {
    const filePath = path.join(PRIVATE_STORAGE_DIR, fileRow.storage_name);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore disk unlink issues
      }
    }
    db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  }
}
