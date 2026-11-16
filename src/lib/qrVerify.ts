import jsQR from 'jsqr';
import type {
  PreviewTestBg,
  QrDesignConfig,
  QrExportConfig,
  VerifyCheckDetail,
  VerifyResult,
} from '../types/qr';
import type { QrMatrixResult } from './qrMatrix';
import { computeExportDimensions, loadImageElement, renderQrToCanvas } from './qrRenderer';
import { createDefaultDesign, solidColor } from './templates';
import { generateQrMatrix } from './qrMatrix';

function drawTestBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: PreviewTestBg
) {
  if (bg === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
  } else if (bg === 'black') {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);
  } else if (bg === 'gray') {
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, 0, w, h);
  } else {
    // Checkerboard
    const cell = Math.max(16, Math.round(w / 32));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#E2E8F0';
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        if (((x / cell) + (y / cell)) % 2 === 1) {
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }
  }
}

function decodeCanvasWithJsQr(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = jsQR(imageData.data, width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return result ? result.data : null;
}

function normalizeForCompare(str: string): string {
  return str.replace(/\r\n/g, '\n');
}

export async function verifyRenderedQrPng(params: {
  matrix: QrMatrixResult;
  expectedPayload: string;
  design: QrDesignConfig;
  exportConfig: QrExportConfig;
  testBg: PreviewTestBg;
  logoSrc: string | null;
}): Promise<VerifyResult> {
  const { matrix, expectedPayload, design, exportConfig, testBg, logoSrc } = params;
  const dims = computeExportDimensions(matrix.size, design, exportConfig);
  const longestSide = exportConfig.quality === 'high' ? 4096 : 1024;

  let logoImg: HTMLImageElement | null = null;
  if (logoSrc) {
    try {
      logoImg = await loadImageElement(logoSrc);
    } catch {
      logoImg = null;
    }
  }

  // Render the exact final PNG canvas at chosen quality & background mode
  const exportedCanvas = document.createElement('canvas');
  renderQrToCanvas(exportedCanvas, {
    matrix,
    design,
    exportConfig,
    targetLongestSide: longestSide,
    logoImage: logoImg,
  });

  const checks: VerifyCheckDetail[] = [];
  const diagnostics: string[] = [];

  if (exportConfig.backgroundMode === 'solid') {
    const decoded = decodeCanvasWithJsQr(exportedCanvas);
    const matches =
      decoded !== null &&
      normalizeForCompare(decoded) === normalizeForCompare(expectedPayload);
    checks.push({
      label: `PNG final (${dims.width} × ${dims.height} px, fondo sólido)`,
      passed: matches,
      decodedText: decoded,
      matchesExpected: matches,
    });
  } else {
    // Transparent mode: test over white AND over currently selected test background
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = exportedCanvas.width;
    compositeCanvas.height = exportedCanvas.height;
    const cctx = compositeCanvas.getContext('2d');

    if (cctx) {
      drawTestBackground(cctx, compositeCanvas.width, compositeCanvas.height, 'white');
      cctx.drawImage(exportedCanvas, 0, 0);
      const decodedWhite = decodeCanvasWithJsQr(compositeCanvas);
      const matchWhite =
        decodedWhite !== null &&
        normalizeForCompare(decodedWhite) === normalizeForCompare(expectedPayload);
      checks.push({
        label: 'Fondo transparente sobre blanco',
        passed: matchWhite,
        decodedText: decodedWhite,
        matchesExpected: matchWhite,
      });

      const bgLabels: Record<PreviewTestBg, string> = {
        white: 'blanco',
        black: 'negro',
        gray: 'gris',
        checkerboard: 'ajedrezado de prueba',
      };

      if (testBg !== 'white') {
        cctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        drawTestBackground(cctx, compositeCanvas.width, compositeCanvas.height, testBg);
        cctx.drawImage(exportedCanvas, 0, 0);
        const decodedTest = decodeCanvasWithJsQr(compositeCanvas);
        const matchTest =
          decodedTest !== null &&
          normalizeForCompare(decodedTest) === normalizeForCompare(expectedPayload);
        checks.push({
          label: `Fondo transparente sobre ${bgLabels[testBg]}`,
          passed: matchTest,
          decodedText: decodedTest,
          matchesExpected: matchTest,
        });
      }
    }
  }

  const overallPassed =
    checks.length > 0 && checks.every((c) => c.passed && c.matchesExpected);

  if (!overallPassed) {
    if (exportConfig.backgroundMode === 'transparent' && !exportConfig.transparentBasePlate) {
      diagnostics.push(
        'En fondo transparente sin base clara, los fondos oscuros o con patrón reducen el contraste. Activa «Base clara bajo el QR».'
      );
    }
    if (design.logo.fileId && design.logo.position === 'center' && design.logo.scale > 22) {
      diagnostics.push(
        `El logotipo centrado (${design.logo.scale}%) cubre demasiados módulos. Reduce la escala a 16%–20% o colócalo en el marco.`
      );
    }
    if (design.logo.fileId && design.logo.position === 'center' && design.errorCorrection !== 'H') {
      diagnostics.push(
        'Con logotipo centrado se recomienda usar corrección de errores Alta (H).'
      );
    }
    if (design.moduleShape === 'dots') {
      diagnostics.push(
        'Los puntos pequeños tienen menor área oscura; prueba módulos cuadrados o redondeados para mayor legibilidad.'
      );
    }
    if (diagnostics.length === 0) {
      diagnostics.push(
        'Revisa el contraste entre el color de los módulos y el fondo, o utiliza el botón «Mejorar legibilidad».'
      );
    }
  }

  return {
    overallPassed,
    expectedPayload,
    dimensions: dims,
    checks,
    diagnostics,
  };
}

export async function renderClassicFallbackPngBlob(payload: string): Promise<{
  blob: Blob;
  width: number;
  height: number;
}> {
  const classicDesign = createDefaultDesign();
  classicDesign.errorCorrection = 'H';
  classicDesign.moduleColor = solidColor('#000000');
  classicDesign.eyeOuterColor = solidColor('#000000');
  classicDesign.eyeInnerColor = solidColor('#000000');
  classicDesign.backgroundColor = solidColor('#FFFFFF');

  const classicExport: QrExportConfig = {
    fileName: 'qr-clasico',
    quality: 'medium',
    backgroundMode: 'solid',
    transparentBasePlate: false,
    transparentBaseColor: '#FFFFFF',
  };

  const { matrix } = generateQrMatrix(payload, 'H');
  if (!matrix) {
    throw new Error('No se pudo generar la versión clásica del QR.');
  }

  const canvas = document.createElement('canvas');
  const dims = renderQrToCanvas(canvas, {
    matrix,
    design: classicDesign,
    exportConfig: classicExport,
    targetLongestSide: 1024,
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Error al generar PNG'))), 'image/png');
  });

  return { blob, width: dims.width, height: dims.height };
}
