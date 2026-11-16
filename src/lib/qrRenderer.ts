import type {
  ColorSpec,
  QrDesignConfig,
  QrExportConfig,
} from '../types/qr';
import type { QrMatrixResult } from './qrMatrix';

export interface LayoutMetrics {
  baseWidth: number;
  baseHeight: number;
  qrBoxX: number;
  qrBoxY: number;
  qrBoxSize: number;
  qrMatrixX: number;
  qrMatrixY: number;
  qrMatrixSize: number;
  quietZonePx: number;
  frameRectX: number;
  frameRectY: number;
  frameRectW: number;
  frameRectH: number;
  textAreaRect: { x: number; y: number; w: number; h: number } | null;
  frameLogoRect: { x: number; y: number; w: number; h: number } | null;
}

export function computeLayoutMetrics(
  matrixSize: number,
  design: QrDesignConfig
): LayoutMetrics {
  // Base coordinate system around 1000px for QR box
  const frame = design.frame;
  const hasFrame = frame.style !== 'none';
  const hasFrameText = hasFrame && Boolean(frame.text.trim());
  const logoOutside =
    Boolean(design.logo.fileId || design.logo.previewUrl) &&
    design.logo.position.startsWith('frame_');

  // Enforce minimum 4-module quiet zone around QR
  const qrMatrixNominal = 760;
  const modulePx = qrMatrixNominal / matrixSize;
  const minQuietPx = modulePx * 4;
  const extraPad = hasFrame ? Math.max(0, frame.padding) : 0;
  const quietZonePx = Math.ceil(minQuietPx + extraPad * 0.4);
  const qrBoxSize = qrMatrixNominal + quietZonePx * 2;

  const thickness = hasFrame ? Math.max(4, frame.thickness) : 0;
  const outerMargin = hasFrame ? Math.max(24, Math.round(frame.shadowIntensity * 0.45)) : 24;

  const textBandH = hasFrameText ? 110 : 0;
  const logoSlotSize = logoOutside ? Math.round(110 + design.logo.scale * 2.2) : 0;

  const topExtra =
    logoOutside && design.logo.position === 'frame_top' ? logoSlotSize + 18 : 0;
  const bottomExtraLogo =
    logoOutside && design.logo.position === 'frame_bottom' ? logoSlotSize + 18 : 0;
  const leftExtra =
    logoOutside && design.logo.position === 'frame_left' ? logoSlotSize + 18 : 0;
  const rightExtra =
    logoOutside && design.logo.position === 'frame_right' ? logoSlotSize + 18 : 0;

  const circleExtra = frame.style === 'circle_decorative' ? 96 : 0;

  const frameRectX = outerMargin;
  const frameRectY = outerMargin;
  const frameInnerW = qrBoxSize + leftExtra + rightExtra + thickness * 2 + circleExtra * 2;
  const frameInnerH =
    qrBoxSize +
    topExtra +
    bottomExtraLogo +
    textBandH +
    thickness * 2 +
    circleExtra * 2;

  const baseWidth = Math.round(frameInnerW + outerMargin * 2);
  const baseHeight = Math.round(frameInnerH + outerMargin * 2);

  const qrBoxX = frameRectX + thickness + circleExtra + leftExtra;
  const qrBoxY = frameRectY + thickness + circleExtra + topExtra;
  const qrMatrixX = qrBoxX + quietZonePx;
  const qrMatrixY = qrBoxY + quietZonePx;

  let textAreaRect: { x: number; y: number; w: number; h: number } | null = null;
  if (hasFrameText) {
    textAreaRect = {
      x: frameRectX + thickness,
      y: qrBoxY + qrBoxSize + bottomExtraLogo + circleExtra,
      w: frameInnerW - thickness * 2,
      h: textBandH,
    };
  }

  let frameLogoRect: { x: number; y: number; w: number; h: number } | null = null;
  if (logoOutside) {
    if (design.logo.position === 'frame_top') {
      frameLogoRect = {
        x: qrBoxX + (qrBoxSize - logoSlotSize) / 2,
        y: frameRectY + thickness + circleExtra + 8,
        w: logoSlotSize,
        h: logoSlotSize,
      };
    } else if (design.logo.position === 'frame_bottom') {
      frameLogoRect = {
        x: qrBoxX + (qrBoxSize - logoSlotSize) / 2,
        y: qrBoxY + qrBoxSize + 10,
        w: logoSlotSize,
        h: logoSlotSize,
      };
    } else if (design.logo.position === 'frame_left') {
      frameLogoRect = {
        x: frameRectX + thickness + circleExtra + 8,
        y: qrBoxY + (qrBoxSize - logoSlotSize) / 2,
        w: logoSlotSize,
        h: logoSlotSize,
      };
    } else if (design.logo.position === 'frame_right') {
      frameLogoRect = {
        x: qrBoxX + qrBoxSize + 10,
        y: qrBoxY + (qrBoxSize - logoSlotSize) / 2,
        w: logoSlotSize,
        h: logoSlotSize,
      };
    }
  }

  return {
    baseWidth,
    baseHeight,
    qrBoxX,
    qrBoxY,
    qrBoxSize,
    qrMatrixX,
    qrMatrixY,
    qrMatrixSize: qrMatrixNominal,
    quietZonePx,
    frameRectX,
    frameRectY,
    frameRectW: frameInnerW,
    frameRectH: frameInnerH,
    textAreaRect,
    frameLogoRect,
  };
}

