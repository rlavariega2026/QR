import type { StoredFileMeta } from '../types/qr';
import { ApiError, getCsrfToken } from './api';

const CHUNK_SIZE = 512 * 1024; // 512 KB chunks

const ACCEPTED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'bmp',
  'gif',
  'svg',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
]);

async function computeSha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return '';
}

export interface ClientImageInspection {
  width: number | null;
  height: number | null;
  hasAlpha: boolean;
  previewDataUrl: string;
}

export async function inspectImageClientSide(file: File): Promise<ClientImageInspection> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ACCEPTED_EXTENSIONS.has(ext) && !file.type.startsWith('image/')) {
    throw new Error(
      `El archivo «${file.name}» no tiene un formato de imagen admitido (PNG, JPG, WebP, BMP, GIF, SVG, AVIF, HEIC o TIFF).`
    );
  }

  // SVG: sanitize basic preview client-side as well
  if (ext === 'svg' || file.type === 'image/svg+xml') {
    const text = await file.text();
    if (!/<svg[\s>]/i.test(text)) {
      throw new Error(`El archivo «${file.name}» no es un SVG válido.`);
    }
    const sanitized = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    const blob = new Blob([sanitized], { type: 'image/svg+xml' });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer el SVG.'));
      reader.readAsDataURL(blob);
    });
    return { width: null, height: null, hasAlpha: true, previewDataUrl: dataUrl };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(
          new Error(
            `El navegador no pudo decodificar «${file.name}». Para HEIC/TIFF asegúrate de usar un navegador o formato compatible.`
          )
        );
      el.src = objectUrl;
    });

    const width = img.naturalWidth || null;
    const height = img.naturalHeight || null;

    // Extract static frame (for animated GIF) and lightweight preview (<= 512px) while original stays untouched on server
    const maxPreview = 512;
    const scale = width && height ? Math.min(1, maxPreview / Math.max(width, height)) : 1;
    const pw = Math.max(1, Math.round((width || 256) * scale));
    const ph = Math.max(1, Math.round((height || 256) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d');
    let hasAlpha = ext === 'png' || ext === 'webp' || ext === 'gif' || ext === 'avif';
    if (ctx) {
      ctx.drawImage(img, 0, 0, pw, ph);
      try {
        const sample = ctx.getImageData(0, 0, pw, ph).data;
        for (let i = 3; i < sample.length; i += 16) {
          if (sample[i] < 255) {
            hasAlpha = true;
            break;
          }
        }
      } catch {
        // Ignore security error if tainted
      }
    }

    const previewDataUrl = canvas.toDataURL('image/png');
    return { width, height, hasAlpha, previewDataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export interface UploadChunkProgress {
  uploadedChunks: number;
  totalChunks: number;
  percent: number;
  resumed: boolean;
}

export async function uploadFileInChunks(
  file: File,
  inspection: ClientImageInspection,
  options: {
    onProgress?: (progress: UploadChunkProgress) => void;
    signal?: AbortSignal;
    simulateQuotaExceeded?: boolean;
  } = {}
): Promise<StoredFileMeta> {
  const buffer = await file.arrayBuffer();
  const sha256 = await computeSha256Hex(buffer);
  const totalChunks = Math.max(1, Math.ceil(buffer.byteLength / CHUNK_SIZE));
  const csrf = getCsrfToken();

  const initHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrf) initHeaders['X-CSRF-Token'] = csrf;
  if (options.simulateQuotaExceeded) {
    initHeaders['X-Simulate-Quota-Exceeded'] = '1';
  }

  const initRes = await fetch('/api/files/chunk/init', {
    method: 'POST',
    credentials: 'include',
    headers: initHeaders,
    signal: options.signal,
    body: JSON.stringify({
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      totalSize: buffer.byteLength,
      totalChunks,
      sha256,
    }),
  });

  const initJson = (await initRes.json()) as Record<string, unknown>;
  if (!initRes.ok) {
    throw new ApiError(
      typeof initJson.error === 'string'
        ? initJson.error
        : `Error al iniciar la carga de «${file.name}».`,
      initRes.status,
      initJson
    );
  }

  const uploadId = String(initJson.uploadId);
  const resumed = Boolean(initJson.resumed);
  const alreadyUploaded = new Set<number>(
    Array.isArray(initJson.uploadedChunks) ? (initJson.uploadedChunks as number[]) : []
  );

  options.onProgress?.({
    uploadedChunks: alreadyUploaded.size,
    totalChunks,
    percent: Math.round((alreadyUploaded.size / totalChunks) * 100),
    resumed,
  });

  for (let i = 0; i < totalChunks; i++) {
    if (options.signal?.aborted) {
      throw new DOMException('Carga interrumpida por el usuario.', 'AbortError');
    }
    if (alreadyUploaded.has(i)) continue;

    const start = i * CHUNK_SIZE;
    const end = Math.min(buffer.byteLength, start + CHUNK_SIZE);
    const slice = buffer.slice(start, end);

    let attempts = 0;
    while (true) {
      try {
        const chunkHeaders: Record<string, string> = {
          'Content-Type': 'application/octet-stream',
        };
        if (csrf) chunkHeaders['X-CSRF-Token'] = csrf;

        const chunkRes = await fetch(`/api/files/chunk/${encodeURIComponent(uploadId)}/${i}`, {
          method: 'PUT',
          credentials: 'include',
          headers: chunkHeaders,
          signal: options.signal,
          body: slice,
        });
        if (!chunkRes.ok) {
          const errJson = (await chunkRes.json().catch(() => ({}))) as Record<string, unknown>;
          throw new ApiError(
            typeof errJson.error === 'string'
              ? errJson.error
              : `Error en bloque ${i + 1} de «${file.name}».`,
            chunkRes.status,
            errJson
          );
        }
        alreadyUploaded.add(i);
        options.onProgress?.({
          uploadedChunks: alreadyUploaded.size,
          totalChunks,
          percent: Math.round((alreadyUploaded.size / totalChunks) * 100),
          resumed,
        });
        break;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        attempts += 1;
        if (attempts >= 3) throw err;
        await new Promise((r) => setTimeout(r, 350 * attempts));
      }
    }
  }

  const completeHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrf) completeHeaders['X-CSRF-Token'] = csrf;

  const completeRes = await fetch(`/api/files/chunk/${encodeURIComponent(uploadId)}/complete`, {
    method: 'POST',
    credentials: 'include',
    headers: completeHeaders,
    signal: options.signal,
    body: JSON.stringify({
      width: inspection.width,
      height: inspection.height,
      hasAlpha: inspection.hasAlpha,
    }),
  });

  const completeJson = (await completeRes.json()) as Record<string, unknown>;
  if (!completeRes.ok) {
    throw new ApiError(
      typeof completeJson.error === 'string'
        ? completeJson.error
        : `No se pudo finalizar la carga de «${file.name}».`,
      completeRes.status,
      completeJson
    );
  }

  return completeJson.file as StoredFileMeta;
}
