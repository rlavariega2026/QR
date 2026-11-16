import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { completeInitialSetup, login } from '../lib/api';
import type { UserAccount } from '../types/qr';
import { QrLogoMark } from './QrLogoMark';

interface AuthScreenProps {
  needsSetup: boolean;
  onSetupComplete: () => void;
  onLoginSuccess: (user: UserAccount) => void;
}

export function AuthScreen({ needsSetup, onSetupComplete, onLoginSuccess }: AuthScreenProps) {
  const [username, setUsername] = useState(needsSetup ? 'lavariega' : '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (needsSetup) {
      if (password.length < 8) {
        setError('La contraseña inicial debe tener al menos 8 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      setLoading(true);
      try {
        await completeInitialSetup(password);
        const user = await login('lavariega', password);
        onSetupComplete();
        onLoginSuccess(user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo completar la instalación.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!username.trim() || !password) {
      setError('Ingresa tu usuario y contraseña para continuar.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3.5 mb-6">
          <QrLogoMark className="w-14 h-14 shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Generador QR LAV
            </h1>
            <p className="text-sm text-slate-500">
              {needsSetup
                ? 'Configuración inicial del superadministrador'
                : 'Estudio profesional de códigos QR en PNG'}
            </p>
          </div>
        </div>

        {needsSetup && (
          <div className="mb-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed flex gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              Instalación nueva detectada. Define la contraseña de la cuenta principal{' '}
              <strong className="font-semibold text-slate-900">lavariega</strong>. Solo se guardará
              su hash seguro en el servidor.
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {info && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-username" className="block text-sm font-medium text-slate-700 mb-1.5">
              Usuario
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                disabled={needsSetup}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre de usuario"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1.5">
              {needsSetup ? 'Contraseña inicial (mín. 8 caracteres)' : 'Contraseña'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-11 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 rounded-lg"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {needsSetup && (
            <div>
              <label
                htmlFor="auth-confirm-password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {loading
              ? 'Verificando...'
              : needsSetup
                ? 'Crear superadministrador y entrar'
                : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
