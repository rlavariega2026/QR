import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  CheckCircle2,
  CopyPlus,
  Download,
  ExternalLink,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { generateQrMatrix } from '../lib/qrMatrix';
import {
  computeExportDimensions,
  loadImageElement,
  renderQrToCanvas,
} from '../lib/qrRenderer';
import { renderClassicFallbackPngBlob, verifyRenderedQrPng } from '../lib/qrVerify';
import { solidColor } from '../lib/templates';
import type {
  PreviewTestBg,
  QrDesignConfig,
  QrExportConfig,
  VerifyResult,
} from '../types/qr';

interface QrPreviewAndExportProps {
  projectName: string | null;
  projectVersion: number | null;
  payload: string;
  payloadErrors: string[];
  exceedsCapacity: boolean;
  design: QrDesignConfig;
  exportConfig: QrExportConfig;
  onChangeDesign: (next: QrDesignConfig) => void;
  onChangeExport: (next: QrExportConfig) => void;
  onSaveChanges: () => void;
  onSaveAs: () => void;
  onSaveTemplate: () => void;
  saving: boolean;
  saveStatusMessage: string | null;
}

export function QrPreviewAndExport({
  projectName,
  projectVersion,
  payload,
  payloadErrors,
  exceedsCapacity,
  design,
  exportConfig,
  onChangeDesign,
  onChangeExport,
  onSaveChanges,
  onSaveAs,
  onSaveTemplate,
  saving,
  saveStatusMessage,
}: QrPreviewAndExportProps) {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(100);
  const [testBg, setTestBg] = useState<PreviewTestBg>('checkerboard');
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [manualPngUrl, setManualPngUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const logoSrc = useMemo(() => {
    if (design.logo.previewUrl) return design.logo.previewUrl;
    if (design.logo.fileId) return `/api/files/${encodeURIComponent(design.logo.fileId)}`;
    return null;
  }, [design.logo.fileId, design.logo.previewUrl]);

  useEffect(() => {
    let active = true;
    if (!logoSrc) {
      setLogoImg(null);
      return;
    }
    loadImageElement(logoSrc)
      .then((img) => {
        if (active) setLogoImg(img);
      })
      .catch(() => {
        if (active) setLogoImg(null);
      });
    return () => {
      active = false;
    };
  }, [logoSrc]);

  const effectivePayload = payload && !exceedsCapacity ? payload : 'https://generadorqrlav.local';

  const { matrix, error: matrixError } = useMemo(
    () => generateQrMatrix(effectivePayload, design.errorCorrection),
    [effectivePayload, design.errorCorrection]
  );

  const finalDims = useMemo(() => {
    if (!matrix) return { width: 1024, height: 1024 };
    return computeExportDimensions(matrix.size, design, exportConfig);
  }, [matrix, design, exportConfig]);

  // Instant canvas render
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !matrix) return;
    renderQrToCanvas(canvas, {
      matrix,
      design,
      exportConfig,
      logoImage: logoImg,
    });
  }, [matrix, design, exportConfig, logoImg]);

  // Clear previous verification whenever design/payload/export changes
  useEffect(() => {
    setVerifyResult(null);
  }, [payload, design, exportConfig, testBg]);

  const canExport = Boolean(matrix) && payloadErrors.length === 0 && !exceedsCapacity && Boolean(payload);

  const handleVerify = async () => {
    if (!matrix || !payload || exceedsCapacity) return;
    setVerifying(true);
    setExportError(null);
    try {
      const res = await verifyRenderedQrPng({
        matrix,
        expectedPayload: payload,
        design,
        exportConfig,
        testBg,
        logoSrc,
      });
      setVerifyResult(res);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Error al verificar el código QR.');
    } finally {
      setVerifying(false);
    }
  };

  const handleImproveLegibility = () => {
    onChangeDesign({
      ...design,
      errorCorrection: 'H',
      moduleShape: design.moduleShape === 'dots' ? 'rounded' : design.moduleShape,
      moduleColor: solidColor('#000000'),
      eyeOuterColor: solidColor('#000000'),
      eyeInnerColor: solidColor('#000000'),
      backgroundColor: solidColor('#FFFFFF'),
      logo: {
        ...design.logo,
        scale: Math.min(design.logo.scale, 18),
        hasBase: true,
        baseColor: '#FFFFFF',
        basePadding: Math.max(10, design.logo.basePadding),
      },
    });
    if (exportConfig.backgroundMode === 'transparent') {
      onChangeExport({
        ...exportConfig,
        transparentBasePlate: true,
        transparentBaseColor: '#FFFFFF',
      });
    }
  };

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    setManualPngUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    const safeName = (fileName.trim() || 'codigo-qr').replace(/[^a-zA-Z0-9._-]/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName.endsWith('.png') ? safeName : `${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadClassic = async () => {
    if (!payload || exceedsCapacity) return;
    try {
      const { blob } = await renderClassicFallbackPngBlob(payload);
      triggerBlobDownload(blob, `${exportConfig.fileName || 'qr'}-clasico`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo generar la versión clásica.');
    }
  };

  const handleDownloadPng = async () => {
    if (!matrix || !canExport) return;
    setDownloading(true);
    setExportError(null);
    try {
      let fullResLogo: HTMLImageElement | null = logoImg;
      if (logoSrc) {
        fullResLogo = await loadImageElement(logoSrc);
      }
      const longest = exportConfig.quality === 'high' ? 4096 : 1024;
      const offscreen = document.createElement('canvas');
      renderQrToCanvas(offscreen, {
        matrix,
        design,
        exportConfig,
        targetLongestSide: longest,
        logoImage: fullResLogo,
      });

      const blob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('No se pudo codificar el PNG final.'))),
          'image/png'
        );
      });
      triggerBlobDownload(blob, exportConfig.fileName || 'codigo-qr');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Error al exportar el PNG.');
    } finally {
      setDownloading(false);
    }
  };

  const testBgClass =
    testBg === 'white'
      ? 'bg-white'
      : testBg === 'black'
        ? 'bg-slate-900'
        : testBg === 'gray'
          ? 'bg-slate-500'
          : 'checkerboard-bg';

  return (
    <aside className="space-y-4">
      {/* Save Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
          <span className="font-medium text-slate-900 truncate">
            {projectName ? projectName : 'Borrador sin guardar'}
          </span>
          {projectVersion !== null && (
            <span className="font-mono tabular-nums text-slate-500 shrink-0">
              v{projectVersion}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onSaveChanges}
            className="px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSaveAs}
            className="px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            <span>Guardar QR como</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSaveTemplate}
            className="px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Guardar plantilla</span>
          </button>
        </div>

        {saveStatusMessage && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{saveStatusMessage}</span>
          </div>
        )}
      </div>

      {/* Live Preview Canvas */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {(
              [
                ['white', 'Blanco'],
                ['black', 'Negro'],
                ['gray', 'Gris'],
                ['checkerboard', 'Ajedrezado'],
              ] as Array<[PreviewTestBg, string]>
            ).map(([bg, lbl]) => (
              <button
                key={bg}
                type="button"
                onClick={() => setTestBg(bg)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                  testBg === bg ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(50, z - 25))}
              aria-label="Alejar vista previa"
              className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono tabular-nums text-slate-700 w-11 text-center">
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(175, z + 25))}
              aria-label="Acercar vista previa"
              className="p-1.5 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div
          className={`relative rounded-xl border border-slate-200 p-6 flex items-center justify-center overflow-auto min-h-[280px] max-h-[460px] ${testBgClass}`}
        >
          {matrixError ? (
            <div className="text-xs text-red-700 bg-white/95 p-3 rounded-lg border border-red-200">
              {matrixError}
            </div>
          ) : (
            <canvas
              ref={previewCanvasRef}
              style={{
                width: `${Math.round((270 * zoom) / 100)}px`,
                height: 'auto',
              }}
              className="max-w-full transition-transform duration-150"
            />
          )}
          {!payload && (
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-slate-900/80 text-white text-[11px] whitespace-nowrap">
              Vista de ejemplo · Completa los datos
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Matriz v{matrix?.version ?? '-'} ({matrix?.size ?? 0}×{matrix?.size ?? 0} módulos)
          </span>
          <span className="font-mono tabular-nums">
            Salida: {finalDims.width} × {finalDims.height} px
          </span>
        </div>
      </div>

      {/* Verification & PNG Export */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-900">Opciones de exportación PNG</div>

          <div>
            <label className="block text-xs text-slate-600 mb-1">Nombre del archivo</label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={exportConfig.fileName}
                onChange={(e) => onChangeExport({ ...exportConfig, fileName: e.target.value })}
                placeholder="mi-codigo-qr"
                className="flex-1 px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
              />
              <span className="text-xs font-mono text-slate-500">.png</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeExport({ ...exportConfig, quality: 'medium' })}
              className={`p-2.5 text-left rounded-lg border cursor-pointer ${
                exportConfig.quality === 'medium'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-800 border-slate-200'
              }`}
            >
              <div className="text-xs font-semibold">Calidad media</div>
              <div
                className={`text-[11px] font-mono tabular-nums ${
                  exportConfig.quality === 'medium' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                1024 px lado mayor
              </div>
            </button>
            <button
              type="button"
              onClick={() => onChangeExport({ ...exportConfig, quality: 'high' })}
              className={`p-2.5 text-left rounded-lg border cursor-pointer ${
                exportConfig.quality === 'high'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-800 border-slate-200'
              }`}
            >
              <div className="text-xs font-semibold">Calidad alta</div>
              <div
                className={`text-[11px] font-mono tabular-nums ${
                  exportConfig.quality === 'high' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                4096 px lado mayor
              </div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeExport({ ...exportConfig, backgroundMode: 'solid' })}
              className={`py-2 px-2.5 text-xs font-medium rounded-lg border cursor-pointer ${
                exportConfig.backgroundMode === 'solid'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              Sin transparencia
            </button>
            <button
              type="button"
              onClick={() => onChangeExport({ ...exportConfig, backgroundMode: 'transparent' })}
              className={`py-2 px-2.5 text-xs font-medium rounded-lg border cursor-pointer ${
                exportConfig.backgroundMode === 'transparent'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              Con transparencia
            </button>
          </div>

          {exportConfig.backgroundMode === 'transparent' && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportConfig.transparentBasePlate}
                  onChange={(e) =>
                    onChangeExport({
                      ...exportConfig,
                      transparentBasePlate: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300 text-slate-900"
                />
                Base clara debajo del QR y su margen
              </label>
              {exportConfig.transparentBasePlate && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={exportConfig.transparentBaseColor}
                    onChange={(e) =>
                      onChangeExport({
                        ...exportConfig,
                        transparentBaseColor: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-8 h-7 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-600">
                    {exportConfig.transparentBaseColor}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-slate-600 flex items-center justify-between pt-1">
            <span>Dimensiones definitivas del PNG:</span>
            <strong className="font-mono tabular-nums text-slate-900">
              {finalDims.width} × {finalDims.height} px
            </strong>
          </div>
        </div>

        {/* Action buttons: Verificar QR & Descargar PNG */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={!canExport || verifying}
            onClick={() => void handleVerify()}
            className="py-2.5 px-3 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-45 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {verifying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            <span>{verifying ? 'Verificando...' : 'Verificar QR'}</span>
          </button>

          <button
            type="button"
            disabled={!canExport || downloading}
            onClick={() => void handleDownloadPng()}
            className="py-2.5 px-3 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Generando PNG...' : 'Descargar PNG'}</span>
          </button>
        </div>

        {exportError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {exportError}
          </div>
        )}

        {/* Fallback open PNG manually */}
        {manualPngUrl && (
          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <span>¿Tu navegador bloqueó la descarga?</span>
            <a
              href={manualPngUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-900 font-medium underline flex items-center gap-1"
            >
              Abrir PNG para guardar <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Verification Report */}
        {verifyResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
              verifyResult.overallPassed
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-red-50 border-red-200 text-red-950'
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              {verifyResult.overallPassed ? (
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
              )}
              <span>
                {verifyResult.overallPassed
                  ? 'Lectura verificada con coincidencia exacta'
                  : 'Advertencia: la lectura automática falló'}
              </span>
            </div>

            <div className="space-y-1">
              {verifyResult.checks.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <span>{c.label}</span>
                  <span className="font-semibold">
                    {c.passed ? 'Legible ✓' : 'No legible ✕'}
                  </span>
                </div>
              ))}
            </div>

            {verifyResult.diagnostics.length > 0 && (
              <ul className="list-disc pl-4 space-y-1 text-red-900">
                {verifyResult.diagnostics.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}

            {!verifyResult.overallPassed && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleImproveLegibility}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-medium cursor-pointer"
                >
                  Mejorar legibilidad
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadClassic()}
                  className="px-3 py-1.5 bg-white text-slate-900 border border-slate-300 rounded-lg font-medium cursor-pointer"
                >
                  Descargar versión clásica
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
