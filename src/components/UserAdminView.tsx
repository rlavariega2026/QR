import { useEffect, useState, type FormEvent } from 'react';
import {
  KeyRound,
  LogOut,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import {
  createUser,
  deleteUser,
  listUsers,
  revokeUserSessions,
  updateUser,
  type UserAdminRow,
} from '../lib/api';
import type { UserAccount } from '../types/qr';

export function UserAdminView({ currentUser }: { currentUser: UserAccount }) {
  const [users, setUsers] = useState<UserAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'superadmin'>('user');
  const [creating, setCreating] = useState(false);

  const [editingUser, setEditingUser] = useState<UserAdminRow | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listUsers();
      setUsers(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setCreating(true);
    try {
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
      });
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setNotice('Cuenta creada correctamente.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (u: UserAdminRow) => {
    setError(null);
    setNotice(null);
    const nextStatus = u.status === 'active' ? 'suspended' : 'active';
    try {
      await updateUser(u.id, { status: nextStatus });
      setNotice(
        nextStatus === 'suspended'
          ? `Cuenta «${u.username}» suspendida y sesiones revocadas de inmediato.`
          : `Cuenta «${u.username}» activada.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    }
  };

  const handleRevoke = async (u: UserAdminRow) => {
    setError(null);
    setNotice(null);
    try {
      const res = await revokeUserSessions(u.id);
      setNotice(`Se revocaron ${res.revokedCount} sesión(es) activa(s) de «${u.username}».`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron revocar las sesiones.');
    }
  };

  const handleDelete = async (u: UserAdminRow) => {
    setError(null);
    setNotice(null);
    try {
      await deleteUser(u.id);
      setNotice(
        `Usuario «${u.username}» eliminado. Sus sesiones fueron revocadas y sus proyectos se conservaron para recuperación.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario.');
    }
  };

  const handleEditSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);
    setNotice(null);
    try {
      await updateUser(editingUser.id, {
        username: editUsername.trim(),
        ...(editPassword ? { password: editPassword } : {}),
      });
      setNotice(`Cuenta «${editUsername.trim()}» actualizada.`);
      setEditingUser(null);
      setEditPassword('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la cuenta.');
    }
  };

  if (currentUser.role !== 'superadmin') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="p-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          Acceso restringido exclusivamente al superadministrador.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Administración de usuarios</h1>
        <p className="text-sm text-slate-500">
          Crea cuentas autorizadas, restablece contraseñas, suspende accesos o revoca sesiones activas.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {/* Create User Form */}
      <form
        onSubmit={handleCreate}
        className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Nuevo usuario
          </label>
          <input
            type="text"
            required
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="ej. diseno_lav"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Contraseña (mín. 8 caracteres)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Rol</label>
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'user' | 'superadmin')}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          >
            <option value="user">Usuario autorizado</option>
            <option value="superadmin">Superadministrador</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="py-2 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>{creating ? 'Creando...' : 'Crear cuenta'}</span>
        </button>
      </form>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando cuentas...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Rol</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Sesiones</th>
                  <th className="py-3 px-4 text-right">Proyectos</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{u.username}</span>
                        {u.isPrimarySuperadmin && (
                          <span className="text-xs font-normal text-slate-500 flex items-center gap-1">
                            <Shield className="w-3.5 h-3.5 text-slate-700" /> Principal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {u.role === 'superadmin' ? 'Superadministrador' : 'Usuario autorizado'}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          u.status === 'active'
                            ? 'text-emerald-700 font-semibold'
                            : 'text-red-700 font-semibold'
                        }
                      >
                        {u.status === 'active' ? 'Activa' : 'Suspendida'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                      {u.activeSessions}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                      {u.projectCount}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(u);
                            setEditUsername(u.username);
                            setEditPassword('');
                          }}
                          title="Editar usuario o restablecer contraseña"
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Editar / Clave
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRevoke(u)}
                          title="Revocar sesiones activas"
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Revocar
                        </button>
                        {!u.isPrimarySuperadmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleToggleStatus(u)}
                              className={`px-2.5 py-1.5 text-xs font-medium border rounded-lg flex items-center gap-1 cursor-pointer ${
                                u.status === 'active'
                                  ? 'text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100'
                                  : 'text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                              }`}
                            >
                              {u.status === 'active' ? (
                                <>
                                  <UserX className="w-3.5 h-3.5" /> Suspender
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" /> Activar
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(u)}
                              title="Eliminar usuario secundario"
                              className="p-1.5 text-slate-500 hover:text-red-700 border border-slate-200 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Reset Password Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleEditSave}
            className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-lg"
          >
            <h2 className="text-base font-bold text-slate-900">
              Editar cuenta: {editingUser.username}
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nombre de usuario
              </label>
              <input
                type="text"
                required
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nueva contraseña (dejar vacío para no cambiar)
              </label>
              <input
                type="password"
                minLength={8}
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
