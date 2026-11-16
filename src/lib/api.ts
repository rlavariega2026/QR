import type {
  QrDesignConfig,
  QrExportConfig,
  QrProject,
  QrTemplate,
  QrTypeId,
  StoredFileMeta,
  UserAccount,
} from '../types/qr';

export function qrApiUrl(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;
}

let currentCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  currentCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return currentCsrfToken;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && currentCsrfToken) {
    headers.set('X-CSRF-Token', currentCsrfToken);
  }
  if (!(init.body instanceof ArrayBuffer) && !(init.body instanceof Uint8Array) && !headers.has('Content-Type')) {
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const res = await fetch(qrApiUrl(url), {
    ...init,
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { error: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(
      typeof json.error === 'string' ? json.error : `Error HTTP ${res.status}`,
      res.status,
      json
    );
  }

  return json as T;
}

export async function getSetupStatus() {
  return apiFetch<{ needsSetup: boolean; defaultUsername: string }>('/api/auth/setup-status');
}

export async function completeInitialSetup(password: string) {
  return apiFetch<{ ok: boolean; username: string }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ username: 'lavariega', password }),
  });
}

export async function login(username: string, password: string) {
  const data = await apiFetch<{ user: UserAccount; csrfToken: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setCsrfToken(data.csrfToken);
  return data.user;
}

export async function fetchMe() {
  const data = await apiFetch<{ user: UserAccount; csrfToken: string }>('/api/auth/me');
  setCsrfToken(data.csrfToken);
  return data.user;
}

export async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  setCsrfToken(null);
}

// Projects
export async function listProjects(q = '', ownerId = 'all') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (ownerId && ownerId !== 'all') params.set('ownerId', ownerId);
  const res = await apiFetch<{ projects: QrProject[] }>(`/api/projects?${params.toString()}`);
  return res.projects;
}

export async function getProject(id: string) {
  const res = await apiFetch<{ project: QrProject }>(`/api/projects/${encodeURIComponent(id)}`);
  return res.project;
}

export async function createProject(payload: {
  name: string;
  qrType: QrTypeId;
  data: Record<string, unknown>;
  design: QrDesignConfig;
  exportConfig: QrExportConfig;
}) {
  const res = await apiFetch<{ project: QrProject }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.project;
}

export async function updateProject(
  id: string,
  payload: {
    name?: string;
    qrType: QrTypeId;
    data: Record<string, unknown>;
    design: QrDesignConfig;
    exportConfig: QrExportConfig;
    expectedVersion: number;
  }
) {
  const res = await apiFetch<{ project: QrProject }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return res.project;
}

export async function duplicateProject(id: string, name?: string) {
  const res = await apiFetch<{ project: QrProject }>(
    `/api/projects/${encodeURIComponent(id)}/duplicate`,
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    }
  );
  return res.project;
}

export async function deleteProject(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// Templates
export async function listTemplates(q = '') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const res = await apiFetch<{ templates: QrTemplate[] }>(`/api/templates?${params.toString()}`);
  return res.templates;
}

export async function createTemplate(payload: {
  name: string;
  includeContent: boolean;
  qrType: QrTypeId | null;
  data: Record<string, unknown> | null;
  design: QrDesignConfig;
  exportConfig: QrExportConfig;
}) {
  const res = await apiFetch<{ template: QrTemplate }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.template;
}

export async function renameTemplate(id: string, name: string) {
  return apiFetch<{ ok: boolean; name: string }>(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteTemplate(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// Users (Superadmin)
export interface UserAdminRow extends UserAccount {
  activeSessions: number;
  projectCount: number;
}

export async function listUsers() {
  const res = await apiFetch<{ users: UserAdminRow[] }>('/api/users');
  return res.users;
}

export async function createUser(payload: {
  username: string;
  password: string;
  role: 'superadmin' | 'user';
}) {
  const res = await apiFetch<{ user: UserAdminRow }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.user;
}

export async function updateUser(
  id: string,
  payload: {
    username?: string;
    role?: 'superadmin' | 'user';
    status?: 'active' | 'suspended';
    password?: string;
  }
) {
  return apiFetch<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function revokeUserSessions(id: string) {
  return apiFetch<{ ok: boolean; revokedCount: number }>(
    `/api/users/${encodeURIComponent(id)}/revoke-sessions`,
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function deleteUser(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getFileMeta(fileId: string) {
  const res = await apiFetch<{ file: StoredFileMeta }>(
    `/api/files/${encodeURIComponent(fileId)}/meta`
  );
  return res.file;
}