export function computeExportDimensions(
  matrixSize: number,
  design: QrDesignConfig,
  exportConfig: QrExportConfig
): { width: number; height: number } {
  const metrics = computeLayoutMetrics(matrixSize, design);
  const targetLongest = exportConfig.quality === 'high' ? 4096 : 1024;
  const maxDim = Math.max(metrics.baseWidth, metrics.baseHeight);
  const scale = targetLongest / maxDim;
  return {
    width: Math.max(1, Math.round(metrics.baseWidth * scale)),
    height: Math.max(1, Math.round(metrics.baseHeight * scale)),
  };
}

function createFillStyle(
  ctx: CanvasRenderingContext2D,
  spec: ColorSpec,
  x: number,
  y: number,
  w: number,
  h: number
): string | CanvasGradient {
  if (spec.mode === 'solid' || !spec.stops || spec.stops.length === 0) {
    return spec.color || '#000000';
  }

  const sorted = [...spec.stops].sort((a, b) => a.offset - b.offset);

  if (spec.mode === 'radial') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.max(w, h) * 0.65;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
    for (const stop of sorted) {
      grad.addColorStop(Math.max(0, Math.min(1, stop.offset / 100)), stop.color);
    }
    return grad;
  }

  // Linear gradient by angle
  const rad = ((spec.angle ?? 135) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const halfLen = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
  const dx = Math.cos(rad) * halfLen;
  const dy = Math.sin(rad) * halfLen;
  const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  for (const stop of sorted) {
    grad.addColorStop(Math.max(0, Math.min(1, stop.offset / 100)), stop.color);
  }
  return grad;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawFinderEye(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  modSize: number,
  outerShape: QrDesignConfig['eyeOuterShape'],
  innerShape: QrDesignConfig['eyeInnerShape'],
  outerFill: string | CanvasGradient,
  innerFill: string | CanvasGradient
) {
  const outerW = modSize * 7;
  const midOffset = modSize;
  const midW = modSize * 5;
  const innerOffset = modSize * 2;
  const innerW = modSize * 3;

  // Outer 7x7 ring (with 5x5 cutout using evenodd rule)
  ctx.save();
  ctx.fillStyle = outerFill;
  ctx.beginPath();

  if (outerShape === 'circle') {
    const cx = originX + outerW / 2;
    const cy = originY + outerW / 2;
    ctx.arc(cx, cy, outerW / 2, 0, Math.PI * 2);
    ctx.arc(cx, cy, midW / 2, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  } else if (outerShape === 'dots') {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6) {
          ctx.moveTo(originX + (c + 0.5) * modSize + modSize * 0.42, originY + (r + 0.5) * modSize);
          ctx.arc(
            originX + (c + 0.5) * modSize,
            originY + (r + 0.5) * modSize,
            modSize * 0.42,
            0,
            Math.PI * 2
          );
        }
      }
    }
    ctx.fill();
  } else {
    const outerR = outerShape === 'rounded' ? modSize * 1.6 : 0;
    const innerR = outerShape === 'rounded' ? modSize * 1.0 : 0;

    // Outer clockwise
    const addRect = (x: number, y: number, w: number, h: number, r: number, ccw: boolean) => {
      const rad = Math.max(0, Math.min(r, w / 2));
      if (!ccw) {
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        ctx.lineTo(x + rad, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
        ctx.lineTo(x, y + rad);
        ctx.quadraticCurveTo(x, y, x + rad, y);
      } else {
        ctx.moveTo(x + rad, y);
        ctx.quadraticCurveTo(x, y, x, y + rad);
        ctx.lineTo(x, y + h - rad);
        ctx.quadraticCurveTo(x, y + h, x + rad, y + h);
        ctx.lineTo(x + w - rad, y + h);
        ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - rad);
        ctx.lineTo(x + w, y + rad);
        ctx.quadraticCurveTo(x + w, y, x + w - rad, y);
        ctx.lineTo(x + rad, y);
      }
      ctx.closePath();
    };

    addRect(originX, originY, outerW, outerW, outerR, false);
    addRect(originX + midOffset, originY + midOffset, midW, midW, innerR, true);
    ctx.fill('evenodd');
  }

  // Inner 3x3 pupil
  ctx.fillStyle = innerFill;
  const ix = originX + innerOffset;
  const iy = originY + innerOffset;

  if (innerShape === 'circle') {
    ctx.beginPath();
    ctx.arc(ix + innerW / 2, iy + innerW / 2, innerW / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (innerShape === 'dots') {
    ctx.beginPath();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cx = ix + (c + 0.5) * modSize;
        const cy = iy + (r + 0.5) * modSize;
        ctx.moveTo(cx + modSize * 0.43, cy);
        ctx.arc(cx, cy, modSize * 0.43, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  } else {
    drawRoundedRectPath(ctx, ix, iy, innerW, innerW, innerShape === 'rounded' ? modSize * 0.8 : 0);
    ctx.fill();
  }

  ctx.restore();
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen del logotipo.'));
    img.src = src;
  });
}

