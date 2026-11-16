import { qrApiUrl } from '../lib/api';
import { useRef, useState, type DragEvent } from 'react';
import {
  PauseCircle,
  Plus,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { BUILT_IN_TEMPLATES } from '../lib/templates';
import {
  inspectImageClientSide,
  uploadFileInChunks,
  type UploadChunkProgress,
} from '../lib/imageUpload';
import type {
  ColorFillMode,
  ColorSpec,
  ErrorCorrectionLevel,
  EyeShape,
  FrameStyle,
  LogoPosition,
  ModuleShape,
  QrDesignConfig,
  QrExportConfig,
  QrTemplate,
  TextureMode,
} from '../types/qr';

interface QrDesignPanelProps {
  design: QrDesignConfig;
  onChange: (next: QrDesignConfig) => void;
  onApplyBuiltInTemplate: (tpl: QrTemplate) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onResetAppearance: () => void;
  onUpdateExportConfig?: (next: Partial<QrExportConfig>) => void;
}

type DesignTab = 'formas' | 'colores' | 'marcos' | 'logo';

function ColorSpecEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ColorSpec;
  onChange: (next: ColorSpec) => void;
}) {
  const safeHex = (hex: string) => (/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#0F172A');

  return (
    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-800">{label}</span>
        <div className="flex gap-1 bg-slate-200/70 p-0.5 rounded-lg">
          {(['solid', 'linear', 'radial'] as ColorFillMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...value, mode: m })}
              className={`px-2 py-1 text-[11px] font-medium rounded-md cursor-pointer ${
                value.mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {m === 'solid' ? 'Sólido' : m === 'linear' ? 'Lineal' : 'Radial'}
            </button>
          ))}
        </div>
      </div>

      {value.mode === 'solid' ? (
        <div className="flex items-center gap-2.5">
          <input
            type="color"
            value={safeHex(value.color)}
            onChange={(e) => onChange({ ...value, color: e.target.value.toUpperCase() })}
            className="w-10 h-9 rounded-lg border border-slate-300 cursor-pointer bg-white p-0.5"
          />
          <input
            type="text"
            value={value.color}
            onChange={(e) => onChange({ ...value, color: e.target.value })}
            placeholder="#0F172A"
            className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {value.mode === 'linear' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-600 w-20">Ángulo ({value.angle}°)</span>
              <input
                type="range"
                min={0}
                max={360}
                value={value.angle}
                onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })}
                className="flex-1 accent-slate-900"
              />
            </div>
          )}
          <div className="space-y-1.5">
            {value.stops.map((stop, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="color"
                  value={safeHex(stop.color)}
                  onChange={(e) => {
                    const next = [...value.stops];
                    next[idx] = { ...stop, color: e.target.value.toUpperCase() };
                    onChange({ ...value, stops: next });
                  }}
                  className="w-8 h-8 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
                />
                <input
                  type="text"
                  value={stop.color}
                  onChange={(e) => {
                    const next = [...value.stops];
                    next[idx] = { ...stop, color: e.target.value };
                    onChange({ ...value, stops: next });
                  }}
                  className="w-24 px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded-md"
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={stop.offset}
                  onChange={(e) => {
                    const next = [...value.stops];
                    next[idx] = { ...stop, offset: Number(e.target.value) };
                    onChange({ ...value, stops: next });
                  }}
                  className="flex-1 accent-slate-900"
                />
                <span className="text-[11px] font-mono tabular-nums w-9 text-right text-slate-600">
                  {stop.offset}%
                </span>
                {value.stops.length > 2 && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...value,
                        stops: value.stops.filter((_, i) => i !== idx),
                      })
                    }
                    className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {value.stops.length < 5 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    stops: [...value.stops, { offset: 50, color: '#3B82F6' }],
                  })
                }
                className="text-xs font-medium text-slate-700 hover:text-slate-950 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar parada de color
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function QrDesignPanel({
  design,
  onChange,
  onApplyBuiltInTemplate,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onResetAppearance,
}: QrDesignPanelProps) {
  const [tab, setTab] = useState<DesignTab>('formas');
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadChunkProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    setUploadNotice(null);
    setPendingFile(file);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const inspection = await inspectImageClientSide(file);
      const stored = await uploadFileInChunks(file, inspection, {
        signal: controller.signal,
        onProgress: (p) => setUploadProgress(p),
      });

      const isCentered = design.logo.position === 'center';
      onChange({
        ...design,
        errorCorrection: isCentered ? 'H' : design.errorCorrection,
        logo: {
          ...design.logo,
          fileId: stored.id,
          previewUrl: qrApiUrl(`/api/files/${encodeURIComponent(stored.id)}`),
          fileName: stored.originalName,
        },
      });
      setUploadNotice(
        `Imagen «${stored.originalName}» guardada en el servidor (${
          stored.width && stored.height ? `${stored.width}×${stored.height} px` : 'vectorial'
        }${stored.hasAlpha ? ', con transparencia' : ''}).`
      );
      setPendingFile(null);
      setUploadProgress(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setUploadError(
          `Carga de «${file.name}» interrumpida. Los bloques ya confirmados se conservan; puedes reanudar.`
        );
      } else {
        setUploadError(
          err instanceof Error ? err.message : `No se pudo cargar «${file.name}».`
        );
        setUploadProgress(null);
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
      {/* Header + Undo/Redo/Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Personalización visual</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Deshacer"
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" /> Deshacer
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Rehacer"
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" /> Rehacer
          </button>
          <button
            type="button"
            onClick={onResetAppearance}
            title="Restablecer apariencia"
            className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restablecer
          </button>
        </div>
      </div>

      {/* Built-in editable templates */}
      <div>
        <div className="text-xs font-medium text-slate-600 mb-2">
          Plantillas rápidas (editables)
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {BUILT_IN_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onApplyBuiltInTemplate(tpl)}
              className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
        {(
          [
            ['formas', 'Módulos y ojos'],
            ['colores', 'Colores y degradados'],
            ['marcos', 'Marco y textura 3D'],
            ['logo', 'Logotipo'],
          ] as Array<[DesignTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: Formas */}
      {tab === 'formas' && (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">Estilo de módulos</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  ['square', 'Cuadrados'],
                  ['rounded', 'Redondeados'],
                  ['circle', 'Círculos'],
                  ['dots', 'Puntos'],
                ] as Array<[ModuleShape, string]>
              ).map(([shape, lbl]) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => onChange({ ...design, moduleShape: shape })}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border cursor-pointer ${
                    design.moduleShape === shape
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Ojos · Marco exterior (3 esquinas)
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['square', 'Cuadrado'],
                    ['rounded', 'Redondeado'],
                    ['circle', 'Círculo'],
                    ['dots', 'Puntos'],
                  ] as Array<[EyeShape, string]>
                ).map(([shape, lbl]) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => onChange({ ...design, eyeOuterShape: shape })}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border cursor-pointer ${
                      design.eyeOuterShape === shape
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Ojos · Centro interior
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['square', 'Cuadrado'],
                    ['rounded', 'Redondeado'],
                    ['circle', 'Círculo'],
                    ['dots', 'Puntos'],
                  ] as Array<[EyeShape, string]>
                ).map(([shape, lbl]) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => onChange({ ...design, eyeInnerShape: shape })}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border cursor-pointer ${
                      design.eyeInnerShape === shape
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">
              Corrección de errores (redundancia)
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ['L', 'Baja (7%)'],
                  ['M', 'Media (15%)'],
                  ['Q', 'Alta-Q (25%)'],
                  ['H', 'Máxima (30%)'],
                ] as Array<[ErrorCorrectionLevel, string]>
              ).map(([lvl, lbl]) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onChange({ ...design, errorCorrection: lvl })}
                  className={`py-2 px-2 text-xs font-medium rounded-lg border cursor-pointer ${
                    design.errorCorrection === lvl
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Colores */}
      {tab === 'colores' && (
        <div className="space-y-3">
          <ColorSpecEditor
            label="Módulos del QR"
            value={design.moduleColor}
            onChange={(moduleColor) => onChange({ ...design, moduleColor })}
          />
          <ColorSpecEditor
            label="Ojos (anillo exterior)"
            value={design.eyeOuterColor}
            onChange={(eyeOuterColor) => onChange({ ...design, eyeOuterColor })}
          />
          <ColorSpecEditor
            label="Ojos (centro interior)"
            value={design.eyeInnerColor}
            onChange={(eyeInnerColor) => onChange({ ...design, eyeInnerColor })}
          />
          <ColorSpecEditor
            label="Fondo del QR"
            value={design.backgroundColor}
            onChange={(backgroundColor) => onChange({ ...design, backgroundColor })}
          />
        </div>
      )}

      {/* TAB 3: Marcos y Textura 3D */}
      {tab === 'marcos' && (
        <div className="space-y-5">
          <div>
            <div className="text-xs font-medium text-slate-700 mb-2">Tipo de marco</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  ['none', 'Sin marco'],
                  ['square', 'Cuadrado'],
                  ['rounded', 'Redondeado'],
                  ['circle_decorative', 'Circular decorativo'],
                  ['tag', 'Etiqueta'],
                  ['plate', 'Placa'],
                  ['ribbon', 'Cinta inferior'],
                ] as Array<[FrameStyle, string]>
              ).map(([style, lbl]) => (
                <button
                  key={style}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...design,
                      frame: { ...design.frame, style },
                    })
                  }
                  className={`py-2 px-2.5 text-xs font-medium rounded-lg border cursor-pointer ${
                    design.frame.style === style
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {design.frame.style !== 'none' && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <ColorSpecEditor
                label="Color o degradado del marco"
                value={design.frame.color}
                onChange={(color) =>
                  onChange({ ...design, frame: { ...design.frame, color } })
                }
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Texto del marco
                  </label>
                  <input
                    type="text"
                    value={design.frame.text}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        frame: { ...design.frame, text: e.target.value },
                      })
                    }
                    placeholder="ESCANÉAME"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Color del texto
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={
                        /^#[0-9A-Fa-f]{6}$/.test(design.frame.textColor)
                          ? design.frame.textColor
                          : '#FFFFFF'
                      }
                      onChange={(e) =>
                        onChange({
                          ...design,
                          frame: { ...design.frame, textColor: e.target.value.toUpperCase() },
                        })
                      }
                      className="w-10 h-9 rounded-lg border border-slate-300 bg-white p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={design.frame.textColor}
                      onChange={(e) =>
                        onChange({
                          ...design,
                          frame: { ...design.frame, textColor: e.target.value },
                        })
                      }
                      className="w-full px-2.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tipografía del marco
                  </label>
                  <select
                    value={design.frame.fontFamily}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        frame: {
                          ...design.frame,
                          fontFamily: e.target.value as QrDesignConfig['frame']['fontFamily'],
                        },
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                    <option value="DM Sans">DM Sans</option>
                    <option value="JetBrains Mono">JetBrains Mono</option>
                    <option value="Georgia">Georgia (Editorial)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Grosor del marco ({design.frame.thickness} px)
                  </label>
                  <input
                    type="range"
                    min={6}
                    max={64}
                    value={design.frame.thickness}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        frame: { ...design.frame, thickness: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900 mt-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Esquinas ({design.frame.cornerRadius} px)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={64}
                    value={design.frame.cornerRadius}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        frame: { ...design.frame, cornerRadius: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Espaciado extra ({design.frame.padding} px · mín. 4 módulos garantizado)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={design.frame.padding}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        frame: { ...design.frame, padding: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Sombra del marco ({design.frame.shadowIntensity}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={design.frame.shadowIntensity}
                  onChange={(e) =>
                    onChange({
                      ...design,
                      frame: { ...design.frame, shadowIntensity: Number(e.target.value) },
                    })
                  }
                  className="w-full accent-slate-900"
                />
              </div>
            </div>
          )}

          {/* Texturas y relieve visual 3D */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Textura y relieve visual 3D (para cualquier tipo de QR)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    ['flat', 'Plano'],
                    ['matte', 'Mate'],
                    ['metallic', 'Metálico'],
                    ['relief', 'Relieve sutil'],
                  ] as Array<[TextureMode, string]>
                ).map(([mode, lbl]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...design,
                        texture: { ...design.texture, mode },
                      })
                    }
                    className={`py-2 px-2.5 text-xs font-medium rounded-lg border cursor-pointer ${
                      design.texture.mode === mode
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {design.texture.mode !== 'flat' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Intensidad ({design.texture.intensity}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={design.texture.intensity}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        texture: { ...design.texture, intensity: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Sombra ({design.texture.shadow}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={design.texture.shadow}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        texture: { ...design.texture, shadow: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Brillo ({design.texture.gloss}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={design.texture.gloss}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        texture: { ...design.texture, gloss: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Logotipo */}
      {tab === 'logo' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`p-5 rounded-xl border-2 border-dashed text-center transition-colors ${
              dragActive
                ? 'border-slate-900 bg-slate-100'
                : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,.svg,.avif,.heic,.heif,.tif,.tiff,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-800">
              Arrastra tu logotipo aquí o{' '}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="underline text-slate-900 font-semibold cursor-pointer"
              >
                selecciona un archivo
              </button>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              PNG transparente, JPG, WebP, BMP, GIF (fotograma fijo), SVG saneado, AVIF, HEIC o TIFF
            </p>
          </div>

          {uploadProgress && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span>
                  {uploadProgress.resumed ? 'Reanudando carga por bloques…' : 'Subiendo original…'}{' '}
                  ({uploadProgress.uploadedChunks}/{uploadProgress.totalChunks} bloques)
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums font-semibold">
                    {uploadProgress.percent}%
                  </span>
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PauseCircle className="w-3.5 h-3.5" /> Interrumpir
                  </button>
                </div>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-900 transition-all"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-3">
              <span>{uploadError}</span>
              {pendingFile && (
                <button
                  type="button"
                  onClick={() => void handleFileUpload(pendingFile)}
                  className="px-2.5 py-1 bg-red-800 text-white rounded-md font-medium whitespace-nowrap cursor-pointer"
                >
                  Reanudar carga
                </button>
              )}
            </div>
          )}

          {uploadNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {uploadNotice}
            </div>
          )}

          {(design.logo.fileId || design.logo.previewUrl) && (
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={design.logo.previewUrl || qrApiUrl(`/api/files/${design.logo.fileId}`)}
                    alt="Vista previa del logotipo"
                    className="w-12 h-12 object-contain rounded-lg border border-slate-200 checkerboard-bg shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {design.logo.fileName || 'Logotipo cargado'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Se renderiza desde el archivo original en servidor
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Reemplazar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadNotice(null);
                      onChange({
                        ...design,
                        logo: {
                          ...design.logo,
                          fileId: null,
                          previewUrl: null,
                          fileName: null,
                        },
                      });
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> Quitar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Posición del logotipo
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    [
                      ['center', 'Centro del QR'],
                      ['frame_top', 'Marco arriba'],
                      ['frame_bottom', 'Marco abajo'],
                      ['frame_left', 'Marco izquierda'],
                      ['frame_right', 'Marco derecha'],
                    ] as Array<[LogoPosition, string]>
                  ).map(([pos, lbl]) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => {
                        const needsFrame = pos !== 'center' && design.frame.style === 'none';
                        onChange({
                          ...design,
                          errorCorrection: pos === 'center' ? 'H' : design.errorCorrection,
                          frame: needsFrame
                            ? { ...design.frame, style: 'rounded' }
                            : design.frame,
                          logo: { ...design.logo, position: pos },
                        });
                      }}
                      className={`py-2 px-2.5 text-xs font-medium rounded-lg border cursor-pointer ${
                        design.logo.position === pos
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Escala ({design.logo.scale}%)
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={32}
                    value={design.logo.scale}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        logo: { ...design.logo, scale: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Rotación ({design.logo.rotation}°)
                  </label>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={design.logo.rotation}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        logo: { ...design.logo, rotation: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Esquinas ({design.logo.cornerRadius}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    value={design.logo.cornerRadius}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        logo: { ...design.logo, cornerRadius: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-slate-900"
                  />
                </div>
                {design.logo.position === 'center' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Desplazamiento X
                      </label>
                      <input
                        type="range"
                        min={-15}
                        max={15}
                        value={design.logo.offsetX}
                        onChange={(e) =>
                          onChange({
                            ...design,
                            logo: { ...design.logo, offsetX: Number(e.target.value) },
                          })
                        }
                        className="w-full accent-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Desplazamiento Y
                      </label>
                      <input
                        type="range"
                        min={-15}
                        max={15}
                        value={design.logo.offsetY}
                        onChange={(e) =>
                          onChange({
                            ...design,
                            logo: { ...design.logo, offsetY: Number(e.target.value) },
                          })
                        }
                        className="w-full accent-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={design.logo.hasBase}
                    onChange={(e) =>
                      onChange({
                        ...design,
                        logo: { ...design.logo, hasBase: e.target.checked },
                      })
                    }
                    className="rounded border-slate-300 text-slate-900"
                  />
                  Base protectora detrás del logotipo
                </label>
                {design.logo.hasBase && (
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={design.logo.baseColor}
                      onChange={(e) =>
                        onChange({
                          ...design,
                          logo: { ...design.logo, baseColor: e.target.value.toUpperCase() },
                        })
                      }
                      className="w-8 h-7 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
                    />
                    <span className="text-xs text-slate-600">Relleno</span>
                    <input
                      type="range"
                      min={0}
                      max={28}
                      value={design.logo.basePadding}
                      onChange={(e) =>
                        onChange({
                          ...design,
                          logo: { ...design.logo, basePadding: Number(e.target.value) },
                        })
                      }
                      className="w-24 accent-slate-900"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
