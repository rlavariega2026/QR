import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import {
  db,
  runMigrations,
  extractReferencedFileIds,
  syncFileReferences,
  cleanupUnreferencedFile,
  CHUNK_STORAGE_DIR,
  PRIVATE_STORAGE_DIR,
} from './server/db.ts';
import {
  DEFAULT_MAX_STORAGE_BYTES,
  getUsedStorageBytes,
  persistVerifiedFile,
} from './server/files.ts';

runMigrations();

// Optional bootstrap from env only if no users exist yet
const envAdminPass = process.env.INITIAL_ADMIN_PASSWORD;
if (envAdminPass && envAdminPass.length >= 8) {
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount === 0) {
    const now = new Date().toISOString();
    const hash = bcrypt.hashSync(envAdminPass, 12);
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, status, is_primary_superadmin, created_at, updated_at)
       VALUES (?, ?, ?, 'superadmin', 'active', 1, ?, ?)`
    ).run(`usr_${crypto.randomUUID().replace(/-/g, '')}`, 'lavariega', hash, now, now);
  }
}

const SESSION_COOKIE_NAME = 'qrlav_sid';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;

interface AuthedUser {
  id: string;
  username: string;
  role: 'superadmin' | 'user';
  status: 'active' | 'suspended';
  isPrimarySuperadmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AuthedRequest extends Request {
  sessionId?: string;
  csrfToken?: string;
  user?: AuthedUser;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function isHttpsRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req: Request, res: Response, sessionId: string) {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
    maxAge: ABSOLUTE_TIMEOUT_MS,
  });
}

function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
  });
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const sid = req.cookies?.[SESSION_COOKIE_NAME];
  if (!sid || typeof sid !== 'string') {
    res.status(401).json({ error: 'Sesión no iniciada o expirada.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT s.id as sid, s.csrf_token, s.last_activity_at, s.expires_at,
              u.id as uid, u.username, u.role, u.status, u.is_primary_superadmin, u.created_at, u.last_login_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sid) as
    | {
        sid: string;
        csrf_token: string;
        last_activity_at: number;
        expires_at: number;
        uid: string;
        username: string;
        role: 'superadmin' | 'user';
        status: 'active' | 'suspended';
        is_primary_superadmin: number;
        created_at: string;
        last_login_at: string | null;
      }
    | undefined;

  if (!row) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Sesión inválida o revocada.' });
    return;
  }

  const now = Date.now();
  if (now > row.expires_at || now - row.last_activity_at > IDLE_TIMEOUT_MS) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Tu sesión caducó por inactividad. Inicia sesión nuevamente.' });
    return;
  }

  if (row.status !== 'active') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.uid);
    clearSessionCookie(req, res);
    res.status(403).json({ error: 'Tu cuenta ha sido suspendida. Contacta al superadministrador.' });
    return;
  }

  db.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?').run(now, sid);

  req.sessionId = row.sid;
  req.csrfToken = row.csrf_token;
  req.user = {
    id: row.uid,
    username: row.username,
    role: row.role,
    status: row.status,
    isPrimarySuperadmin: Boolean(row.is_primary_superadmin),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
  next();
}

function requireCsrf(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.headers['x-csrf-token'];
  if (!req.csrfToken || typeof token !== 'string' || token !== req.csrfToken) {
    res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
    return;
  }
  next();
}

function requireSuperadmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'superadmin') {
    res.status(403).json({ error: 'Acceso restringido al superadministrador.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json({ limit: '4mb' }));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'generador-qr-lav' });
  });

  // 1. Setup Status & Initial One-Time Superadmin Creation
  app.get('/api/auth/setup-status', (_req, res) => {
    const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
    res.json({ needsSetup: cnt === 0, defaultUsername: 'lavariega' });
  });

  app.post('/api/auth/setup', (req, res) => {
    const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
    if (cnt > 0) {
      res.status(403).json({ error: 'El instalador inicial ya fue completado.' });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const username =
      typeof req.body?.username === 'string' && req.body.username.trim()
        ? req.body.username.trim()
        : 'lavariega';

    if (username.toLowerCase() !== 'lavariega') {
      res.status(400).json({ error: 'La cuenta inicial debe ser lavariega.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const now = new Date().toISOString();
    const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
    const hash = bcrypt.hashSync(password, 12);

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, status, is_primary_superadmin, created_at, updated_at)
       VALUES (?, 'lavariega', ?, 'superadmin', 'active', 1, ?, ?)`
    ).run(userId, hash, now, now);

    res.status(201).json({ ok: true, username: 'lavariega' });
  });

  // 2. Login / Logout / Me
  app.post('/api/auth/login', (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      res.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
      return;
    }

    const ip = getClientIp(req);
    const rateKey = `${ip}::${username.toLowerCase()}`;
    const nowMs = Date.now();

    const attemptRow = db
      .prepare('SELECT attempts, first_attempt_at, locked_until FROM login_attempts WHERE key = ?')
      .get(rateKey) as
      | { attempts: number; first_attempt_at: number; locked_until: number }
      | undefined;

    if (attemptRow && attemptRow.locked_until > nowMs) {
      const mins = Math.ceil((attemptRow.locked_until - nowMs) / 60000);
      res.status(429).json({
        error: `Demasiados intentos fallidos. Espera ${mins} minuto(s) antes de intentar de nuevo.`,
      });
      return;
    }

    const user = db
      .prepare(
        `SELECT id, username, password_hash, role, status, is_primary_superadmin, created_at, last_login_at
         FROM users WHERE username = ?`
      )
      .get(username) as
      | {
          id: string;
          username: string;
          password_hash: string;
          role: 'superadmin' | 'user';
          status: 'active' | 'suspended';
          is_primary_superadmin: number;
          created_at: string;
          last_login_at: string | null;
        }
      | undefined;

    const valid = user ? bcrypt.compareSync(password, user.password_hash) : false;

    if (!user || !valid) {
      const resetWindow = !attemptRow || nowMs - attemptRow.first_attempt_at > RATE_LIMIT_WINDOW_MS;
      const newAttempts = resetWindow ? 1 : attemptRow.attempts + 1;
      const firstAt = resetWindow ? nowMs : attemptRow.first_attempt_at;
      const lockedUntil =
        newAttempts >= RATE_LIMIT_MAX_ATTEMPTS ? nowMs + RATE_LIMIT_WINDOW_MS : 0;

      db.prepare(
        `INSERT INTO login_attempts (key, attempts, first_attempt_at, locked_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, first_attempt_at = excluded.first_attempt_at, locked_until = excluded.locked_until`
      ).run(rateKey, newAttempts, firstAt, lockedUntil);

      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({
        error: 'Esta cuenta está suspendida. Contacta al superadministrador.',
      });
      return;
    }

    // Clear failed attempts & regenerate session ID
    db.prepare('DELETE FROM login_attempts WHERE key = ?').run(rateKey);
    const oldSid = req.cookies?.[SESSION_COOKIE_NAME];
    if (oldSid && typeof oldSid === 'string') {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(oldSid);
    }

    const newSid = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO sessions (id, user_id, csrf_token, created_at, last_activity_at, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newSid,
      user.id,
      csrfToken,
      nowMs,
      nowMs,
      nowMs + ABSOLUTE_TIMEOUT_MS,
      ip,
      req.headers['user-agent'] || ''
    );

    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso, user.id);
    setSessionCookie(req, res, newSid);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        isPrimarySuperadmin: Boolean(user.is_primary_superadmin),
        createdAt: user.created_at,
        lastLoginAt: nowIso,
      },
      csrfToken,
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user, csrfToken: req.csrfToken });
  });

  app.post('/api/auth/logout', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    if (req.sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // 3. Superadmin User Management
  app.get('/api/users', requireAuth, requireSuperadmin, (_req, res) => {
    const users = db
      .prepare(
        `SELECT u.id, u.username, u.role, u.status, u.is_primary_superadmin, u.created_at, u.last_login_at,
                (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) as active_sessions,
                (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id) as project_count
         FROM users u
         ORDER BY u.is_primary_superadmin DESC, u.created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    res.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        status: u.status,
        isPrimarySuperadmin: Boolean(u.is_primary_superadmin),
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at,
        activeSessions: Number(u.active_sessions || 0),
        projectCount: Number(u.project_count || 0),
      })),
    });
  });

  app.post('/api/users', requireAuth, requireCsrf, requireSuperadmin, (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role === 'superadmin' ? 'superadmin' : 'user';

    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      res.status(400).json({
        error: 'El nombre de usuario debe tener entre 3 y 40 caracteres (letras, números, ., _, -).',
      });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese nombre de usuario.' });
      return;
    }

    const now = new Date().toISOString();
    const id = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
    const hash = bcrypt.hashSync(password, 12);

    db.prepare(
      `INSERT INTO users (id, username, password_hash, role, status, is_primary_superadmin, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`
    ).run(id, username, hash, role, now, now);

    res.status(201).json({
      user: {
        id,
        username,
        role,
        status: 'active',
        isPrimarySuperadmin: false,
        createdAt: now,
        lastLoginAt: null,
        activeSessions: 0,
        projectCount: 0,
      },
    });
  });

  app.patch('/api/users/:id', requireAuth, requireCsrf, requireSuperadmin, (req, res) => {
    const targetId = req.params.id;
    const target = db
      .prepare('SELECT id, username, role, status, is_primary_superadmin FROM users WHERE id = ?')
      .get(targetId) as
      | {
          id: string;
          username: string;
          role: 'superadmin' | 'user';
          status: 'active' | 'suspended';
          is_primary_superadmin: number;
        }
      | undefined;

    if (!target) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    const newUsername =
      typeof req.body?.username === 'string' ? req.body.username.trim() : target.username;
    const newStatus =
      req.body?.status === 'suspended'
        ? 'suspended'
        : req.body?.status === 'active'
          ? 'active'
          : target.status;
    const newRole =
      req.body?.role === 'superadmin' || req.body?.role === 'user' ? req.body.role : target.role;
    const newPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (target.is_primary_superadmin) {
      if (newStatus === 'suspended' || newRole !== 'superadmin') {
        res.status(403).json({
          error: 'La cuenta principal de superadministrador está protegida contra suspensión o cambio de rol.',
        });
        return;
      }
    }

    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(newUsername)) {
      res.status(400).json({ error: 'Nombre de usuario inválido.' });
      return;
    }

    if (newUsername.toLowerCase() !== target.username.toLowerCase()) {
      const dup = db
        .prepare('SELECT 1 FROM users WHERE username = ? AND id != ?')
        .get(newUsername, targetId);
      if (dup) {
        res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
        return;
      }
    }

    if (newPassword && newPassword.length < 8) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    const now = new Date().toISOString();
    if (newPassword) {
      const hash = bcrypt.hashSync(newPassword, 12);
      db.prepare(
        'UPDATE users SET username = ?, role = ?, status = ?, password_hash = ?, updated_at = ? WHERE id = ?'
      ).run(newUsername, newRole, newStatus, hash, now, targetId);
    } else {
      db.prepare(
        'UPDATE users SET username = ?, role = ?, status = ?, updated_at = ? WHERE id = ?'
      ).run(newUsername, newRole, newStatus, now, targetId);
    }

    // Immediate session invalidation when suspended or password reset
    if (newStatus === 'suspended' || newPassword) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    }

    res.json({ ok: true });
  });

  app.post(
    '/api/users/:id/revoke-sessions',
    requireAuth,
    requireCsrf,
    requireSuperadmin,
    (req, res) => {
      const targetId = req.params.id;
      const result = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
      res.json({ ok: true, revokedCount: result.changes });
    }
  );

  app.delete('/api/users/:id', requireAuth, requireCsrf, requireSuperadmin, (req: AuthedRequest, res) => {
    const targetId = req.params.id;
    const target = db
      .prepare('SELECT id, username, is_primary_superadmin FROM users WHERE id = ?')
      .get(targetId) as { id: string; username: string; is_primary_superadmin: number } | undefined;

    if (!target) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    if (target.is_primary_superadmin || target.id === req.user?.id) {
      res.status(403).json({
        error: 'No es posible eliminar la cuenta principal de superadministrador ni tu propia sesión actual.',
      });
      return;
    }

    const primarySuper = db
      .prepare('SELECT id FROM users WHERE is_primary_superadmin = 1 LIMIT 1')
      .get() as { id: string } | undefined;
    const fallbackOwnerId = primarySuper?.id || req.user!.id;

    // Preserve projects, templates, and files for superadmin recovery while invalidating sessions immediately
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
      db.prepare(
        `UPDATE projects SET owner_id = ?, name = CASE WHEN instr(name, '[Recuperado') = 0 THEN name || ' [Recuperado de ' || ? || ']' ELSE name END WHERE owner_id = ?`
      ).run(fallbackOwnerId, target.username, targetId);
      db.prepare('UPDATE templates SET owner_id = ? WHERE owner_id = ?').run(
        fallbackOwnerId,
        targetId
      );
      db.prepare('UPDATE files SET owner_id = ? WHERE owner_id = ?').run(fallbackOwnerId, targetId);
      db.prepare('DELETE FROM chunk_uploads WHERE owner_id = ?').run(targetId);
      db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    });
    tx();

    res.json({ ok: true });
  });

  // 4. Projects (Mis QR)
  app.get('/api/projects', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const ownerFilter =
      user.role === 'superadmin' && typeof req.query.ownerId === 'string'
        ? req.query.ownerId.trim()
        : '';

    let sql = `
      SELECT p.*, u.username as owner_username
      FROM projects p
      JOIN users u ON u.id = p.owner_id
    `;
    const params: unknown[] = [];
    const where: string[] = [];

    if (user.role !== 'superadmin') {
      where.push('p.owner_id = ?');
      params.push(user.id);
    } else if (ownerFilter && ownerFilter !== 'all') {
      where.push('p.owner_id = ?');
      params.push(ownerFilter);
    }

    if (q) {
      where.push('(LOWER(p.name) LIKE ? OR LOWER(p.qr_type) LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }
    sql += ' ORDER BY p.updated_at DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json({
      projects: rows.map((r) => ({
        id: r.id,
        ownerId: r.owner_id,
        ownerUsername: r.owner_username,
        name: r.name,
        qrType: r.qr_type,
        data: JSON.parse(String(r.data_json)),
        design: JSON.parse(String(r.design_json)),
        exportConfig: JSON.parse(String(r.export_json)),
        version: Number(r.version),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  });

  app.get('/api/projects/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const row = db
      .prepare(
        `SELECT p.*, u.username as owner_username
         FROM projects p JOIN users u ON u.id = p.owner_id
         WHERE p.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Proyecto no encontrado.' });
      return;
    }
    if (user.role !== 'superadmin' && row.owner_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para acceder a este proyecto.' });
      return;
    }

    res.json({
      project: {
        id: row.id,
        ownerId: row.owner_id,
        ownerUsername: row.owner_username,
        name: row.name,
        qrType: row.qr_type,
        data: JSON.parse(String(row.data_json)),
        design: JSON.parse(String(row.design_json)),
        exportConfig: JSON.parse(String(row.export_json)),
        version: Number(row.version),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  });

  app.post('/api/projects', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const qrType = typeof req.body?.qrType === 'string' ? req.body.qrType.trim() : '';
    const data = req.body?.data;
    const design = req.body?.design;
    const exportConfig = req.body?.exportConfig;

    if (!name) {
      res.status(400).json({ error: 'El nombre del proyecto es obligatorio.' });
      return;
    }
    if (!qrType || !data || !design || !exportConfig) {
      res.status(400).json({ error: 'Faltan datos del diseño o configuración del QR.' });
      return;
    }

    const id = `prj_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const designJson = JSON.stringify(design);
    const dataJson = JSON.stringify(data);
    const exportJson = JSON.stringify(exportConfig);
    const fileIds = extractReferencedFileIds(designJson);
    const logoFileId = fileIds[0] || null;

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO projects (id, owner_id, name, qr_type, data_json, design_json, export_json, logo_file_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(id, user.id, name, qrType, dataJson, designJson, exportJson, logoFileId, now, now);
      syncFileReferences('project', id, fileIds);
    });
    tx();

    res.status(201).json({
      project: {
        id,
        ownerId: user.id,
        ownerUsername: user.username,
        name,
        qrType,
        data,
        design,
        exportConfig,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  app.put('/api/projects/:id', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const existing = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Proyecto no encontrado.' });
      return;
    }
    if (user.role !== 'superadmin' && existing.owner_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para modificar este proyecto.' });
      return;
    }

    const expectedVersion = Number(req.body?.expectedVersion);
    const currentVersion = Number(existing.version);
    if (!Number.isNaN(expectedVersion) && expectedVersion !== currentVersion) {
      res.status(409).json({
        error:
          'Este proyecto fue modificado desde otra sesión o dispositivo. Tus cambios locales se conservan; puedes guardarlos como una copia nueva.',
        conflict: true,
        serverVersion: currentVersion,
        serverUpdatedAt: existing.updated_at,
      });
      return;
    }

    const name =
      typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : String(existing.name);
    const qrType =
      typeof req.body?.qrType === 'string' && req.body.qrType.trim()
        ? req.body.qrType.trim()
        : String(existing.qr_type);
    const data = req.body?.data ?? JSON.parse(String(existing.data_json));
    const design = req.body?.design ?? JSON.parse(String(existing.design_json));
    const exportConfig = req.body?.exportConfig ?? JSON.parse(String(existing.export_json));

    const now = new Date().toISOString();
    const newVersion = currentVersion + 1;
    const designJson = JSON.stringify(design);
    const dataJson = JSON.stringify(data);
    const exportJson = JSON.stringify(exportConfig);
    const fileIds = extractReferencedFileIds(designJson);
    const logoFileId = fileIds[0] || null;

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE projects
         SET name = ?, qr_type = ?, data_json = ?, design_json = ?, export_json = ?, logo_file_id = ?, version = ?, updated_at = ?
         WHERE id = ?`
      ).run(name, qrType, dataJson, designJson, exportJson, logoFileId, newVersion, now, req.params.id);
      syncFileReferences('project', req.params.id, fileIds);
    });
    tx();

    res.json({
      project: {
        id: existing.id,
        ownerId: existing.owner_id,
        name,
        qrType,
        data,
        design,
        exportConfig,
        version: newVersion,
        createdAt: existing.created_at,
        updatedAt: now,
      },
    });
  });

  app.post('/api/projects/:id/duplicate', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const existing = db
      .prepare('SELECT * FROM projects WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Proyecto no encontrado.' });
      return;
    }
    if (user.role !== 'superadmin' && existing.owner_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para duplicar este proyecto.' });
      return;
    }

    const customName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const copyName = customName || `${String(existing.name)} (Copia)`;
    const newId = `prj_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const fileIds = extractReferencedFileIds(String(existing.design_json));

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO projects (id, owner_id, name, qr_type, data_json, design_json, export_json, logo_file_id, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        newId,
        user.id,
        copyName,
        existing.qr_type,
        existing.data_json,
        existing.design_json,
        existing.export_json,
        existing.logo_file_id,
        now,
        now
      );
      syncFileReferences('project', newId, fileIds);
    });
    tx();

    res.status(201).json({
      project: {
        id: newId,
        ownerId: user.id,
        ownerUsername: user.username,
        name: copyName,
        qrType: existing.qr_type,
        data: JSON.parse(String(existing.data_json)),
        design: JSON.parse(String(existing.design_json)),
        exportConfig: JSON.parse(String(existing.export_json)),
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  app.delete('/api/projects/:id', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const existing = db
      .prepare('SELECT id, owner_id, design_json FROM projects WHERE id = ?')
      .get(req.params.id) as { id: string; owner_id: string; design_json: string } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Proyecto no encontrado.' });
      return;
    }
    if (user.role !== 'superadmin' && existing.owner_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para eliminar este proyecto.' });
      return;
    }

    const fileIds = extractReferencedFileIds(existing.design_json);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM file_references WHERE ref_type = ? AND ref_id = ?').run(
        'project',
        existing.id
      );
      db.prepare('DELETE FROM projects WHERE id = ?').run(existing.id);
      for (const fid of fileIds) {
        cleanupUnreferencedFile(fid);
      }
    });
    tx();

    res.json({ ok: true });
  });

  // 5. Templates (Mis plantillas)
  app.get('/api/templates', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    let sql = `
      SELECT t.*, u.username as owner_username
      FROM templates t
      JOIN users u ON u.id = t.owner_id
    `;
    const params: unknown[] = [];
    const where: string[] = [];

    if (user.role !== 'superadmin') {
      where.push('t.owner_id = ?');
      params.push(user.id);
    }
    if (q) {
      where.push('LOWER(t.name) LIKE ?');
      params.push(`%${q}%`);
    }
    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }
    sql += ' ORDER BY t.updated_at DESC';

    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    res.json({
      templates: rows.map((r) => ({
        id: r.id,
        ownerId: r.owner_id,
        ownerUsername: r.owner_username,
        name: r.name,
        includeContent: Boolean(r.include_content),
        qrType: r.qr_type || null,
        data: r.data_json ? JSON.parse(String(r.data_json)) : null,
        design: JSON.parse(String(r.design_json)),
        exportConfig: JSON.parse(String(r.export_json)),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  });

  app.post('/api/templates', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const includeContent = Boolean(req.body?.includeContent);
    const qrType = includeContent && typeof req.body?.qrType === 'string' ? req.body.qrType : null;
    const data = includeContent && req.body?.data ? req.body.data : null;
    const design = req.body?.design;
    const exportConfig = req.body?.exportConfig;

    if (!name) {
      res.status(400).json({ error: 'El nombre de la plantilla es obligatorio.' });
      return;
    }
    if (!design || !exportConfig) {
      res.status(400).json({ error: 'Falta la configuración visual de la plantilla.' });
      return;
    }

    const id = `tpl_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const designJson = JSON.stringify(design);
    const exportJson = JSON.stringify(exportConfig);
    const dataJson = data ? JSON.stringify(data) : null;
    const fileIds = extractReferencedFileIds(designJson);
    const logoFileId = fileIds[0] || null;

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO templates (id, owner_id, name, include_content, qr_type, data_json, design_json, export_json, logo_file_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        user.id,
        name,
        includeContent ? 1 : 0,
        qrType,
        dataJson,
        designJson,
        exportJson,
        logoFileId,
        now,
        now
      );
      syncFileReferences('template', id, fileIds);
    });
    tx();

    res.status(201).json({
      template: {
        id,
        ownerId: user.id,
        ownerUsername: user.username,
        name,
        includeContent,
        qrType,
        data,
        design,
        exportConfig,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  app.patch('/api/templates/:id', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const existing = db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    if (user.role !== 'superadmin' && existing.owner_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para modificar esta plantilla.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      res.status(400).json({ error: 'El nombre no puede quedar vacío.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE templates SET name = ?, updated_at = ? WHERE id = ?').run(
      name,
      now,
      req.params.id
    );
    res.json({ ok: true, name, updatedAt: now });
  });

  app.delete('/api/templates/:id', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const existing = db
      .prepare('SELECT id, owner_id, design_json FROM templates WHERE id = ?')
      .get(req.params.id) as { id: string; owner_id: string; design_json: string } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Plantilla no encontrada.' });
      return;
    }
    if (user.role !== 'superadmin' && existing.owner_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta plantilla.' });
      return;
    }

    const fileIds = extractReferencedFileIds(existing.design_json);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM file_references WHERE ref_type = ? AND ref_id = ?').run(
        'template',
        existing.id
      );
      db.prepare('DELETE FROM templates WHERE id = ?').run(existing.id);
      for (const fid of fileIds) {
        cleanupUnreferencedFile(fid);
      }
    });
    tx();

    res.json({ ok: true });
  });

  // 6. Resumable Chunked File Upload & Private File Serving
  app.post('/api/files/chunk/init', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const originalName =
      typeof req.body?.originalName === 'string' ? req.body.originalName.trim() : 'imagen';
    const mimeType =
      typeof req.body?.mimeType === 'string' ? req.body.mimeType.trim() : 'application/octet-stream';
    const totalSize = Number(req.body?.totalSize);
    const totalChunks = Number(req.body?.totalChunks);
    const expectedSha256 =
      typeof req.body?.sha256 === 'string' ? req.body.sha256.trim().toLowerCase() : '';

    if (
      !Number.isFinite(totalSize) ||
      totalSize <= 0 ||
      !Number.isInteger(totalChunks) ||
      totalChunks <= 0 ||
      totalChunks > 2000
    ) {
      res.status(400).json({ error: 'Parámetros de carga inválidos.' });
      return;
    }

    // Check real storage quota (or optional test header for quota exhaustion testing)
    const simulateQuota = req.headers['x-simulate-quota-exceeded'] === '1';
    const usedBytes = getUsedStorageBytes();
    if (simulateQuota || usedBytes + totalSize > DEFAULT_MAX_STORAGE_BYTES) {
      res.status(507).json({
        error: `Cuota de almacenamiento alcanzada al intentar subir «${originalName}». Tus proyectos y archivos anteriores permanecen intactos.`,
        quotaExceeded: true,
        failedFile: originalName,
      });
      return;
    }

    // Check if an identical pending upload from this user exists so it can resume cleanly!
    if (expectedSha256) {
      const existingUpload = db
        .prepare(
          `SELECT id, uploaded_chunks, total_chunks FROM chunk_uploads
           WHERE owner_id = ? AND expected_sha256 = ? AND total_size = ? AND status = 'pending'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(user.id, expectedSha256, totalSize) as
        | { id: string; uploaded_chunks: string; total_chunks: number }
        | undefined;

      if (existingUpload && existingUpload.total_chunks === totalChunks) {
        const uploadedIndices = JSON.parse(existingUpload.uploaded_chunks) as number[];
        res.json({
          uploadId: existingUpload.id,
          resumed: true,
          uploadedChunks: uploadedIndices,
        });
        return;
      }
    }

    const uploadId = `upl_${crypto.randomUUID().replace(/-/g, '')}`;
    const uploadDir = path.join(CHUNK_STORAGE_DIR, uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });

    db.prepare(
      `INSERT INTO chunk_uploads (id, owner_id, original_name, mime_type, total_size, total_chunks, expected_sha256, uploaded_chunks, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'pending', ?)`
    ).run(
      uploadId,
      user.id,
      originalName,
      mimeType,
      totalSize,
      totalChunks,
      expectedSha256,
      new Date().toISOString()
    );

    res.status(201).json({
      uploadId,
      resumed: false,
      uploadedChunks: [],
    });
  });

  app.put(
    '/api/files/chunk/:uploadId/:chunkIndex',
    requireAuth,
    requireCsrf,
    express.raw({ type: '*/*', limit: '8mb' }),
    (req: AuthedRequest, res) => {
      const user = req.user!;
      const { uploadId, chunkIndex } = req.params;
      const idx = Number(chunkIndex);

      const upload = db
        .prepare('SELECT * FROM chunk_uploads WHERE id = ?')
        .get(uploadId) as Record<string, unknown> | undefined;

      if (!upload) {
        res.status(404).json({ error: 'Sesión de carga no encontrada.' });
        return;
      }
      if (upload.owner_id !== user.id && user.role !== 'superadmin') {
        res.status(403).json({ error: 'Sin permiso para esta carga.' });
        return;
      }
      if (upload.status !== 'pending') {
        res.status(400).json({ error: 'Esta carga ya fue finalizada.' });
        return;
      }
      if (!Number.isInteger(idx) || idx < 0 || idx >= Number(upload.total_chunks)) {
        res.status(400).json({ error: 'Índice de bloque inválido.' });
        return;
      }

      const chunkBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      if (chunkBuf.length === 0) {
        res.status(400).json({ error: 'Bloque vacío recibido.' });
        return;
      }

      const uploadDir = path.join(CHUNK_STORAGE_DIR, uploadId);
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, `${idx}.part`), chunkBuf);

      const uploaded = new Set<number>(JSON.parse(String(upload.uploaded_chunks)) as number[]);
      uploaded.add(idx);
      const sorted = Array.from(uploaded).sort((a, b) => a - b);

      db.prepare('UPDATE chunk_uploads SET uploaded_chunks = ? WHERE id = ?').run(
        JSON.stringify(sorted),
        uploadId
      );

      res.json({ ok: true, chunkIndex: idx, uploadedChunks: sorted });
    }
  );

  app.post('/api/files/chunk/:uploadId/complete', requireAuth, requireCsrf, (req: AuthedRequest, res) => {
    const user = req.user!;
    const { uploadId } = req.params;

    const upload = db
      .prepare('SELECT * FROM chunk_uploads WHERE id = ?')
      .get(uploadId) as Record<string, unknown> | undefined;

    if (!upload) {
      res.status(404).json({ error: 'Carga no encontrada.' });
      return;
    }
    if (upload.owner_id !== user.id && user.role !== 'superadmin') {
      res.status(403).json({ error: 'Sin permiso para finalizar esta carga.' });
      return;
    }

    const totalChunks = Number(upload.total_chunks);
    const uploadDir = path.join(CHUNK_STORAGE_DIR, uploadId);
    const buffers: Buffer[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const partPath = path.join(uploadDir, `${i}.part`);
      if (!fs.existsSync(partPath)) {
        res.status(400).json({
          error: `Falta el bloque ${i + 1} de ${totalChunks} para «${upload.original_name}». Puedes reanudar la carga.`,
        });
        return;
      }
      buffers.push(fs.readFileSync(partPath));
    }

    const fullBuffer = Buffer.concat(buffers);
    if (fullBuffer.length !== Number(upload.total_size)) {
      res.status(400).json({
        error: `El tamaño ensamblado (${fullBuffer.length} B) no coincide con el original (${upload.total_size} B).`,
      });
      return;
    }

    const expectedSha = String(upload.expected_sha256 || '');
    if (expectedSha) {
      const actualSha = crypto.createHash('sha256').update(fullBuffer).digest('hex');
      if (actualSha !== expectedSha) {
        res.status(400).json({
          error: 'La verificación de integridad SHA-256 falló. Intenta cargar el archivo de nuevo.',
        });
        return;
      }
    }

    try {
      const clientWidth =
        typeof req.body?.width === 'number' && req.body.width > 0 ? req.body.width : null;
      const clientHeight =
        typeof req.body?.height === 'number' && req.body.height > 0 ? req.body.height : null;
      const clientHasAlpha = Boolean(req.body?.hasAlpha);

      const fileMeta = persistVerifiedFile({
        ownerId: user.id,
        originalName: String(upload.original_name),
        buffer: fullBuffer,
        declaredMime: String(upload.mime_type),
        clientWidth,
        clientHeight,
        clientHasAlpha,
      });

      db.prepare("UPDATE chunk_uploads SET status = 'completed' WHERE id = ?").run(uploadId);
      fs.rmSync(uploadDir, { recursive: true, force: true });

      res.status(201).json({ file: fileMeta });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Archivo inválido.';
      res.status(400).json({ error: msg, failedFile: upload.original_name });
    }
  });

  app.get('/api/files/:id', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const fileRow = db
      .prepare('SELECT * FROM files WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!fileRow) {
      res.status(404).json({ error: 'Archivo no encontrado.' });
      return;
    }

    // Ownership or superadmin or referenced by a project/template the user owns
    let allowed = user.role === 'superadmin' || fileRow.owner_id === user.id;
    if (!allowed) {
      const refProj = db
        .prepare(
          `SELECT 1 FROM file_references fr
           JOIN projects p ON p.id = fr.ref_id
           WHERE fr.file_id = ? AND fr.ref_type = 'project' AND p.owner_id = ?`
        )
        .get(fileRow.id, user.id);
      if (refProj) allowed = true;
    }

    if (!allowed) {
      res.status(403).json({ error: 'Acceso denegado a este archivo privado.' });
      return;
    }

    const filePath = path.join(PRIVATE_STORAGE_DIR, String(fileRow.storage_name));
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'El archivo físico no existe en almacenamiento.' });
      return;
    }

    res.setHeader('Content-Type', String(fileRow.mime_type));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(filePath);
  });

  app.get('/api/files/:id/meta', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const fileRow = db
      .prepare('SELECT * FROM files WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!fileRow) {
      res.status(404).json({ error: 'Archivo no encontrado.' });
      return;
    }
    if (user.role !== 'superadmin' && fileRow.owner_id !== user.id) {
      res.status(403).json({ error: 'Sin acceso a metadatos de este archivo.' });
      return;
    }

    res.json({
      file: {
        id: fileRow.id,
        ownerId: fileRow.owner_id,
        originalName: fileRow.original_name,
        mimeType: fileRow.mime_type,
        byteSize: Number(fileRow.byte_size),
        width: fileRow.width !== null ? Number(fileRow.width) : null,
        height: fileRow.height !== null ? Number(fileRow.height) : null,
        hasAlpha: Boolean(fileRow.has_alpha),
        sha256: fileRow.sha256,
        createdAt: fileRow.created_at,
      },
    });
  });

  // Vite or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Generador QR LAV escuchando en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