function drawLogoInBox(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  rotationDeg: number,
  cornerRadiusPct: number,
  hasBase: boolean,
  baseColor: string,
  basePadding: number
) {
  ctx.save();
  const cx = boxX + boxW / 2;
  const cy = boxY + boxH / 2;

  ctx.translate(cx, cy);
  if (rotationDeg) {
    ctx.rotate((rotationDeg * Math.PI) / 180);
  }

  const totalW = boxW + (hasBase ? basePadding * 2 : 0);
  const totalH = boxH + (hasBase ? basePadding * 2 : 0);
  const rad = (Math.min(totalW, totalH) / 2) * (cornerRadiusPct / 50);

  if (hasBase) {
    ctx.fillStyle = baseColor || '#FFFFFF';
    drawRoundedRectPath(ctx, -totalW / 2, -totalH / 2, totalW, totalH, rad);
    ctx.fill();
  }

  // Preserve aspect ratio of original logo inside boxW x boxH
  const imgRatio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
  let drawW = boxW;
  let drawH = boxH;
  if (imgRatio > 1) {
    drawH = boxW / imgRatio;
  } else if (imgRatio < 1) {
    drawW = boxH * imgRatio;
  }

  const clipRad = (Math.min(drawW, drawH) / 2) * (cornerRadiusPct / 50);
  ctx.save();
  drawRoundedRectPath(ctx, -drawW / 2, -drawH / 2, drawW, drawH, clipRad);
  ctx.clip();
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  ctx.restore();
}

