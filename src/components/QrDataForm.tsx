import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react';
import { COUNTRY_DIAL_CODES } from '../lib/qrTypes';
import type { PayloadBuildResult } from '../lib/qrPayload';
import type { QrTypeId } from '../types/qr';

interface QrDataFormProps {
  qrType: QrTypeId;
  data: Record<string, unknown>;
  onChange: (nextData: Record<string, unknown>) => void;
  payloadInfo: PayloadBuildResult;
}

const inputCls =
  'w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900';
const labelCls = 'block text-xs font-medium text-slate-700 mb-1';

function strVal(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function boolVal(data: Record<string, unknown>, key: string): boolean {
  return Boolean(data[key]);
}

export function QrDataForm({ qrType, data, onChange, payloadInfo }: QrDataFormProps) {
  const [showWifiPass, setShowWifiPass] = useState(false);

  const setField = (key: string, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  const renderDialCodeSelect = (codeKey = 'codigoPais', countryKey = 'pais') => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>País</label>
        <select
          value={strVal(data, countryKey) || 'México'}
          onChange={(e) => {
            const chosen = COUNTRY_DIAL_CODES.find((c) => c.country === e.target.value);
            onChange({
              ...data,
              [countryKey]: e.target.value,
              [codeKey]: chosen ? chosen.code : strVal(data, codeKey),
            });
          }}
          className={inputCls}
        >
          {COUNTRY_DIAL_CODES.map((c) => (
            <option key={c.country} value={c.country}>
              {c.country} ({c.code})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Código internacional</label>
        <input
          type="text"
          value={strVal(data, codeKey) || '+52'}
          onChange={(e) => setField(codeKey, e.target.value)}
          placeholder="+52"
          className={inputCls}
        />
      </div>
    </div>
  );

  const renderFields = () => {
    switch (qrType) {
      case 'texto':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Título (opcional, primera línea)</label>
              <input
                type="text"
                value={strVal(data, 'titulo')}
                onChange={(e) => setField('titulo', e.target.value)}
                placeholder="Ej. Aviso importante"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Texto multilínea *</label>
              <textarea
                rows={4}
                value={strVal(data, 'texto')}
                onChange={(e) => setField('texto', e.target.value)}
                placeholder="Escribe texto con acentos, ñ, emojis o saltos de línea..."
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'url':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Dirección web (URL / URI) *</label>
              <input
                type="text"
                value={strVal(data, 'url')}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="ejemplo.com/promo (se propondrá https://)"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Nombre interno opcional (no entra al QR)</label>
              <input
                type="text"
                value={strVal(data, 'nombreInterno')}
                onChange={(e) => setField('nombreInterno', e.target.value)}
                placeholder="Referencia interna para tu organización"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'uri_personalizada': {
        const modo = strVal(data, 'modo') || 'constructor';
        const params = Array.isArray(data.parametros)
          ? (data.parametros as Array<{ clave: string; valor: string }>)
          : [{ clave: '', valor: '' }];

        return (
          <div className="space-y-3">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => setField('modo', 'constructor')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  modo === 'constructor' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Constructor por partes
              </button>
              <button
                type="button"
                onClick={() => setField('modo', 'completa')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  modo === 'completa' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                URI completa
              </button>
            </div>

            {modo === 'completa' ? (
              <div>
                <label className={labelCls}>URI completa *</label>
                <input
                  type="text"
                  value={strVal(data, 'uriCompleta')}
                  onChange={(e) => setField('uriCompleta', e.target.value)}
                  placeholder="miapp://producto/123?origen=qr#detalle"
                  className={`${inputCls} font-mono`}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Esquema *</label>
                    <input
                      type="text"
                      value={strVal(data, 'esquema')}
                      onChange={(e) => setField('esquema', e.target.value)}
                      placeholder="https / miapp"
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Dominio o ruta *</label>
                    <input
                      type="text"
                      value={strVal(data, 'dominioRuta')}
                      onChange={(e) => setField('dominioRuta', e.target.value)}
                      placeholder="midominio.com/ruta"
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-700">
                      Parámetros clave / valor
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setField('parametros', [...params, { clave: '', valor: '' }])
                      }
                      className="text-xs font-medium text-slate-800 hover:text-slate-950 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar parámetro
                    </button>
                  </div>
                  <div className="space-y-2">
                    {params.map((p, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={p.clave}
                          onChange={(e) => {
                            const next = [...params];
                            next[idx] = { ...p, clave: e.target.value };
                            setField('parametros', next);
                          }}
                          placeholder="clave"
                          className={`${inputCls} font-mono`}
                        />
                        <input
                          type="text"
                          value={p.valor}
                          onChange={(e) => {
                            const next = [...params];
                            next[idx] = { ...p, valor: e.target.value };
                            setField('parametros', next);
                          }}
                          placeholder="valor"
                          className={`${inputCls} font-mono`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setField(
                              'parametros',
                              params.length > 1
                                ? params.filter((_, i) => i !== idx)
                                : [{ clave: '', valor: '' }]
                            )
                          }
                          aria-label="Eliminar parámetro"
                          className="p-2 text-slate-500 hover:text-red-600 rounded-lg border border-slate-200 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Fragmento (#)</label>
                  <input
                    type="text"
                    value={strVal(data, 'fragmento')}
                    onChange={(e) => setField('fragmento', e.target.value)}
                    placeholder="seccion-1"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'unit_link':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>URL existente de Unit.Link o agregador *</label>
              <input
                type="text"
                value={strVal(data, 'url')}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://unit.link/tu-perfil"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Etiqueta interna opcional</label>
              <input
                type="text"
                value={strVal(data, 'etiquetaInterna')}
                onChange={(e) => setField('etiquetaInterna', e.target.value)}
                placeholder="Solo referencia interna"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'busqueda':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Buscador *</label>
              <select
                value={strVal(data, 'buscador') || 'google'}
                onChange={(e) => setField('buscador', e.target.value)}
                className={inputCls}
              >
                <option value="google">Google</option>
                <option value="bing">Bing</option>
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Palabras clave *</label>
              <input
                type="text"
                value={strVal(data, 'palabrasClave')}
                onChange={(e) => setField('palabrasClave', e.target.value)}
                placeholder="Ej. impresoras 3d resina"
                className={inputCls}
              />
            </div>
            {strVal(data, 'buscador') !== 'youtube' && (
              <div>
                <label className={labelCls}>Filtro de sitio opcional (site:)</label>
                <input
                  type="text"
                  value={strVal(data, 'filtroSitio')}
                  onChange={(e) => setField('filtroSitio', e.target.value)}
                  placeholder="Ej. midominio.com"
                  className={inputCls}
                />
              </div>
            )}
          </div>
        );

      case 'pago':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Proveedor *</label>
                <select
                  value={strVal(data, 'proveedor') || 'paypal'}
                  onChange={(e) => setField('proveedor', e.target.value)}
                  className={inputCls}
                >
                  <option value="paypal">PayPal.me</option>
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="stripe">Stripe Payment Link</option>
                  <option value="otro">Otro proveedor</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>URL de cobro existente *</label>
                <input
                  type="text"
                  value={strVal(data, 'urlCobro')}
                  onChange={(e) => setField('urlCobro', e.target.value)}
                  placeholder="https://paypal.me/tunegocio"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Importe (opcional)</label>
                <input
                  type="text"
                  value={strVal(data, 'importe')}
                  onChange={(e) => setField('importe', e.target.value)}
                  placeholder="250.00"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Moneda</label>
                <input
                  type="text"
                  value={strVal(data, 'moneda')}
                  onChange={(e) => setField('moneda', e.target.value)}
                  placeholder="MXN"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Referencia</label>
                <input
                  type="text"
                  value={strVal(data, 'referencia')}
                  onChange={(e) => setField('referencia', e.target.value)}
                  placeholder="PED-001"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Concepto (referencia interna)</label>
              <input
                type="text"
                value={strVal(data, 'concepto')}
                onChange={(e) => setField('concepto', e.target.value)}
                placeholder="Anticipo de servicio"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'redes_sociales':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Plataforma *</label>
                <select
                  value={strVal(data, 'plataforma') || 'instagram'}
                  onChange={(e) => setField('plataforma', e.target.value)}
                  className={inputCls}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                  <option value="x">X (Twitter)</option>
                  <option value="youtube">YouTube</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="personalizado">Enlace personalizado</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Tipo de destino</label>
                <select
                  value={strVal(data, 'tipoDestino') || 'perfil'}
                  onChange={(e) => setField('tipoDestino', e.target.value)}
                  className={inputCls}
                >
                  <option value="perfil">Perfil</option>
                  <option value="pagina">Página</option>
                  <option value="publicacion">Publicación</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Usuario o URL directa *</label>
              <input
                type="text"
                value={strVal(data, 'usuarioOUrl')}
                onChange={(e) => setField('usuarioOUrl', e.target.value)}
                placeholder="@usuario o https://..."
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Plataforma *</label>
                <select
                  value={strVal(data, 'plataforma') || 'youtube'}
                  onChange={(e) => setField('plataforma', e.target.value)}
                  className={inputCls}
                >
                  <option value="youtube">YouTube</option>
                  <option value="vimeo">Vimeo</option>
                  <option value="tiktok">TikTok</option>
                  <option value="dailymotion">Dailymotion</option>
                  <option value="otro">Enlace directo / Otro</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Tiempo de inicio (opcional)</label>
                <input
                  type="text"
                  value={strVal(data, 'tiempoInicio')}
                  onChange={(e) => setField('tiempoInicio', e.target.value)}
                  placeholder="Ej. 1:30 o 90"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Enlace del video *</label>
              <input
                type="text"
                value={strVal(data, 'urlVideo')}
                onChange={(e) => setField('urlVideo', e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'archivo':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>URL existente del archivo *</label>
              <input
                type="text"
                value={strVal(data, 'url')}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://tusitio.com/documentos/ficha.pdf"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre del archivo (referencia)</label>
                <input
                  type="text"
                  value={strVal(data, 'nombre')}
                  onChange={(e) => setField('nombre', e.target.value)}
                  placeholder="Catálogo 2026"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Tipo de recurso</label>
                <select
                  value={strVal(data, 'tipoArchivo') || 'pdf'}
                  onChange={(e) => setField('tipoArchivo', e.target.value)}
                  className={inputCls}
                >
                  <option value="pdf">PDF</option>
                  <option value="imagen">Imagen</option>
                  <option value="documento">Documento</option>
                  <option value="audio">Audio</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 'aplicacion':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Destino *</label>
              <select
                value={strVal(data, 'destino') || 'google_play'}
                onChange={(e) => setField('destino', e.target.value)}
                className={inputCls}
              >
                <option value="google_play">Google Play</option>
                <option value="app_store">App Store</option>
                <option value="web">Web / PWA</option>
                <option value="deep_link">Enlace profundo (Deep Link)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>URL o URI de la aplicación *</label>
              <input
                type="text"
                value={strVal(data, 'url')}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://play.google.com/store/apps/details?id=..."
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'email':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Destinatarios (separa múltiples correos con coma) *</label>
              <input
                type="text"
                value={strVal(data, 'destinatarios')}
                onChange={(e) => setField('destinatarios', e.target.value)}
                placeholder="ventas@empresa.com, soporte@empresa.com"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>CC (opcional)</label>
                <input
                  type="text"
                  value={strVal(data, 'cc')}
                  onChange={(e) => setField('cc', e.target.value)}
                  placeholder="copia@empresa.com"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>CCO (opcional)</label>
                <input
                  type="text"
                  value={strVal(data, 'cco')}
                  onChange={(e) => setField('cco', e.target.value)}
                  placeholder="oculta@empresa.com"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Asunto</label>
              <input
                type="text"
                value={strVal(data, 'asunto')}
                onChange={(e) => setField('asunto', e.target.value)}
                placeholder="Solicitud de información"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Mensaje</label>
              <textarea
                rows={3}
                value={strVal(data, 'mensaje')}
                onChange={(e) => setField('mensaje', e.target.value)}
                placeholder="Cuerpo del correo..."
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'contacto': {
        const telefonos = Array.isArray(data.telefonos)
          ? (data.telefonos as Array<{ tipo: string; numero: string }>)
          : [{ tipo: 'CELL', numero: '' }];
        const correos = Array.isArray(data.correos)
          ? (data.correos as Array<{ tipo: string; correo: string }>)
          : [{ tipo: 'WORK', correo: '' }];
        const sitiosWeb = Array.isArray(data.sitiosWeb) ? (data.sitiosWeb as string[]) : [''];
        const direcciones = Array.isArray(data.direcciones)
          ? (data.direcciones as Array<Record<string, string>>)
          : [];

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre *</label>
                <input
                  type="text"
                  value={strVal(data, 'nombre')}
                  onChange={(e) => setField('nombre', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Apellidos</label>
                <input
                  type="text"
                  value={strVal(data, 'apellidos')}
                  onChange={(e) => setField('apellidos', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Empresa</label>
                <input
                  type="text"
                  value={strVal(data, 'empresa')}
                  onChange={(e) => setField('empresa', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Puesto</label>
                <input
                  type="text"
                  value={strVal(data, 'puesto')}
                  onChange={(e) => setField('puesto', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Teléfonos repetibles */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-700">Teléfonos</span>
                <button
                  type="button"
                  onClick={() =>
                    setField('telefonos', [...telefonos, { tipo: 'CELL', numero: '' }])
                  }
                  className="text-xs font-medium text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar teléfono
                </button>
              </div>
              <div className="space-y-2">
                {telefonos.map((t, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select
                      value={t.tipo}
                      onChange={(e) => {
                        const next = [...telefonos];
                        next[idx] = { ...t, tipo: e.target.value };
                        setField('telefonos', next);
                      }}
                      className="px-2.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="CELL">Móvil</option>
                      <option value="WORK">Trabajo</option>
                      <option value="HOME">Casa</option>
                      <option value="VOICE">Otro</option>
                    </select>
                    <input
                      type="text"
                      value={t.numero}
                      onChange={(e) => {
                        const next = [...telefonos];
                        next[idx] = { ...t, numero: e.target.value };
                        setField('telefonos', next);
                      }}
                      placeholder="+52 55 1234 5678"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setField(
                          'telefonos',
                          telefonos.length > 1
                            ? telefonos.filter((_, i) => i !== idx)
                            : [{ tipo: 'CELL', numero: '' }]
                        )
                      }
                      className="p-2 text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Correos repetibles */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-700">Correos</span>
                <button
                  type="button"
                  onClick={() => setField('correos', [...correos, { tipo: 'WORK', correo: '' }])}
                  className="text-xs font-medium text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar correo
                </button>
              </div>
              <div className="space-y-2">
                {correos.map((m, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select
                      value={m.tipo}
                      onChange={(e) => {
                        const next = [...correos];
                        next[idx] = { ...m, tipo: e.target.value };
                        setField('correos', next);
                      }}
                      className="px-2.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="WORK">Trabajo</option>
                      <option value="HOME">Personal</option>
                      <option value="OTHER">Otro</option>
                    </select>
                    <input
                      type="email"
                      value={m.correo}
                      onChange={(e) => {
                        const next = [...correos];
                        next[idx] = { ...m, correo: e.target.value };
                        setField('correos', next);
                      }}
                      placeholder="correo@dominio.com"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setField(
                          'correos',
                          correos.length > 1
                            ? correos.filter((_, i) => i !== idx)
                            : [{ tipo: 'WORK', correo: '' }]
                        )
                      }
                      className="p-2 text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Sitios web repetibles */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-700">Sitios web</span>
                <button
                  type="button"
                  onClick={() => setField('sitiosWeb', [...sitiosWeb, ''])}
                  className="text-xs font-medium text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar sitio
                </button>
              </div>
              <div className="space-y-2">
                {sitiosWeb.map((site, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={site}
                      onChange={(e) => {
                        const next = [...sitiosWeb];
                        next[idx] = e.target.value;
                        setField('sitiosWeb', next);
                      }}
                      placeholder="https://tusitio.com"
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setField(
                          'sitiosWeb',
                          sitiosWeb.length > 1 ? sitiosWeb.filter((_, i) => i !== idx) : ['']
                        )
                      }
                      className="p-2 text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Cumpleaños</label>
                <input
                  type="date"
                  value={strVal(data, 'cumpleanos')}
                  onChange={(e) => setField('cumpleanos', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Notas</label>
                <input
                  type="text"
                  value={strVal(data, 'notas')}
                  onChange={(e) => setField('notas', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Direcciones repetibles */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-700">Direcciones</span>
                <button
                  type="button"
                  onClick={() =>
                    setField('direcciones', [
                      ...direcciones,
                      {
                        tipo: 'WORK',
                        calle: '',
                        colonia: '',
                        ciudad: '',
                        estado: '',
                        codigoPostal: '',
                        pais: '',
                      },
                    ])
                  }
                  className="text-xs font-medium text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar dirección
                </button>
              </div>
              <div className="space-y-3">
                {direcciones.map((dir, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <select
                        value={dir.tipo || 'WORK'}
                        onChange={(e) => {
                          const next = [...direcciones];
                          next[idx] = { ...dir, tipo: e.target.value };
                          setField('direcciones', next);
                        }}
                        className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md"
                      >
                        <option value="WORK">Trabajo</option>
                        <option value="HOME">Casa</option>
                        <option value="OTHER">Otra</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setField(
                            'direcciones',
                            direcciones.filter((_, i) => i !== idx)
                          )
                        }
                        className="text-xs text-red-600 hover:underline cursor-pointer"
                      >
                        Quitar dirección
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Calle y número"
                        value={dir.calle || ''}
                        onChange={(e) => {
                          const next = [...direcciones];
                          next[idx] = { ...dir, calle: e.target.value };
                          setField('direcciones', next);
                        }}
                        className={inputCls}
                      />
                      <input
                        type="text"
                        placeholder="Colonia"
                        value={dir.colonia || ''}
                        onChange={(e) => {
                          const next = [...direcciones];
                          next[idx] = { ...dir, colonia: e.target.value };
                          setField('direcciones', next);
                        }}
                        className={inputCls}
                      />
                      <input
                        type="text"
                        placeholder="Municipio o ciudad"
                        value={dir.ciudad || ''}
                        onChange={(e) => {
                          const next = [...direcciones];
                          next[idx] = { ...dir, ciudad: e.target.value };
                          setField('direcciones', next);
                        }}
                        className={inputCls}
                      />
                      <input
                        type="text"
                        placeholder="Estado"
                        value={dir.estado || ''}
                        onChange={(e) => {
                          const next = [...direcciones];
                          next[idx] = { ...dir, estado: e.target.value };
                          setField('direcciones', next);
                        }}
                        className={inputCls}
                      />
                      <input
                        type="text"
                        placeholder="Código postal"
                        value={dir.codigoPostal || ''}
                        onChange={(e) => {
                          const next = [...direcciones];
                          next[idx] = { ...dir, codigoPostal: e.target.value };
                          setField('direcciones', next);
                        }}
                        className={inputCls}
                      />
                      <input
                        type="text"
                        placeholder="País"
                        value={dir.pais || ''}
                        onChange={(e) => {
                          const next = [...direcciones];
                          next[idx] = { ...dir, pais: e.target.value };
                          setField('direcciones', next);
                        }}
                        className={inputCls}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'telefono':
        return (
          <div className="space-y-3">
            {renderDialCodeSelect()}
            <div>
              <label className={labelCls}>Número de teléfono *</label>
              <input
                type="tel"
                value={strVal(data, 'numero')}
                onChange={(e) => setField('numero', e.target.value)}
                placeholder="55 1234 5678"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Etiqueta interna opcional</label>
              <input
                type="text"
                value={strVal(data, 'etiquetaInterna')}
                onChange={(e) => setField('etiquetaInterna', e.target.value)}
                placeholder="Solo referencia interna"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'sms':
        return (
          <div className="space-y-3">
            {renderDialCodeSelect()}
            <div>
              <label className={labelCls}>Número destinatario *</label>
              <input
                type="tel"
                value={strVal(data, 'numero')}
                onChange={(e) => setField('numero', e.target.value)}
                placeholder="55 1234 5678"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Mensaje opcional</label>
              <textarea
                rows={2}
                value={strVal(data, 'mensaje')}
                onChange={(e) => setField('mensaje', e.target.value)}
                placeholder="Hola, solicito información..."
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'ubicacion':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Latitud *</label>
                <input
                  type="text"
                  value={strVal(data, 'latitud')}
                  onChange={(e) => setField('latitud', e.target.value)}
                  placeholder="19.432608"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Longitud *</label>
                <input
                  type="text"
                  value={strVal(data, 'longitud')}
                  onChange={(e) => setField('longitud', e.target.value)}
                  placeholder="-99.133209"
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Nombre del lugar (opcional)</label>
              <input
                type="text"
                value={strVal(data, 'nombre')}
                onChange={(e) => setField('nombre', e.target.value)}
                placeholder="Sucursal Centro"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'localizacion_personalizada': {
        const proveedor = strVal(data, 'proveedor') || 'google_maps';
        const modoEntrada = strVal(data, 'modoEntrada') || 'coordenadas';
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Proveedor *</label>
                <select
                  value={proveedor}
                  onChange={(e) => setField('proveedor', e.target.value)}
                  className={inputCls}
                >
                  <option value="google_maps">Google Maps</option>
                  <option value="apple_maps">Apple Maps</option>
                  <option value="waze">Waze</option>
                  <option value="personalizado">Enlace personalizado</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Nombre del punto</label>
                <input
                  type="text"
                  value={strVal(data, 'nombre')}
                  onChange={(e) => setField('nombre', e.target.value)}
                  placeholder="Bodega Norte"
                  className={inputCls}
                />
              </div>
            </div>

            {proveedor !== 'personalizado' && (
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setField('modoEntrada', 'coordenadas')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    modoEntrada === 'coordenadas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Coordenadas
                </button>
                <button
                  type="button"
                  onClick={() => setField('modoEntrada', 'enlace')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    modoEntrada === 'enlace' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Enlace de mapa existente
                </button>
              </div>
            )}

            {modoEntrada === 'enlace' || proveedor === 'personalizado' ? (
              <div>
                <label className={labelCls}>Enlace del mapa *</label>
                <input
                  type="text"
                  value={strVal(data, 'enlaceMapa')}
                  onChange={(e) => setField('enlaceMapa', e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                  className={inputCls}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Latitud *</label>
                  <input
                    type="text"
                    value={strVal(data, 'latitud')}
                    onChange={(e) => setField('latitud', e.target.value)}
                    placeholder="19.4326"
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Longitud *</label>
                  <input
                    type="text"
                    value={strVal(data, 'longitud')}
                    onChange={(e) => setField('longitud', e.target.value)}
                    placeholder="-99.1332"
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Referencia opcional</label>
              <input
                type="text"
                value={strVal(data, 'referencia')}
                onChange={(e) => setField('referencia', e.target.value)}
                placeholder="Portón azul junto a..."
                className={inputCls}
              />
            </div>
          </div>
        );
      }

      case 'direccion':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Modo al escanear</label>
              <select
                value={strVal(data, 'modoSalida') || 'maps'}
                onChange={(e) => setField('modoSalida', e.target.value)}
                className={inputCls}
              >
                <option value="maps">Abrir ubicación en Google Maps</option>
                <option value="texto">Mostrar dirección completa en texto</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Lugar o negocio</label>
                <input
                  type="text"
                  value={strVal(data, 'lugar')}
                  onChange={(e) => setField('lugar', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Calle *</label>
                <input
                  type="text"
                  value={strVal(data, 'calle')}
                  onChange={(e) => setField('calle', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Número exterior</label>
                <input
                  type="text"
                  value={strVal(data, 'numExterior')}
                  onChange={(e) => setField('numExterior', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Número interior</label>
                <input
                  type="text"
                  value={strVal(data, 'numInterior')}
                  onChange={(e) => setField('numInterior', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Colonia</label>
                <input
                  type="text"
                  value={strVal(data, 'colonia')}
                  onChange={(e) => setField('colonia', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Municipio o ciudad *</label>
                <input
                  type="text"
                  value={strVal(data, 'ciudad')}
                  onChange={(e) => setField('ciudad', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Estado</label>
                <input
                  type="text"
                  value={strVal(data, 'estado')}
                  onChange={(e) => setField('estado', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Código postal</label>
                <input
                  type="text"
                  value={strVal(data, 'codigoPostal')}
                  onChange={(e) => setField('codigoPostal', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>País</label>
                <input
                  type="text"
                  value={strVal(data, 'pais')}
                  onChange={(e) => setField('pais', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Referencias</label>
                <input
                  type="text"
                  value={strVal(data, 'referencias')}
                  onChange={(e) => setField('referencias', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        );

      case 'ruta_destino':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Destino (dirección o lat,lng) *</label>
              <input
                type="text"
                value={strVal(data, 'destino')}
                onChange={(e) => setField('destino', e.target.value)}
                placeholder="Av. Reforma 222, CDMX o 19.429,-99.163"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Origen opcional</label>
              <input
                type="text"
                value={strVal(data, 'origen')}
                onChange={(e) => setField('origen', e.target.value)}
                placeholder="Dejar vacío para usar ubicación actual del lector"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Medio de transporte</label>
              <select
                value={strVal(data, 'transporte') || 'driving'}
                onChange={(e) => setField('transporte', e.target.value)}
                className={inputCls}
              >
                <option value="driving">Automóvil</option>
                <option value="walking">A pie</option>
                <option value="bicycling">Bicicleta</option>
                <option value="transit">Transporte público</option>
              </select>
            </div>
          </div>
        );

      case 'proximidad':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Negocio, servicio o categoría *</label>
              <input
                type="text"
                value={strVal(data, 'busqueda')}
                onChange={(e) => setField('busqueda', e.target.value)}
                placeholder="Ej. farmacias 24 horas, café de especialidad"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Zona de referencia (dirección o coordenadas)</label>
              <input
                type="text"
                value={strVal(data, 'zona')}
                onChange={(e) => setField('zona', e.target.value)}
                placeholder="Roma Norte, CDMX o 19.419,-99.162"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'street_view':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Latitud *</label>
                <input
                  type="text"
                  value={strVal(data, 'latitud')}
                  onChange={(e) => setField('latitud', e.target.value)}
                  placeholder="19.432608"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>Longitud *</label>
                <input
                  type="text"
                  value={strVal(data, 'longitud')}
                  onChange={(e) => setField('longitud', e.target.value)}
                  placeholder="-99.133209"
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>ID de panorama opcional (pano)</label>
              <input
                type="text"
                value={strVal(data, 'panoId')}
                onChange={(e) => setField('panoId', e.target.value)}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Orientación (0–360)</label>
                <input
                  type="number"
                  min={0}
                  max={360}
                  value={strVal(data, 'orientacion')}
                  onChange={(e) => setField('orientacion', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Inclinación (-90 a 90)</label>
                <input
                  type="number"
                  min={-90}
                  max={90}
                  value={strVal(data, 'inclinacion')}
                  onChange={(e) => setField('inclinacion', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Campo visual (10–120)</label>
                <input
                  type="number"
                  min={10}
                  max={120}
                  value={strVal(data, 'fov')}
                  onChange={(e) => setField('fov', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        );

      case 'emergencia': {
        const contactos = Array.isArray(data.contactos)
          ? (data.contactos as Array<{ nombre: string; parentesco: string; telefono: string }>)
          : [{ nombre: '', parentesco: '', telefono: '' }];

        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>
                Aviso de privacidad: todos los datos médicos y contactos ingresados en esta ficha
                quedarán visibles en texto plano para cualquier persona que escanee la imagen QR.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre completo *</label>
                <input
                  type="text"
                  value={strVal(data, 'nombre')}
                  onChange={(e) => setField('nombre', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Tipo de sangre</label>
                <input
                  type="text"
                  value={strVal(data, 'tipoSangre')}
                  onChange={(e) => setField('tipoSangre', e.target.value)}
                  placeholder="O+"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Alergias</label>
              <input
                type="text"
                value={strVal(data, 'alergias')}
                onChange={(e) => setField('alergias', e.target.value)}
                placeholder="Penicilina, nueces..."
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Condiciones médicas</label>
                <input
                  type="text"
                  value={strVal(data, 'condiciones')}
                  onChange={(e) => setField('condiciones', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Medicamentos</label>
                <input
                  type="text"
                  value={strVal(data, 'medicamentos')}
                  onChange={(e) => setField('medicamentos', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-700">Contactos de emergencia</span>
                <button
                  type="button"
                  onClick={() =>
                    setField('contactos', [
                      ...contactos,
                      { nombre: '', parentesco: '', telefono: '' },
                    ])
                  }
                  className="text-xs font-medium text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar contacto
                </button>
              </div>
              <div className="space-y-2">
                {contactos.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={c.nombre}
                      onChange={(e) => {
                        const next = [...contactos];
                        next[idx] = { ...c, nombre: e.target.value };
                        setField('contactos', next);
                      }}
                      className={`${inputCls} sm:col-span-3`}
                    />
                    <input
                      type="text"
                      placeholder="Parentesco"
                      value={c.parentesco}
                      onChange={(e) => {
                        const next = [...contactos];
                        next[idx] = { ...c, parentesco: e.target.value };
                        setField('contactos', next);
                      }}
                      className={`${inputCls} sm:col-span-2`}
                    />
                    <div className="flex gap-1.5 sm:col-span-2">
                      <input
                        type="tel"
                        placeholder="Teléfono"
                        value={c.telefono}
                        onChange={(e) => {
                          const next = [...contactos];
                          next[idx] = { ...c, telefono: e.target.value };
                          setField('contactos', next);
                        }}
                        className={inputCls}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setField(
                            'contactos',
                            contactos.length > 1
                              ? contactos.filter((_, i) => i !== idx)
                              : [{ nombre: '', parentesco: '', telefono: '' }]
                          )
                        }
                        className="p-2 text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Notas adicionales</label>
              <textarea
                rows={2}
                value={strVal(data, 'notas')}
                onChange={(e) => setField('notas', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        );
      }

      case 'bluetooth':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Modo de resultado al escanear</label>
              <select
                value={strVal(data, 'modoSalida') || 'datos'}
                onChange={(e) => setField('modoSalida', e.target.value)}
                className={inputCls}
              >
                <option value="datos">Mostrar datos de conexión Bluetooth</option>
                <option value="url_fabricante">Abrir URL del fabricante</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre del dispositivo</label>
                <input
                  type="text"
                  value={strVal(data, 'nombreDispositivo')}
                  onChange={(e) => setField('nombreDispositivo', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Estándar</label>
                <select
                  value={strVal(data, 'tipo') || 'BLE'}
                  onChange={(e) => setField('tipo', e.target.value)}
                  className={inputCls}
                >
                  <option value="BLE">Bluetooth Low Energy (BLE)</option>
                  <option value="Clásico">Bluetooth Clásico</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Identificador o MAC</label>
                <input
                  type="text"
                  value={strVal(data, 'macOId')}
                  onChange={(e) => setField('macOId', e.target.value)}
                  placeholder="AA:BB:CC:11:22:33"
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>UUID opcional</label>
                <input
                  type="text"
                  value={strVal(data, 'uuid')}
                  onChange={(e) => setField('uuid', e.target.value)}
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Instrucciones</label>
              <textarea
                rows={2}
                value={strVal(data, 'instrucciones')}
                onChange={(e) => setField('instrucciones', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>URL del fabricante (opcional)</label>
              <input
                type="text"
                value={strVal(data, 'urlFabricante')}
                onChange={(e) => setField('urlFabricante', e.target.value)}
                placeholder="https://fabricante.com/soporte"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'wifi':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nombre de la red (SSID) *</label>
              <input
                type="text"
                value={strVal(data, 'ssid')}
                onChange={(e) => setField('ssid', e.target.value)}
                placeholder="MiRed_Oficina"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Seguridad *</label>
                <select
                  value={strVal(data, 'seguridad') || 'WPA'}
                  onChange={(e) => setField('seguridad', e.target.value)}
                  className={inputCls}
                >
                  <option value="WPA">WPA / WPA2 / WPA3</option>
                  <option value="WEP">WEP</option>
                  <option value="nopass">Abierta (sin contraseña)</option>
                </select>
              </div>
              {strVal(data, 'seguridad') !== 'nopass' && (
                <div>
                  <label className={labelCls}>Contraseña *</label>
                  <div className="relative">
                    <input
                      type={showWifiPass ? 'text' : 'password'}
                      value={strVal(data, 'password')}
                      onChange={(e) => setField('password', e.target.value)}
                      placeholder="Contraseña Wi-Fi"
                      className={`${inputCls} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowWifiPass((v) => !v)}
                      aria-label={showWifiPass ? 'Ocultar contraseña Wi-Fi' : 'Mostrar contraseña Wi-Fi'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      {showWifiPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={boolVal(data, 'oculta')}
                onChange={(e) => setField('oculta', e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              Red oculta (no difunde SSID)
            </label>
          </div>
        );

      case 'impresion_3d':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Formato del perfil al escanear</label>
              <select
                value={strVal(data, 'modoSalida') || 'texto'}
                onChange={(e) => setField('modoSalida', e.target.value)}
                className={inputCls}
              >
                <option value="texto">Texto legible</option>
                <option value="json">JSON estructurado</option>
              </select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                ['marca', 'Marca'],
                ['material', 'Material (PLA, PETG...)'],
                ['color', 'Color'],
                ['diametro', 'Diámetro'],
                ['tempBoquilla', 'Temp. boquilla'],
                ['tempCama', 'Temp. cama'],
                ['velocidad', 'Velocidad'],
                ['ventilacion', 'Ventilación'],
                ['flujo', 'Flujo'],
                ['retraccion', 'Retracción'],
                ['lote', 'Lote'],
                ['impresora', 'Impresora'],
              ].map(([k, lbl]) => (
                <div key={k}>
                  <label className={labelCls}>{lbl}</label>
                  <input
                    type="text"
                    value={strVal(data, k)}
                    onChange={(e) => setField(k, e.target.value)}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className={labelCls}>URL de ficha técnica</label>
              <input
                type="text"
                value={strVal(data, 'fichaTecnica')}
                onChange={(e) => setField('fichaTecnica', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Notas</label>
              <textarea
                rows={2}
                value={strVal(data, 'notas')}
                onChange={(e) => setField('notas', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'datos_personalizados': {
        const campos = Array.isArray(data.campos)
          ? (data.campos as Array<{ clave: string; tipo: string; valor: unknown }>)
          : [{ clave: '', tipo: 'texto', valor: '' }];

        const moveCampo = (idx: number, dir: -1 | 1) => {
          const target = idx + dir;
          if (target < 0 || target >= campos.length) return;
          const next = [...campos];
          const tmp = next[idx];
          next[idx] = next[target];
          next[target] = tmp;
          setField('campos', next);
        };

        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Formato de salida</label>
                <select
                  value={strVal(data, 'modoSalida') || 'texto'}
                  onChange={(e) => setField('modoSalida', e.target.value)}
                  className={inputCls}
                >
                  <option value="texto">Texto legible</option>
                  <option value="json">JSON válido</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Título opcional</label>
                <input
                  type="text"
                  value={strVal(data, 'titulo')}
                  onChange={(e) => setField('titulo', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-700">
                  Campos clave / valor (reordenables)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setField('campos', [...campos, { clave: '', tipo: 'texto', valor: '' }])
                  }
                  className="text-xs font-medium text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar campo
                </button>
              </div>
              <div className="space-y-2">
                {campos.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Nombre de campo"
                      value={c.clave}
                      onChange={(e) => {
                        const next = [...campos];
                        next[idx] = { ...c, clave: e.target.value };
                        setField('campos', next);
                      }}
                      className={`${inputCls} sm:col-span-4`}
                    />
                    <select
                      value={c.tipo || 'texto'}
                      onChange={(e) => {
                        const next = [...campos];
                        next[idx] = {
                          ...c,
                          tipo: e.target.value,
                          valor: e.target.value === 'booleano' ? false : '',
                        };
                        setField('campos', next);
                      }}
                      className="px-2 py-2 text-sm bg-white border border-slate-300 rounded-lg sm:col-span-3"
                    >
                      <option value="texto">Texto</option>
                      <option value="numero">Número</option>
                      <option value="fecha">Fecha</option>
                      <option value="url">URL</option>
                      <option value="booleano">Sí / No</option>
                    </select>
                    <div className="sm:col-span-3">
                      {c.tipo === 'booleano' ? (
                        <select
                          value={c.valor ? 'true' : 'false'}
                          onChange={(e) => {
                            const next = [...campos];
                            next[idx] = { ...c, valor: e.target.value === 'true' };
                            setField('campos', next);
                          }}
                          className={inputCls}
                        >
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          type={
                            c.tipo === 'numero'
                              ? 'number'
                              : c.tipo === 'fecha'
                                ? 'date'
                                : 'text'
                          }
                          placeholder="Valor"
                          value={typeof c.valor === 'string' ? c.valor : String(c.valor ?? '')}
                          onChange={(e) => {
                            const next = [...campos];
                            next[idx] = { ...c, valor: e.target.value };
                            setField('campos', next);
                          }}
                          className={inputCls}
                        />
                      )}
                    </div>
                    <div className="flex gap-1 sm:col-span-2 justify-end">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveCampo(idx, -1)}
                        aria-label="Subir campo"
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === campos.length - 1}
                        onClick={() => moveCampo(idx, 1)}
                        aria-label="Bajar campo"
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-600 disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setField(
                            'campos',
                            campos.length > 1
                              ? campos.filter((_, i) => i !== idx)
                              : [{ clave: '', tipo: 'texto', valor: '' }]
                          )
                        }
                        aria-label="Eliminar campo"
                        className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case 'whatsapp':
        return (
          <div className="space-y-3">
            {renderDialCodeSelect()}
            <div>
              <label className={labelCls}>Número de WhatsApp *</label>
              <input
                type="tel"
                value={strVal(data, 'numero')}
                onChange={(e) => setField('numero', e.target.value)}
                placeholder="55 1234 5678"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Mensaje prellenado opcional</label>
              <textarea
                rows={3}
                value={strVal(data, 'mensaje')}
                onChange={(e) => setField('mensaje', e.target.value)}
                placeholder="Hola, me interesa cotizar..."
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'calendario': {
        const allDay = boolVal(data, 'diaCompleto');
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nombre del evento *</label>
              <input
                type="text"
                value={strVal(data, 'nombre')}
                onChange={(e) => setField('nombre', e.target.value)}
                placeholder="Reunión de lanzamiento"
                className={inputCls}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setField('diaCompleto', e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              Evento de día completo
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Inicio *</label>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  value={strVal(data, 'inicio')}
                  onChange={(e) => setField('inicio', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Fin</label>
                <input
                  type={allDay ? 'date' : 'datetime-local'}
                  value={strVal(data, 'fin')}
                  onChange={(e) => setField('fin', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Zona horaria</label>
                <input
                  type="text"
                  value={strVal(data, 'zonaHoraria')}
                  onChange={(e) => setField('zonaHoraria', e.target.value)}
                  placeholder="America/Mexico_City"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Ubicación</label>
                <input
                  type="text"
                  value={strVal(data, 'ubicacion')}
                  onChange={(e) => setField('ubicacion', e.target.value)}
                  placeholder="Sala Principal"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Descripción</label>
              <textarea
                rows={2}
                value={strVal(data, 'descripcion')}
                onChange={(e) => setField('descripcion', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Enlace opcional</label>
              <input
                type="text"
                value={strVal(data, 'enlace')}
                onChange={(e) => setField('enlace', e.target.value)}
                placeholder="https://..."
                className={inputCls}
              />
            </div>
          </div>
        );
      }

      case 'menu_catalogo':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nombre del negocio (referencia interna)</label>
              <input
                type="text"
                value={strVal(data, 'negocio')}
                onChange={(e) => setField('negocio', e.target.value)}
                placeholder="Restaurante La Palma"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>URL existente del menú, catálogo o PDF *</label>
              <input
                type="text"
                value={strVal(data, 'url')}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://minegocio.com/menu.pdf"
                className={inputCls}
              />
            </div>
          </div>
        );

      case 'resenas_google':
        return (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Nombre del negocio (referencia interna)</label>
              <input
                type="text"
                value={strVal(data, 'negocio')}
                onChange={(e) => setField('negocio', e.target.value)}
                placeholder="Clínica Dental Central"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Enlace directo de reseñas en Google *</label>
              <input
                type="text"
                value={strVal(data, 'urlResena')}
                onChange={(e) => setField('urlResena', e.target.value)}
                placeholder="https://g.page/r/..."
                className={inputCls}
              />
            </div>
          </div>
        );
    }
  };

  // Mask Wi-Fi password in the encoded preview string unless user toggled Show Password
  const displayPayload =
    qrType === 'wifi' && !showWifiPass && payloadInfo.payload
      ? payloadInfo.payload.replace(/;P:([^;]*);/, ';P:••••••••;')
      : payloadInfo.payload;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-slate-900">Datos del QR</h3>

      {renderFields()}

      {/* Validation errors / warnings */}
      {payloadInfo.errors.length > 0 && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
          {payloadInfo.errors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}

      {payloadInfo.warnings.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
          {payloadInfo.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {payloadInfo.exceedsCapacity && payloadInfo.capacityAdvice && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 space-y-1"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            Capacidad máxima del QR excedida
          </div>
          <p>{payloadInfo.capacityAdvice}</p>
        </div>
      )}

      {/* Exact encoded content preview */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-600">
            Contenido exacto codificado en el QR
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {payloadInfo.byteLength} / {payloadInfo.maxBytesForEC} B
          </span>
        </div>
        <pre className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap break-all max-h-36 overflow-y-auto">
          {displayPayload || 'Completa los campos obligatorios para generar el contenido.'}
        </pre>
      </div>
    </section>
  );
}
