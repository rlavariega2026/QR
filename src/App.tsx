import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { MyQrView, MyTemplatesView } from './components/LibraryViews';
import { QrDataForm } from './components/QrDataForm';
import { QrDesignPanel } from './components/QrDesignPanel';
import { QrLogoMark } from './components/QrLogoMark';
import { QrPreviewAndExport } from './components/QrPreviewAndExport';
import { QrTypeSelector } from './components/QrTypeSelector';
import { UserAdminView } from './components/UserAdminView';
import {
  ApiError,
  createProject,
  createTemplate,
  fetchMe,
  getSetupStatus,
  logout,
  updateProject,
} from './lib/api';
import { buildQrPayload } from './lib/qrPayload';
import { QR_TYPES_MAP } from './lib/qrTypes';
import { createDefaultDesign, createDefaultExportConfig } from './lib/templates';
import type {
  QrDesignConfig,
  QrExportConfig,
  QrProject,
  QrTemplate,
  QrTypeId,
  UserAccount,
} from './types/qr';

type AppPage = 'editor' | 'mis_qr' | 'plantillas' | 'usuarios';
type MobileTab = 'datos' | 'diseno' | 'vista';

type ModalMode =
  | { kind: 'none' }
  | { kind: 'save_first'; initialName: string }
  | { kind: 'save_as'; initialName: string }
  | { kind: 'save_template'; initialName: string }
  | { kind: 'version_conflict'; message: string };