export interface RenderQrOptions {
  matrix: QrMatrixResult;
  design: QrDesignConfig;
  exportConfig: QrExportConfig;
  targetLongestSide?: number; // If omitted, uses base metrics (~1000px) for fast live preview
  logoImage?: HTMLImageElement | null;
}

export function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  options: RenderQrOptions
): { width: number; height: number } {
  const { matrix, design, exportConfig, targetLongestSide, logoImage } = options;
  const metrics = computeLayoutMetrics(matrix.size, design);
  const maxBase = Math.max(metrics.baseWidth, metrics.baseHeight);
  const scale = targetLongestSide ? targetLongestSide / maxBase : 1;

  const width = Math.max(1, Math.round(metrics.baseWidth * scale));
  const height = Math.max(1, Math.round(metrics.baseHeight * scale));

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return { width, height };

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.scale(scale, scale);

  const isTransparent = exportConfig.backgroundMode === 'transparent';
  const frame = design.frame;
  const hasFrame = frame.style !== 'none';
  const texture = design.texture;

  // 1. Background fill if solid mode
  if (!isTransparent) {
    ctx.fillStyle = createFillStyle(
      ctx,
      design.backgroundColor,
      0,
      0,
      metrics.baseWidth,
      metrics.baseHeight
    );
    ctx.fillRect(0, 0, metrics.baseWidth, metrics.baseHeight);
  }

  // 2. Frame & Texture effects (applied on frame / card surface, keeping QR crisp)
  if (hasFrame) {
    ctx.save();
    const { frameRectX: fx, frameRectY: fy, frameRectW: fw, frameRectH: fh } = metrics;

    // Shadow for frame / relief
    const shadowStrength =
      texture.mode === 'relief'
        ? Math.max(frame.shadowIntensity, texture.shadow)
        : frame.shadowIntensity;

    if (shadowStrength > 0) {
      ctx.shadowColor = `rgba(15, 23, 42, ${Math.min(0.45, shadowStrength / 180)})`;
      ctx.shadowBlur = shadowStrength * 0.45;
      ctx.shadowOffsetX = texture.mode === 'relief' ? 0 : shadowStrength * 0.08;
      ctx.shadowOffsetY = shadowStrength * 0.16;
    }

    const frameFill = createFillStyle(ctx, frame.color, fx, fy, fw, fh);
    const frameRadius =
      frame.style === 'square'
        ? 4
        : frame.style === 'circle_decorative'
          ? Math.min(fw, fh) / 2
          : frame.cornerRadius;

    ctx.fillStyle = frameFill;
    drawRoundedRectPath(ctx, fx, fy, fw, fh, frameRadius);
    ctx.fill();

    // Reset shadow before inner surface & highlights
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Texture overlays exclusively on frame
    if (texture.mode === 'metallic') {
      const sheen = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
      const gAlpha = (texture.gloss / 100) * 0.35;
      sheen.addColorStop(0, `rgba(255,255,255,${gAlpha})`);
      sheen.addColorStop(0.38, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.52, `rgba(255,255,255,${gAlpha * 1.15})`);
      sheen.addColorStop(0.75, `rgba(0,0,0,${(texture.intensity / 100) * 0.18})`);
      sheen.addColorStop(1, `rgba(255,255,255,${gAlpha * 0.6})`);
      ctx.fillStyle = sheen;
      drawRoundedRectPath(ctx, fx, fy, fw, fh, frameRadius);
      ctx.fill();
    } else if (texture.mode === 'relief') {
      // Top-left bevel highlight & bottom-right bevel shade
      ctx.strokeStyle = `rgba(255,255,255,${(texture.gloss / 100) * 0.45})`;
      ctx.lineWidth = Math.max(2, frame.thickness * 0.15);
      drawRoundedRectPath(ctx, fx + 2, fy + 2, fw - 4, fh - 4, Math.max(0, frameRadius - 2));
      ctx.stroke();

      ctx.strokeStyle = `rgba(0,0,0,${(texture.intensity / 100) * 0.25})`;
      ctx.lineWidth = Math.max(2, frame.thickness * 0.12);
      drawRoundedRectPath(ctx, fx + 1, fy + 1, fw - 2, fh - 2, frameRadius);
      ctx.stroke();
    } else if (texture.mode === 'matte') {
      const matteOverlay = ctx.createLinearGradient(fx, fy, fx, fy + fh);
      matteOverlay.addColorStop(0, `rgba(255,255,255,${(texture.intensity / 100) * 0.08})`);
      matteOverlay.addColorStop(1, `rgba(0,0,0,${(texture.intensity / 100) * 0.12})`);
      ctx.fillStyle = matteOverlay;
      drawRoundedRectPath(ctx, fx, fy, fw, fh, frameRadius);
      ctx.fill();
    }

    // Tag / Ribbon decorative accents
    if (frame.style === 'tag') {
      ctx.fillStyle = frame.textColor || '#FFFFFF';
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(fx + fw / 2, fy + frame.thickness * 0.65 + 10, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Inner clear QR well inside frame
    const wellRadius =
      frame.style === 'square'
        ? 2
        : frame.style === 'circle_decorative'
          ? 24
          : Math.max(8, frame.cornerRadius - frame.thickness * 0.4);

    if (!isTransparent || exportConfig.transparentBasePlate) {
      ctx.fillStyle = isTransparent
        ? exportConfig.transparentBaseColor || '#FFFFFF'
        : createFillStyle(
            ctx,
            design.backgroundColor,
            metrics.qrBoxX,
            metrics.qrBoxY,
            metrics.qrBoxSize,
            metrics.qrBoxSize
          );
      drawRoundedRectPath(
        ctx,
        metrics.qrBoxX,
        metrics.qrBoxY,
        metrics.qrBoxSize,
        metrics.qrBoxSize,
        wellRadius
      );
      ctx.fill();
    } else {
      // Cut out transparent QR well from frame!
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000000';
      drawRoundedRectPath(
        ctx,
        metrics.qrBoxX,
        metrics.qrBoxY,
        metrics.qrBoxSize,
        metrics.qrBoxSize,
        wellRadius
      );
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // Frame text
    if (metrics.textAreaRect && frame.text.trim()) {
      const tr = metrics.textAreaRect;
      ctx.fillStyle = frame.textColor || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fontSize = Math.min(54, Math.max(26, Math.round(tr.h * 0.46)));
      ctx.font = `700 ${fontSize}px "${frame.fontFamily}", sans-serif`;

      if (frame.style === 'ribbon') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        drawRoundedRectPath(ctx, tr.x + 12, tr.y + 10, tr.w - 24, tr.h - 20, 14);
        ctx.fill();
        ctx.fillStyle = frame.textColor || '#FFFFFF';
      }

      ctx.fillText(frame.text.trim(), tr.x + tr.w / 2, tr.y + tr.h / 2, tr.w - 40);
    }

    ctx.restore();
  } else if (isTransparent && exportConfig.transparentBasePlate) {
    // Optional light base plate underneath QR and its 4-module quiet zone when no frame
    ctx.save();
    ctx.fillStyle = exportConfig.transparentBaseColor || '#FFFFFF';
    drawRoundedRectPath(
      ctx,
      metrics.qrBoxX,
      metrics.qrBoxY,
      metrics.qrBoxSize,
      metrics.qrBoxSize,
      16
    );
    ctx.fill();
    ctx.restore();
  } else if (!hasFrame && !isTransparent && texture.mode === 'relief') {
    // Subtle relief plate behind QR when no frame is chosen
    ctx.save();
    ctx.shadowColor = `rgba(15, 23, 42, ${Math.min(0.28, texture.shadow / 220)})`;
    ctx.shadowBlur = texture.shadow * 0.35;
    ctx.shadowOffsetY = texture.shadow * 0.14;
    ctx.fillStyle = createFillStyle(
      ctx,
      design.backgroundColor,
      metrics.qrBoxX,
      metrics.qrBoxY,
      metrics.qrBoxSize,
      metrics.qrBoxSize
    );
    drawRoundedRectPath(ctx, metrics.qrBoxX, metrics.qrBoxY, metrics.qrBoxSize, metrics.qrBoxSize, 18);
    ctx.fill();
    ctx.restore();
  }

  // 3. Draw QR Modules (excluding 3 finder eye zones)
  const modSize = metrics.qrMatrixSize / matrix.size;
  const mx = metrics.qrMatrixX;
  const my = metrics.qrMatrixY;

  const moduleFill = createFillStyle(
    ctx,
    design.moduleColor,
    mx,
    my,
    metrics.qrMatrixSize,
    metrics.qrMatrixSize
  );

  const imageMask = logoImage && design.logo.position === 'modules' ? new Path2D() : null;
  const modulePath = (px: number, py: number, functional: boolean) => {
    const path = new Path2D();
    if (functional && logoImage) {
      path.rect(px, py, modSize, modSize);
    } else if (design.moduleShape === 'dots' || design.moduleShape === 'circle') {
      const radius = modSize * (design.moduleShape === 'dots' ? (logoImage ? 0.46 : 0.38) : 0.47);
      path.arc(px + modSize / 2, py + modSize / 2, radius, 0, Math.PI * 2);
    } else if (design.moduleShape === 'rounded') {
      path.roundRect(px + modSize * 0.04, py + modSize * 0.04, modSize * 0.92, modSize * 0.92, modSize * 0.28);
    } else {
      path.rect(px, py, modSize + 0.35, modSize + 0.35);
    }
    return path;
  };

  // Subtle module relief shadow if relief mode active (kept subtle to protect scan reliability)
  ctx.save();
  if (texture.mode === 'relief' && texture.intensity > 0) {
    ctx.shadowColor = `rgba(15, 23, 42, ${(texture.intensity / 100) * 0.16})`;
    ctx.shadowBlur = modSize * 0.18;
    ctx.shadowOffsetX = modSize * 0.04;
    ctx.shadowOffsetY = modSize * 0.08;
  }

  ctx.fillStyle = moduleFill;

  // Compute safe centered logo exclusion box in module coordinates if logo is centered
  let logoExcludeRect: { x: number; y: number; w: number; h: number } | null = null;
  if (logoImage && design.logo.position === 'center') {
    const clampedScale = Math.max(10, Math.min(32, design.logo.scale));
    const logoDim = (metrics.qrMatrixSize * clampedScale) / 100;
    const maxOffset = metrics.qrMatrixSize * 0.12;
    const ox = (Math.max(-15, Math.min(15, design.logo.offsetX)) / 15) * maxOffset;
    const oy = (Math.max(-15, Math.min(15, design.logo.offsetY)) / 15) * maxOffset;
    const pad = design.logo.hasBase ? design.logo.basePadding : 2;
    logoExcludeRect = {
      x: mx + (metrics.qrMatrixSize - logoDim) / 2 + ox - pad,
      y: my + (metrics.qrMatrixSize - logoDim) / 2 + oy - pad,
      w: logoDim + pad * 2,
      h: logoDim + pad * 2,
    };
  }

  const isInsideLogoExclude = (px: number, py: number, size: number) => {
    if (!logoExcludeRect) return false;
    return (
      px + size > logoExcludeRect.x &&
      px < logoExcludeRect.x + logoExcludeRect.w &&
      py + size > logoExcludeRect.y &&
      py < logoExcludeRect.y + logoExcludeRect.h
    );
  };

  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (!matrix.modules[r][c]) continue;
      // Skip 3 finder eye blocks (drawn cleanly with dedicated eye style)
      const inTL = r < 7 && c < 7;
      const inTR = r < 7 && c >= matrix.size - 7;
      const inBL = r >= matrix.size - 7 && c < 7;
      if (inTL || inTR || inBL) continue;

      const px = mx + c * modSize;
      const py = my + r * modSize;

      // Never hide functional patterns; only clear non-functional data modules behind centered logo
      if (!matrix.isFunctional(r, c) && isInsideLogoExclude(px, py, modSize)) {
        continue;
      }

      const path = modulePath(px, py, matrix.isFunctional(r, c));
      ctx.fill(path);
      if (imageMask && !matrix.isFunctional(r, c)) imageMask.addPath(path);
    }
  }
  ctx.restore();

  if (imageMask && logoImage) {
    const dimension = metrics.qrMatrixSize;
    const factor = dimension / Math.min(logoImage.naturalWidth, logoImage.naturalHeight);
    const w = logoImage.naturalWidth * factor;
    const h = logoImage.naturalHeight * factor;
    ctx.save();
    ctx.clip(imageMask);
    ctx.globalAlpha = 0.33;
    ctx.drawImage(logoImage, mx + (dimension - w) / 2, my + (dimension - h) / 2, w, h);
    ctx.restore();
  }

  // 4. Draw 3 Finder Eyes independently
  const eyeOuterFill = createFillStyle(
    ctx,
    design.eyeOuterColor,
    mx,
    my,
    metrics.qrMatrixSize,
    metrics.qrMatrixSize
  );
  const eyeInnerFill = createFillStyle(
    ctx,
    design.eyeInnerColor,
    mx,
    my,
    metrics.qrMatrixSize,
    metrics.qrMatrixSize
  );

  const eyePositions = [
    { x: mx, y: my },
    { x: mx + (matrix.size - 7) * modSize, y: my },
    { x: mx, y: my + (matrix.size - 7) * modSize },
  ];

  for (const pos of eyePositions) {
    drawFinderEye(
      ctx,
      pos.x,
      pos.y,
      modSize,
      design.eyeOuterShape,
      design.eyeInnerShape,
      eyeOuterFill,
      eyeInnerFill
    );
  }

  // 5. Draw Logo (Center or Outside in Frame)
  if (logoImage) {
    if (design.logo.position === 'center') {
      const clampedScale = Math.max(10, Math.min(32, design.logo.scale));
      const logoDim = (metrics.qrMatrixSize * clampedScale) / 100;
      const maxOffset = metrics.qrMatrixSize * 0.12;
      const ox = (Math.max(-15, Math.min(15, design.logo.offsetX)) / 15) * maxOffset;
      const oy = (Math.max(-15, Math.min(15, design.logo.offsetY)) / 15) * maxOffset;
      const lx = mx + (metrics.qrMatrixSize - logoDim) / 2 + ox;
      const ly = my + (metrics.qrMatrixSize - logoDim) / 2 + oy;

      ctx.save();
      const available = new Path2D();
      available.rect(mx, my, metrics.qrMatrixSize, metrics.qrMatrixSize);
      for (let row = 0; row < matrix.size; row++) {
        for (let col = 0; col < matrix.size; col++) {
          if (matrix.isFunctional(row, col)) {
            available.rect(mx + col * modSize, my + row * modSize, modSize, modSize);
          }
        }
      }
      ctx.clip(available, 'evenodd');
      drawLogoInBox(
        ctx,
        logoImage,
        lx,
        ly,
        logoDim,
        logoDim,
        design.logo.rotation,
        design.logo.cornerRadius,
        design.logo.hasBase,
        design.logo.baseColor,
        design.logo.basePadding
      );
      ctx.restore();
    } else if (metrics.frameLogoRect) {
      const r = metrics.frameLogoRect;
      drawLogoInBox(
        ctx,
        logoImage,
        r.x,
        r.y,
        r.w,
        r.h,
        design.logo.rotation,
        design.logo.cornerRadius,
        design.logo.hasBase,
        design.logo.baseColor,
        design.logo.basePadding
      );
    }
  }

  ctx.restore();
  return { width, height };
}
