import QRCode from 'qrcode';
import type { ErrorCorrectionLevel } from '../types/qr';

export interface QrMatrixResult {
  size: number;
  version: number;
  modules: boolean[][];
  isFinderOuter: (r: number, c: number) => boolean;
  isFinderInner: (r: number, c: number) => boolean;
  isFunctional: (r: number, c: number) => boolean;
}

export function generateQrMatrix(
  payload: string,
  ecLevel: ErrorCorrectionLevel
): { matrix: QrMatrixResult | null; error: string | null } {
  if (!payload) {
    return { matrix: null, error: 'Sin contenido para codificar.' };
  }

  try {
    // Use byte mode segment when non-ASCII or arbitrary UTF-8 is present so acentos, ñ and emojis encode reliably
    const qr = QRCode.create(payload, {
      errorCorrectionLevel: ecLevel,
    });

    const size = qr.modules.size;
    const rawData = qr.modules.data;
    const modules: boolean[][] = [];

    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) {
        row.push(Boolean(rawData[r * size + c]));
      }
      modules.push(row);
    }

    const version = Math.round((size - 17) / 4);

    const inTopLeft = (r: number, c: number) => r < 7 && c < 7;
    const inTopRight = (r: number, c: number) => r < 7 && c >= size - 7;
    const inBottomLeft = (r: number, c: number) => r >= size - 7 && c < 7;

    const isFinder = (r: number, c: number) =>
      inTopLeft(r, c) || inTopRight(r, c) || inBottomLeft(r, c);

    const isFinderInner = (r: number, c: number) => {
      if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
      if (r >= 2 && r <= 4 && c >= size - 5 && c <= size - 3) return true;
      if (r >= size - 5 && r <= size - 3 && c >= 2 && c <= 4) return true;
      return false;
    };

    const isFinderOuter = (r: number, c: number) => isFinder(r, c) && !isFinderInner(r, c);

    const isFunctional = (r: number, c: number) => Boolean(qr.modules.isReserved(r, c));

    return {
      matrix: {
        size,
        version,
        modules,
        isFinderOuter,
        isFinderInner,
        isFunctional,
      },
      error: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo generar la matriz QR.';
    return { matrix: null, error: msg };
  }
}