export default function App() {
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<UserAccount | null>(null);

  const [page, setPage] = useState<AppPage>('editor');
  const [mobileTab, setMobileTab] = useState<MobileTab>('datos');

  // Active editor project state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectVersion, setProjectVersion] = useState<number | null>(null);

  const [qrType, setQrType] = useState<QrTypeId>('url');
  const [data, setData] = useState<Record<string, unknown>>(
    () => ({ ...QR_TYPES_MAP.url.defaultData })
  );
  const [design, setDesign] = useState<QrDesignConfig>(() => createDefaultDesign());
  const [exportConfig, setExportConfig] = useState<QrExportConfig>(() =>
    createDefaultExportConfig()
  );

  // Undo / Redo history for visual design
  const [historyPast, setHistoryPast] = useState<QrDesignConfig[]>([]);
  const [historyFuture, setHistoryFuture] = useState<QrDesignConfig[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode>({ kind: 'none' });
  const [modalNameInput, setModalNameInput] = useState('');
  const [modalIncludeContent, setModalIncludeContent] = useState(false);

  const checkAuth = useCallback(async () => {
    setBooting(true);
    try {
      const setup = await getSetupStatus();
      setNeedsSetup(setup.needsSetup);
      if (!setup.needsSetup) {
        try {
          const me = await fetchMe();
          setUser(me);
        } catch {
          setUser(null);
        }
      }
    } catch {
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const updateDesignWithHistory = useCallback((next: QrDesignConfig) => {
    setDesign((prev) => {
      setHistoryPast((past) => [...past.slice(-29), prev]);
      setHistoryFuture([]);
      return next;
    });
  }, []);

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((p) => p.slice(0, -1));
    setHistoryFuture((f) => [design, ...f]);
    setDesign(previous);
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((f) => f.slice(1));
    setHistoryPast((p) => [...p, design]);
    setDesign(next);
  };

  const handleResetAppearance = () => {
    const fresh = createDefaultDesign();
    updateDesignWithHistory(fresh);
  };

  const handleSelectQrType = (nextType: QrTypeId) => {
    setQrType(nextType);
    setData({ ...QR_TYPES_MAP[nextType].defaultData });
    setSaveStatusMessage(null);
  };

  const handleApplyTemplate = (tpl: QrTemplate) => {
    const clonedDesign = JSON.parse(JSON.stringify(tpl.design)) as QrDesignConfig;
    const clonedExport = JSON.parse(JSON.stringify(tpl.exportConfig)) as QrExportConfig;

    if (tpl.isBuiltIn) {
      updateDesignWithHistory(clonedDesign);
      setSaveStatusMessage(null);
      return;
    }

    // Saved template from Mis plantillas creates a NEW editable project with its own identity
    setProjectId(null);
    setProjectName(null);
    setProjectVersion(null);
    setDesign(clonedDesign);
    setExportConfig(clonedExport);
    setHistoryPast([]);
    setHistoryFuture([]);
    if (tpl.includeContent && tpl.qrType && tpl.data) {
      setQrType(tpl.qrType);
      setData(JSON.parse(JSON.stringify(tpl.data)) as Record<string, unknown>);
    } else if (tpl.qrType) {
      setQrType(tpl.qrType);
      setData({ ...QR_TYPES_MAP[tpl.qrType].defaultData });
    }
    setSaveStatusMessage(null);
    setPage('editor');
  };

  const handleOpenProject = (proj: QrProject) => {
    setProjectId(proj.id);
    setProjectName(proj.name);
    setProjectVersion(proj.version);
    setQrType(proj.qrType);
    setData(JSON.parse(JSON.stringify(proj.data)) as Record<string, unknown>);
    const loadedDesign = JSON.parse(JSON.stringify(proj.design)) as QrDesignConfig;
    if (loadedDesign.logo.fileId) {
      loadedDesign.logo.previewUrl = `/api/files/${encodeURIComponent(loadedDesign.logo.fileId)}`;
    }
    setDesign(loadedDesign);
    setExportConfig(JSON.parse(JSON.stringify(proj.exportConfig)) as QrExportConfig);
    setHistoryPast([]);
    setHistoryFuture([]);
    setSaveStatusMessage(null);
    setSaveError(null);
    setPage('editor');
  };

  const handleCreateNew = () => {
    setProjectId(null);
    setProjectName(null);
    setProjectVersion(null);
    setQrType('url');
    setData({ ...QR_TYPES_MAP.url.defaultData });
    setDesign(createDefaultDesign());
    setExportConfig(createDefaultExportConfig());
    setHistoryPast([]);
    setHistoryFuture([]);
    setSaveStatusMessage(null);
    setSaveError(null);
    setPage('editor');
  };

  const payloadInfo = useMemo(
    () => buildQrPayload(qrType, data, design.errorCorrection),
    [qrType, data, design.errorCorrection]
  );

  // Strip transient previewUrl if fileId exists, keeping server reference clean
  const sanitizeDesignForServer = (d: QrDesignConfig): QrDesignConfig => {
    const copy = JSON.parse(JSON.stringify(d)) as QrDesignConfig;
    if (copy.logo.fileId) {
      copy.logo.previewUrl = `/api/files/${encodeURIComponent(copy.logo.fileId)}`;
    }
    return copy;
  };

  const handleSaveChangesClick = async () => {
    setSaveError(null);
    setSaveStatusMessage(null);
    if (!projectId) {
      const suggested = `${QR_TYPES_MAP[qrType].name}`;
      setModalNameInput(suggested);
      setModal({ kind: 'save_first', initialName: suggested });
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProject(projectId, {
        qrType,
        data,
        design: sanitizeDesignForServer(design),
        exportConfig,
        expectedVersion: projectVersion ?? 1,
      });
      setProjectVersion(updated.version);
      setProjectName(updated.name);
      setSaveStatusMessage('Proyecto guardado');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setModal({
          kind: 'version_conflict',
          message: err.message,
        });
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'No se pudo guardar el proyecto.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsClick = () => {
    setSaveError(null);
    const suggested = projectName ? `${projectName} (Copia)` : `${QR_TYPES_MAP[qrType].name} copia`;
    setModalNameInput(suggested);
    setModal({ kind: 'save_as', initialName: suggested });
  };

  const handleSaveTemplateClick = () => {
    setSaveError(null);
    const suggested = `Plantilla ${QR_TYPES_MAP[qrType].name}`;
    setModalNameInput(suggested);
    setModalIncludeContent(false);
    setModal({ kind: 'save_template', initialName: suggested });
  };

  const handleModalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = modalNameInput.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveError(null);
    setSaveStatusMessage(null);

    try {
      if (modal.kind === 'save_first' || modal.kind === 'save_as') {
        const created = await createProject({
          name: trimmed,
          qrType,
          data,
          design: sanitizeDesignForServer(design),
          exportConfig,
        });
        setProjectId(created.id);
        setProjectName(created.name);
        setProjectVersion(created.version);
        setSaveStatusMessage(
          modal.kind === 'save_as'
            ? `Proyecto guardado como «${created.name}»`
            : 'Proyecto guardado'
        );
        setModal({ kind: 'none' });
      } else if (modal.kind === 'save_template') {
        await createTemplate({
          name: trimmed,
          includeContent: modalIncludeContent,
          qrType: modalIncludeContent ? qrType : null,
          data: modalIncludeContent ? data : null,
          design: sanitizeDesignForServer(design),
          exportConfig,
        });
        setSaveStatusMessage(`Plantilla «${trimmed}» guardada`);
        setModal({ kind: 'none' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setModal({ kind: 'none' });
        return;
      }
      setSaveError(err instanceof Error ? err.message : 'Error al guardar en el servidor.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore network errors on logout
    }
    setUser(null);
    handleCreateNew();
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Iniciando Generador QR LAV...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        needsSetup={needsSetup}
        onSetupComplete={() => setNeedsSetup(false)}
        onLoginSuccess={(u) => setUser(u)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Contract: Brand — Nav Links — Primary Action */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setPage('editor')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer"
        >
          <QrLogoMark className="w-7 h-7" />
          <span className="text-base font-bold tracking-tight text-slate-900">
            Generador QR LAV
          </span>
        </button>

        <nav className="flex items-center gap-4 sm:gap-6 overflow-x-auto text-xs sm:text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setPage('editor')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
              page === 'editor'
                ? 'text-slate-900 border-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setPage('mis_qr')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
              page === 'mis_qr'
                ? 'text-slate-900 border-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Mis QR
          </button>
          <button
            type="button"
            onClick={() => setPage('plantillas')}
            className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
              page === 'plantillas'
                ? 'text-slate-900 border-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Mis plantillas
          </button>
          {user.role === 'superadmin' && (
            <button
              type="button"
              onClick={() => setPage('usuarios')}
              className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                page === 'usuarios'
                  ? 'text-slate-900 border-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Usuarios
            </button>
          )}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
            {user.username}
          </span>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {page === 'editor' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
            {saveError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800"
              >
                {saveError}
              </div>
            )}

            {/* Mobile / Tablet 3-Tab Switcher */}
            <div className="lg:hidden grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl">
              {(
                [
                  ['datos', 'Datos'],
                  ['diseno', 'Diseño'],
                  ['vista', 'Vista previa'],
                ] as Array<[MobileTab, string]>
              ).map(([t, lbl]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMobileTab(t)}
                  className={`py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                    mobileTab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Editor Column */}
              <div className="lg:col-span-7 space-y-4">
                <div className={mobileTab === 'datos' ? 'block space-y-4' : 'hidden lg:block lg:space-y-4'}>
                  <QrTypeSelector selectedType={qrType} onSelectType={handleSelectQrType} />
                  <QrDataForm
                    qrType={qrType}
                    data={data}
                    onChange={setData}
                    payloadInfo={payloadInfo}
                  />
                </div>

                <div className={mobileTab === 'diseno' ? 'block' : 'hidden lg:block'}>
                  <QrDesignPanel
                    design={design}
                    onChange={updateDesignWithHistory}
                    onApplyBuiltInTemplate={handleApplyTemplate}
                    canUndo={historyPast.length > 0}
                    canRedo={historyFuture.length > 0}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onResetAppearance={handleResetAppearance}
                  />
                </div>
              </div>

              {/* Right Preview & Export Column */}
              <div
                className={`lg:col-span-5 lg:sticky lg:top-20 ${
                  mobileTab === 'vista' ? 'block' : 'hidden lg:block'
                }`}
              >
                <QrPreviewAndExport
                  projectName={projectName}
                  projectVersion={projectVersion}
                  payload={payloadInfo.payload}
                  payloadErrors={payloadInfo.errors}
                  exceedsCapacity={payloadInfo.exceedsCapacity}
                  design={design}
                  exportConfig={exportConfig}
                  onChangeDesign={updateDesignWithHistory}
                  onChangeExport={setExportConfig}
                  onSaveChanges={() => void handleSaveChangesClick()}
                  onSaveAs={handleSaveAsClick}
                  onSaveTemplate={handleSaveTemplateClick}
                  saving={saving}
                  saveStatusMessage={saveStatusMessage}
                />
              </div>
            </div>
          </div>
        )}

        {page === 'mis_qr' && (
          <MyQrView
            currentUser={user}
            onOpenProject={handleOpenProject}
            onCreateNew={handleCreateNew}
          />
        )}

        {page === 'plantillas' && (
          <MyTemplatesView currentUser={user} onApplyTemplate={handleApplyTemplate} />
        )}

        {page === 'usuarios' && <UserAdminView currentUser={user} />}
      </main>

      {/* Modals for Save First, Save As, Save Template, and Version Conflict */}
      {modal.kind !== 'none' && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          {modal.kind === 'version_conflict' ? (
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Conflicto de versión detectado
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">{modal.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'none' })}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const suggested = projectName ? `${projectName} (Copia)` : 'Mi QR (Copia)';
                    setModalNameInput(suggested);
                    setModal({ kind: 'save_as', initialName: suggested });
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer"
                >
                  Guardar como copia nueva
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleModalSubmit}
              className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-lg"
            >
              <h2 className="text-base font-bold text-slate-900">
                {modal.kind === 'save_first'
                  ? 'Guardar proyecto QR'
                  : modal.kind === 'save_as'
                    ? 'Guardar QR como copia independiente'
                    : 'Guardar plantilla reutilizable'}
              </h2>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {modal.kind === 'save_template' ? 'Nombre de la plantilla' : 'Nombre del proyecto'}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={modalNameInput}
                  onChange={(e) => setModalNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {modal.kind === 'save_template' && (
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalIncludeContent}
                    onChange={(e) => setModalIncludeContent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-slate-900"
                  />
                  <span>
                    Guardar también los campos de contenido actuales (desactivado por defecto)
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'none' })}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Confirmar y guardar'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
