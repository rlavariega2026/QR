import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, PRIVATE_STORAGE_DIR } from './db.ts';

export const DEFAULT_MAX_STORAGE_BYTES = Number(
  process.env.MAX_STORAGE_BYTES || 500 * 1024 * 1024
); // 500 MB default quota

export interface DetectedImageInfo {
  mime: string;
  extension: string;
  width: number | null;
  height: number | null;
  hasAlpha: boolean;
  sanitizedBuffer?: Buffer;
}

export function sanitizeSvgContent(rawSvg: string): Buffer {
  // Remove dangerous tags, event handlers, javascript: URIs, and external references
  let clean = rawSvg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("\s*https?:[^"]*"|'\s*https?:[^']*')/gi, '');

  if (!/<svg[\s>]/i.test(clean)) {
    throw new Error('El archivo SVG no contiene una etiqueta raíz <svg> válida.');
  }
  return Buffer.from(clean, 'utf8');
}

export function inspectAndValidateImageBuffer(
  buf: Buffer,
  declaredMime: string,
  originalName: string
): DetectedImageInfo {
  if (buf.length < 12) {
    throw new Error('El archivo está vacío o demasiado corrupto.');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    let width: number | null = null;
    let height: number | null = null;
    let hasAlpha = false;
    if (buf.length >= 26 && buf.toString('ascii', 12, 16) === 'IHDR') {
      width = buf.readUInt32BE(16);
      height = buf.readUInt32BE(20);
      const colorType = buf[25];
      hasAlpha = colorType === 4 || colorType === 6 || buf.includes(Buffer.from('tRNS'));
    }
    return { mime: 'image/png', extension: 'png', width, height, hasAlpha };
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg', width: null, height: null, hasAlpha: false };
  }

  // GIF: GIF87a or GIF89a
  const head6 = buf.toString('ascii', 0, 6);
  if (head6 === 'GIF87a' || head6 === 'GIF89a') {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    return { mime: 'image/gif', extension: 'gif', width, height, hasAlpha: true };
  }

  // WebP: RIFF....WEBP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp', width: null, height: null, hasAlpha: true };
  }

  // BMP: BM
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    const width = buf.length >= 26 ? Math.abs(buf.readInt32LE(18)) : null;
    const height = buf.length >= 26 ? Math.abs(buf.readInt32LE(22)) : null;
    return { mime: 'image/bmp', extension: 'bmp', width, height, hasAlpha: false };
  }

  // TIFF: II*\0 or MM\0*
  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  ) {
    return { mime: 'image/tiff', extension: 'tiff', width: null, height: null, hasAlpha: true };
  }

  // AVIF / HEIC: ISO BMFF ftyp box
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', extension: 'avif', width: null, height: null, hasAlpha: true };
    }
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'msf1') {
      return { mime: 'image/heic', extension: 'heic', width: null, height: null, hasAlpha: true };
    }
  }

  // SVG: XML/text starting with <svg or <?xml containing <svg
  const ext = path.extname(originalName).toLowerCase();
  const sampleText = buf.toString('utf8', 0, Math.min(buf.length, 4096)).trimStart();
  if (
    declaredMime === 'image/svg+xml' ||
    ext === '.svg' ||
    sampleText.startsWith('<svg') ||
    (sampleText.startsWith('<?xml') && sampleText.toLowerCase().includes('<svg'))
  ) {
    const sanitized = sanitizeSvgContent(buf.toString('utf8'));
    return {
      mime: 'image/svg+xml',
      extension: 'svg',
      width: null,
      height: null,
      hasAlpha: true,
      sanitizedBuffer: sanitized,
    };
  }

  throw new Error(
    'Formato de archivo no admitido o firma binaria inválida. Usa PNG, JPG, WebP, BMP, GIF, SVG saneado, AVIF, HEIC o TIFF.'
  );
}

export function getUsedStorageBytes(): number {
  const row = db.prepare('SELECT COALESCE(SUM(byte_size), 0) as total FROM files').get() as {
    total: number;
  };
  return row.total;
}

export function persistVerifiedFile(params: {
  ownerId: string;
  originalName: string;
  buffer: Buffer;
  declaredMime: string;
  clientWidth?: number | null;
  clientHeight?: number | null;
  clientHasAlpha?: boolean;
}) {
  const info = inspectAndValidateImageBuffer(
    params.buffer,
    params.declaredMime,
    params.originalName
  );
  const finalBuf = info.sanitizedBuffer ?? params.buffer;
  const sha256 = crypto.createHash('sha256').update(finalBuf).digest('hex');

  const fileId = `fil_${crypto.randomUUID().replace(/-/g, '')}`;
  const storageName = `${fileId}.${info.extension}`;
  const destPath = path.join(PRIVATE_STORAGE_DIR, storageName);
  fs.writeFileSync(destPath, finalBuf);

  const width = info.width ?? params.clientWidth ?? null;
  const height = info.height ?? params.clientHeight ?? null;
  const hasAlpha = info.hasAlpha || Boolean(params.clientHasAlpha) ? 1 : 0;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO files (id, owner_id, storage_name, original_name, mime_type, byte_size, width, height, has_alpha, sha256, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    fileId,
    params.ownerId,
    storageName,
    params.originalName,
    info.mime,
    finalBuf.length,
    width,
    height,
    hasAlpha,
    sha256,
    createdAt
  );

  return {
    id: fileId,
    ownerId: params.ownerId,
    originalName: params.originalName,
    mimeType: info.mime,
    byteSize: finalBuf.length,
    width,
    height,
    hasAlpha: Boolean(hasAlpha),
    sha256,
    createdAt,
  };
}
