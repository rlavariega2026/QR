import { useEffect, useState } from 'react';
import {
  CopyPlus,
  Edit3,
  FolderOpen,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  deleteProject,
  deleteTemplate,
  duplicateProject,
  listProjects,
  listTemplates,
  listUsers,
  renameTemplate,
  updateProject,
  type UserAdminRow,
} from '../lib/api';
import { QR_TYPES_MAP } from '../lib/qrTypes';
import { BUILT_IN_TEMPLATES } from '../lib/templates';
import type { QrProject, QrTemplate, UserAccount } from '../types/qr';

interface MyQrViewProps {
  currentUser: UserAccount;
  onOpenProject: (project: QrProject) => void;
  onCreateNew: () => void;
}

export function MyQrView({ currentUser, onOpenProject, onCreateNew }: MyQrViewProps) {
  const [projects, setProjects] = useState<QrProject[]>([]);
  const [users, setUsers] = useState<UserAdminRow[]>([]);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projs, userRows] = await Promise.all([
        listProjects(search, ownerFilter),
        currentUser.role === 'superadmin' ? listUsers() : Promise.resolve([]),
      ]);
      setProjects(projs);
      setUsers(userRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los proyectos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, ownerFilter]);

  const handleRenameSubmit = async (proj: QrProject) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === proj.name) {
      setRenamingId(null);
      return;
    }
    try {
      await updateProject(proj.id, {
        name: trimmed,
        qrType: proj.qrType,
        data: proj.data,
        design: proj.design,
        exportConfig: proj.exportConfig,
        expectedVersion: proj.version,
      });
      setRenamingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo renombrar el proyecto.');
    }
  };

  const handleDuplicate = async (proj: QrProject) => {
    try {
      await duplicateProject(proj.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo duplicar el proyecto.');
    }
  };

  const handleDelete = async (proj: QrProject) => {
    try {
      await deleteProject(proj.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el proyecto.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mis QR</h1>
          <p className="text-sm text-slate-500">
            Proyectos guardados en el servidor. Abre cualquiera para editar o exportar PNG.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nuevo QR
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o tipo de QR..."
            className="w-full pl-10 pr-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        {currentUser.role === 'superadmin' && users.length > 0 && (
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="all">Todos los usuarios</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                Espacio de {u.username}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Cargando proyectos...
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-800">
            No hay códigos QR guardados todavía.
          </p>
          <p className="text-xs text-slate-500">
            Crea un diseño en el editor y utiliza «Guardar cambios» para conservarlo aquí.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer"
          >
            Crear primer código QR
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {projects.map((proj) => {
            const typeDef = QR_TYPES_MAP[proj.qrType];
            const isRenaming = renamingId === proj.id;
            return (
              <div
                key={proj.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <div className="flex items-center gap-2 max-w-md">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRenameSubmit(proj);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        className="flex-1 px-2.5 py-1 text-sm border border-slate-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRenameSubmit(proj)}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="px-2 py-1 text-xs text-slate-600 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {proj.name}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                    <span>{typeDef ? `${typeDef.number}. ${typeDef.name}` : proj.qrType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">v{proj.version}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Actualizado{' '}
                      {new Date(proj.updatedAt).toLocaleString('es-MX', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                    {proj.ownerUsername && currentUser.role === 'superadmin' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Propietario: {proj.ownerUsername}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenProject(proj)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> Abrir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(proj.id);
                      setRenameValue(proj.name);
                    }}
                    title="Cambiar nombre"
                    className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicate(proj)}
                    title="Duplicar"
                    className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    <CopyPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(proj)}
                    title="Eliminar"
                    className="p-2 text-slate-500 hover:text-red-700 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface MyTemplatesViewProps {
  currentUser: UserAccount;
  onApplyTemplate: (template: QrTemplate) => void;
}

export function MyTemplatesView({ currentUser, onApplyTemplate }: MyTemplatesViewProps) {
  const [templates, setTemplates] = useState<QrTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTemplates(search);
      setTemplates(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleRename = async (tpl: QrTemplate) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === tpl.name) {
      setRenamingId(null);
      return;
    }
    try {
      await renameTemplate(tpl.id, trimmed);
      setRenamingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo renombrar la plantilla.');
    }
  };

  const handleDelete = async (tpl: QrTemplate) => {
    try {
      await deleteTemplate(tpl.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la plantilla.');
    }
  };

  const filteredBuiltIn = BUILT_IN_TEMPLATES.filter((t) =>
    search.trim() ? t.name.toLowerCase().includes(search.trim().toLowerCase()) : true
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Mis plantillas</h1>
        <p className="text-sm text-slate-500">
          Al aplicar una plantilla se inicia un nuevo proyecto editable con identidad propia.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar plantillas..."
          className="w-full pl-10 pr-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Mis plantillas guardadas</h2>
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500 text-center">
            Cargando plantillas...
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500 text-center">
            Aún no has guardado plantillas propias. Usa «Guardar plantilla» desde el editor.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  {renamingId === tpl.id ? (
                    <div className="flex items-center gap-2 max-w-md">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRename(tpl);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        className="flex-1 px-2.5 py-1 text-sm border border-slate-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRename(tpl)}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="px-2 py-1 text-xs text-slate-600 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm font-semibold text-slate-900">{tpl.name}</div>
                  )}
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                    <span>
                      {tpl.includeContent ? 'Incluye diseño y contenido' : 'Solo estilo visual'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Marco: {tpl.design.frame.style}</span>
                    {tpl.ownerUsername && currentUser.role === 'superadmin' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Autor: {tpl.ownerUsername}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onApplyTemplate(tpl)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Usar plantilla
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(tpl.id);
                      setRenameValue(tpl.name);
                    }}
                    title="Cambiar nombre"
                    className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(tpl)}
                    title="Eliminar"
                    className="p-2 text-slate-500 hover:text-red-700 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Plantillas base incluidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredBuiltIn.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">{tpl.name}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Módulos: {tpl.design.moduleShape} · Marco: {tpl.design.frame.style}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onApplyTemplate(tpl)}
                className="w-full py-2 px-3 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                Crear QR con esta plantilla
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
