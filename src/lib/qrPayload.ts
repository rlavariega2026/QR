import type { ErrorCorrectionLevel, QrTypeId } from '../types/qr';

export interface PayloadBuildResult {
  payload: string;
  errors: string[];
  warnings: string[];
  byteLength: number;
  maxBytesForEC: number;
  exceedsCapacity: boolean;
  capacityAdvice: string | null;
}

export const QR_MAX_BYTES_BY_EC: Record<ErrorCorrectionLevel, number> = {
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
};

function str(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

function rawStr(val: unknown): string {
  return typeof val === 'string' ? val : '';
}

export function ensureHttps(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function escapeWifiField(value: string): string {
  // Escapa \ ; , : " según especificación estándar WIFI:
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function parseStartTimeSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  const parts = trimmed.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function formatIcalDate(dateStr: string, allDay: boolean): string {
  if (!dateStr) return '';
  if (allDay) {
    const d = dateStr.slice(0, 10).replace(/-/g, '');
    return d;
  }
  // datetime-local format: YYYY-MM-DDTHH:mm
  const cleaned = dateStr.replace(/[-:]/g, '');
  if (cleaned.length === 13) return `${cleaned}00`;
  if (cleaned.length >= 15) return cleaned.slice(0, 15);
  return cleaned;
}

function cleanPhoneDigits(code: string, num: string): string {
  const combined = `${code}${num}`.replace(/[^\d+]/g, '');
  return combined.startsWith('+') ? combined : `+${combined.replace(/\+/g, '')}`;
}

function isValidUrlLike(val: string): boolean {
  try {
    const u = new URL(val);
    return Boolean(u.protocol);
  } catch {
    return false;
  }
}

export function buildQrPayload(
  qrType: QrTypeId,
  data: Record<string, unknown>,
  ecLevel: ErrorCorrectionLevel = 'M'
): PayloadBuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let payload = '';

  switch (qrType) {
    case 'texto': {
      const titulo = str(data.titulo);
      const texto = rawStr(data.texto).trimEnd();
      if (!texto.trim() && !titulo) {
        errors.push('Ingresa el texto que deseas codificar.');
      }
      payload = titulo ? (texto ? `${titulo}\n${texto}` : titulo) : texto;
      break;
    }

    case 'url': {
      const rawUrl = str(data.url);
      if (!rawUrl) {
        errors.push('Ingresa una dirección web (URL o URI).');
      } else {
        const normalized = ensureHttps(rawUrl);
        if (!isValidUrlLike(normalized)) {
          errors.push('La dirección ingresada no tiene un formato de URL válido.');
        }
        if (rawUrl !== normalized) {
          warnings.push(`Se agregó automáticamente el protocolo https:// (${normalized}).`);
        }
        payload = normalized;
      }
      break;
    }

    case 'uri_personalizada': {
      const modo = str(data.modo) || 'constructor';
      if (modo === 'completa') {
        const uriCompleta = str(data.uriCompleta);
        if (!uriCompleta) {
          errors.push('Ingresa la URI completa.');
        } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uriCompleta)) {
          errors.push('La URI debe iniciar con un esquema válido (ej. https:, myapp:, intent:).');
        }
        payload = uriCompleta;
      } else {
        const esquema = str(data.esquema).replace(/:$/, '');
        const dominioRuta = str(data.dominioRuta);
        const fragmento = str(data.fragmento).replace(/^#/, '');
        const params = Array.isArray(data.parametros)
          ? (data.parametros as Array<{ clave?: string; valor?: string }>)
          : [];

        if (!esquema) errors.push('Indica el esquema de la URI (ej. https, app, mailto).');
        if (!dominioRuta) errors.push('Indica el dominio o ruta de destino.');

        if (esquema && dominioRuta) {
          const cleanHost = dominioRuta.replace(/^\/\//, '');
          let built = `${esquema}://${cleanHost}`;
          const validParams = params.filter((p) => str(p.clave) !== '');
          if (validParams.length > 0) {
            const qs = validParams
              .map((p) => `${encodeURIComponent(str(p.clave))}=${encodeURIComponent(rawStr(p.valor))}`)
              .join('&');
            built += (built.includes('?') ? '&' : '?') + qs;
          }
          if (fragmento) {
            built += `#${encodeURIComponent(fragmento)}`;
          }
          payload = built;
        }
      }
      break;
    }

    case 'unit_link': {
      const rawUrl = str(data.url);
      if (!rawUrl) {
        errors.push('Ingresa la URL existente de Unit.Link o de tu agregador de enlaces.');
      } else {
        const normalized = ensureHttps(rawUrl);
        if (!isValidUrlLike(normalized)) {
          errors.push('El enlace de Unit.Link no es una URL válida.');
        }
        payload = normalized;
      }
      break;
    }

    case 'busqueda': {
      const buscador = str(data.buscador) || 'google';
      const palabras = str(data.palabrasClave);
      const filtro = str(data.filtroSitio);
      if (!palabras) {
        errors.push('Ingresa las palabras clave para la búsqueda.');
      } else {
        const supportsSite = buscador === 'google' || buscador === 'bing' || buscador === 'duckduckgo';
        const fullQuery =
          supportsSite && filtro
            ? `${palabras} site:${filtro.replace(/^site:/i, '')}`
            : palabras;
        const q = encodeURIComponent(fullQuery);
        if (buscador === 'google') payload = `https://www.google.com/search?q=${q}`;
        else if (buscador === 'bing') payload = `https://www.bing.com/search?q=${q}`;
        else if (buscador === 'duckduckgo') payload = `https://duckduckgo.com/?q=${q}`;
        else if (buscador === 'youtube') {
          if (filtro) {
            warnings.push('YouTube no admite el operador site:, se omitió del enlace.');
          }
          payload = `https://www.youtube.com/results?search_query=${encodeURIComponent(palabras)}`;
        }
      }
      break;
    }

    case 'pago': {
      const proveedor = str(data.proveedor) || 'paypal';
      const urlCobro = str(data.urlCobro);
      const importe = str(data.importe);
      const moneda = str(data.moneda).toUpperCase();
      const referencia = str(data.referencia);
      const concepto = str(data.concepto);

      if (!urlCobro) {
        errors.push('Ingresa la URL de cobro existente del proveedor.');
      } else {
        const normalized = ensureHttps(urlCobro);
        try {
          const urlObj = new URL(normalized);
          if (proveedor === 'paypal') {
            // PayPal.me soporta /<importe><moneda> en la ruta si es paypal.me
            if (urlObj.hostname.includes('paypal.me') && importe) {
              const cleanAmount = importe.replace(/[^0-9.]/g, '');
              if (cleanAmount) {
                const pathParts = urlObj.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
                if (pathParts.length >= 1) {
                  urlObj.pathname = `/${pathParts[0]}/${cleanAmount}${moneda || ''}`;
                }
              }
            }
          } else if (proveedor === 'stripe') {
            if (referencia) urlObj.searchParams.set('client_reference_id', referencia);
          } else if (proveedor === 'mercadopago') {
            if (referencia) urlObj.searchParams.set('external_reference', referencia);
          }
          if (concepto && (proveedor === 'otro' || proveedor === 'mercadopago')) {
            warnings.push('El concepto y demás datos no admitidos por el proveedor se conservan como referencia interna.');
          }
          payload = urlObj.toString();
        } catch {
          errors.push('La URL de cobro ingresada no es válida.');
        }
      }
      break;
    }

    case 'redes_sociales': {
      const plataforma = str(data.plataforma) || 'instagram';
      const usuarioOUrl = str(data.usuarioOUrl);
      const tipoDestino = str(data.tipoDestino) || 'perfil';
      if (!usuarioOUrl) {
        errors.push('Ingresa el usuario o enlace de la red social.');
      } else if (/^https?:\/\//i.test(usuarioOUrl) || usuarioOUrl.includes('.')) {
        payload = ensureHttps(usuarioOUrl);
      } else {
        const handle = usuarioOUrl.replace(/^@/, '');
        if (plataforma === 'instagram') payload = `https://www.instagram.com/${encodeURIComponent(handle)}/`;
        else if (plataforma === 'facebook') payload = `https://www.facebook.com/${encodeURIComponent(handle)}`;
        else if (plataforma === 'tiktok') payload = `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
        else if (plataforma === 'x') payload = `https://x.com/${encodeURIComponent(handle)}`;
        else if (plataforma === 'youtube') payload = `https://www.youtube.com/@${encodeURIComponent(handle)}`;
        else if (plataforma === 'linkedin') {
          payload =
            tipoDestino === 'pagina'
              ? `https://www.linkedin.com/company/${encodeURIComponent(handle)}/`
              : `https://www.linkedin.com/in/${encodeURIComponent(handle)}/`;
        } else {
          errors.push('Para enlace personalizado ingresa la URL completa.');
        }
      }
      break;
    }

    case 'video': {
      const plataforma = str(data.plataforma) || 'youtube';
      const urlVideo = str(data.urlVideo);
      const inicio = str(data.tiempoInicio);
      if (!urlVideo) {
        errors.push('Ingresa el enlace del video.');
      } else {
        const normalized = ensureHttps(urlVideo);
        try {
          const u = new URL(normalized);
          const secs = parseStartTimeSeconds(inicio);
          if (inicio && secs === null) {
            errors.push('El tiempo de inicio debe estar en segundos (ej. 90) o mm:ss (ej. 1:30).');
          } else if (secs !== null && secs > 0) {
            if (plataforma === 'youtube' || u.hostname.includes('youtu')) {
              u.searchParams.set('t', `${secs}`);
            } else if (plataforma === 'vimeo' || u.hostname.includes('vimeo')) {
              u.hash = `t=${secs}s`;
            } else if (plataforma === 'dailymotion') {
              u.searchParams.set('start', `${secs}`);
            } else {
              warnings.push('Esta plataforma no admite parámetro estándar de tiempo de inicio; se conservó el enlace original.');
            }
          }
          payload = u.toString();
        } catch {
          errors.push('El enlace del video no es una URL válida.');
        }
      }
      break;
    }

    case 'archivo': {
      const urlArchivo = str(data.url);
      if (!urlArchivo) {
        errors.push('Ingresa la URL existente del archivo.');
      } else {
        const normalized = ensureHttps(urlArchivo);
        if (!isValidUrlLike(normalized)) {
          errors.push('La URL del archivo no es válida.');
        }
        payload = normalized;
      }
      break;
    }

    case 'aplicacion': {
      const urlApp = str(data.url);
      const destino = str(data.destino) || 'google_play';
      if (!urlApp) {
        errors.push('Ingresa la URL o URI de la aplicación.');
      } else if (destino === 'deep_link') {
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlApp)) {
          errors.push('El enlace profundo debe incluir un esquema (ej. miapp://ruta).');
        }
        payload = urlApp;
      } else {
        const normalized = ensureHttps(urlApp);
        if (!isValidUrlLike(normalized)) {
          errors.push('La URL de la aplicación no es válida.');
        }
        payload = normalized;
      }
      break;
    }

    case 'email': {
      const destinatarios = str(data.destinatarios);
      const cc = str(data.cc);
      const cco = str(data.cco);
      const asunto = str(data.asunto);
      const mensaje = rawStr(data.mensaje).trim();

      if (!destinatarios) {
        errors.push('Ingresa al menos un correo destinatario.');
      } else {
        const toList = destinatarios
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter(Boolean);
        const invalid = toList.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
        if (invalid.length > 0) {
          errors.push(`Correo no válido: ${invalid.join(', ')}`);
        }
        const params: string[] = [];
        if (cc) {
          const ccList = cc.split(/[,;\s]+/).filter(Boolean).join(',');
          if (ccList) params.push(`cc=${encodeURIComponent(ccList)}`);
        }
        if (cco) {
          const ccoList = cco.split(/[,;\s]+/).filter(Boolean).join(',');
          if (ccoList) params.push(`bcc=${encodeURIComponent(ccoList)}`);
        }
        if (asunto) params.push(`subject=${encodeURIComponent(asunto)}`);
        if (mensaje) params.push(`body=${encodeURIComponent(mensaje)}`);
        payload = `mailto:${toList.join(',')}${params.length ? '?' + params.join('&') : ''}`;
      }
      break;
    }

    case 'contacto': {
      const nombre = str(data.nombre);
      const apellidos = str(data.apellidos);
      const empresa = str(data.empresa);
      const puesto = str(data.puesto);
      const cumpleanos = str(data.cumpleanos);
      const notas = rawStr(data.notas).trim();
      const telefonos = Array.isArray(data.telefonos)
        ? (data.telefonos as Array<{ tipo?: string; numero?: string }>)
        : [];
      const correos = Array.isArray(data.correos)
        ? (data.correos as Array<{ tipo?: string; correo?: string }>)
        : [];
      const sitiosWeb = Array.isArray(data.sitiosWeb) ? (data.sitiosWeb as string[]) : [];
      const direcciones = Array.isArray(data.direcciones)
        ? (data.direcciones as Array<Record<string, string>>)
        : [];

      if (!nombre && !apellidos && !empresa) {
        errors.push('Ingresa al menos nombre, apellidos o empresa para la vCard.');
      }

      const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0'];
      const fn = [nombre, apellidos].filter(Boolean).join(' ') || empresa;
      lines.push(`N:${escapeVCardValue(apellidos)};${escapeVCardValue(nombre)};;;`);
      lines.push(`FN:${escapeVCardValue(fn)}`);
      if (empresa) lines.push(`ORG:${escapeVCardValue(empresa)}`);
      if (puesto) lines.push(`TITLE:${escapeVCardValue(puesto)}`);

      for (const tel of telefonos) {
        const num = str(tel.numero);
        if (num) {
          const tipo = str(tel.tipo) || 'CELL';
          lines.push(`TEL;TYPE=${tipo}:${num}`);
        }
      }
      for (const mail of correos) {
        const c = str(mail.correo);
        if (c) {
          const tipo = str(mail.tipo) || 'INTERNET';
          lines.push(`EMAIL;TYPE=${tipo},INTERNET:${escapeVCardValue(c)}`);
        }
      }
      for (const site of sitiosWeb) {
        const s = str(site);
        if (s) {
          lines.push(`URL:${ensureHttps(s)}`);
        }
      }
      if (cumpleanos) {
        lines.push(`BDAY:${cumpleanos.replace(/-/g, '')}`);
      }
      for (const dir of direcciones) {
        const streetParts = [str(dir.calle), str(dir.colonia)].filter(Boolean).join(', ');
        const city = str(dir.ciudad);
        const state = str(dir.estado);
        const zip = str(dir.codigoPostal);
        const country = str(dir.pais);
        if (streetParts || city || state || zip || country) {
          const tipo = str(dir.tipo) || 'WORK';
          lines.push(
            `ADR;TYPE=${tipo}:;;${escapeVCardValue(streetParts)};${escapeVCardValue(city)};${escapeVCardValue(state)};${escapeVCardValue(zip)};${escapeVCardValue(country)}`
          );
        }
      }
      if (notas) {
        lines.push(`NOTE:${escapeVCardValue(notas)}`);
      }
      lines.push('END:VCARD');
      payload = lines.join('\r\n');
      break;
    }

    case 'telefono': {
      const codigo = str(data.codigoPais) || '+52';
      const numero = str(data.numero);
      if (!numero) {
        errors.push('Ingresa el número de teléfono.');
      } else {
        const full = cleanPhoneDigits(codigo, numero);
        if (full.replace(/\D/g, '').length < 6) {
          errors.push('El número telefónico parece demasiado corto.');
        }
        payload = `tel:${full}`;
      }
      break;
    }

    case 'sms': {
      const codigo = str(data.codigoPais) || '+52';
      const numero = str(data.numero);
      const mensaje = rawStr(data.mensaje).trim();
      if (!numero) {
        errors.push('Ingresa el número de teléfono para el SMS.');
      } else {
        const full = cleanPhoneDigits(codigo, numero);
        payload = mensaje
          ? `sms:${full}?body=${encodeURIComponent(mensaje)}`
          : `sms:${full}`;
      }
      break;
    }

    case 'ubicacion': {
      const lat = str(data.latitud);
      const lng = str(data.longitud);
      const nombre = str(data.nombre);
      const latN = parseFloat(lat);
      const lngN = parseFloat(lng);
      if (!lat || !lng || Number.isNaN(latN) || Number.isNaN(lngN)) {
        errors.push('Ingresa latitud y longitud numéricas válidas.');
      } else if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
        errors.push('Latitud debe estar entre -90 y 90; longitud entre -180 y 180.');
      } else {
        const q = nombre ? `${latN},${lngN} (${nombre})` : `${latN},${lngN}`;
        payload = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      }
      break;
    }

    case 'localizacion_personalizada': {
      const proveedor = str(data.proveedor) || 'google_maps';
      const modoEntrada = str(data.modoEntrada) || 'coordenadas';
      const nombre = str(data.nombre);
      const enlaceMapa = str(data.enlaceMapa);
      const lat = str(data.latitud);
      const lng = str(data.longitud);

      if (modoEntrada === 'enlace' || proveedor === 'personalizado') {
        if (!enlaceMapa) {
          errors.push('Ingresa el enlace del mapa.');
        } else {
          payload = ensureHttps(enlaceMapa);
        }
      } else {
        const latN = parseFloat(lat);
        const lngN = parseFloat(lng);
        if (!lat || !lng || Number.isNaN(latN) || Number.isNaN(lngN)) {
          errors.push('Ingresa latitud y longitud válidas.');
        } else if (proveedor === 'google_maps') {
          const q = nombre ? `${latN},${lngN} (${nombre})` : `${latN},${lngN}`;
          payload = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
        } else if (proveedor === 'apple_maps') {
          const label = nombre ? `&q=${encodeURIComponent(nombre)}` : '';
          payload = `https://maps.apple.com/?ll=${latN},${lngN}${label}`;
        } else if (proveedor === 'waze') {
          payload = `https://waze.com/ul?ll=${latN},${lngN}&navigate=yes`;
        }
      }
      break;
    }

    case 'direccion': {
      const modo = str(data.modoSalida) || 'maps';
      const lugar = str(data.lugar);
      const calle = str(data.calle);
      const numExt = str(data.numExterior);
      const numInt = str(data.numInterior);
      const colonia = str(data.colonia);
      const ciudad = str(data.ciudad);
      const estado = str(data.estado);
      const cp = str(data.codigoPostal);
      const pais = str(data.pais);
      const referencias = str(data.referencias);

      const streetLine = [calle, numExt ? `#${numExt}` : '', numInt ? `Int. ${numInt}` : '']
        .filter(Boolean)
        .join(' ');
      const parts = [lugar, streetLine, colonia, ciudad, estado, cp, pais].filter(Boolean);
      if (parts.length === 0) {
        errors.push('Ingresa al menos calle o ciudad para generar la dirección.');
      } else if (modo === 'texto') {
        const lines = [...parts];
        if (referencias) lines.push(`Referencias: ${referencias}`);
        payload = lines.join('\n');
      } else {
        const query = [streetLine, colonia, ciudad, estado, cp, pais].filter(Boolean).join(', ');
        payload = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || parts.join(', '))}`;
      }
      break;
    }

    case 'ruta_destino': {
      const destino = str(data.destino);
      const origen = str(data.origen);
      const transporte = str(data.transporte) || 'driving';
      if (!destino) {
        errors.push('Ingresa el destino (dirección o coordenadas).');
      } else {
        const url = new URL('https://www.google.com/maps/dir/');
        url.searchParams.set('api', '1');
        url.searchParams.set('destination', destino);
        if (origen) url.searchParams.set('origin', origen);
        url.searchParams.set('travelmode', transporte);
        payload = url.toString();
      }
      break;
    }

    case 'proximidad': {
      const busqueda = str(data.busqueda);
      const zona = str(data.zona);
      if (!busqueda) {
        errors.push('Indica qué negocio, servicio o categoría se busca.');
      } else {
        const query = zona ? `${busqueda} cerca de ${zona}` : busqueda;
        payload = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
      }
      break;
    }

    case 'street_view': {
      const lat = str(data.latitud);
      const lng = str(data.longitud);
      const panoId = str(data.panoId);
      const heading = str(data.orientacion);
      const pitch = str(data.inclinacion);
      const fov = str(data.fov);

      const latN = parseFloat(lat);
      const lngN = parseFloat(lng);
      if ((!lat || !lng || Number.isNaN(latN) || Number.isNaN(lngN)) && !panoId) {
        errors.push('Ingresa latitud y longitud válidas, o un ID de panorama.');
      } else {
        const url = new URL('https://www.google.com/maps/@');
        url.searchParams.set('api', '1');
        url.searchParams.set('map_action', 'pano');
        if (!Number.isNaN(latN) && !Number.isNaN(lngN)) {
          url.searchParams.set('viewpoint', `${latN},${lngN}`);
        }
        if (panoId) url.searchParams.set('pano', panoId);
        if (heading) url.searchParams.set('heading', heading);
        if (pitch) url.searchParams.set('pitch', pitch);
        if (fov) url.searchParams.set('fov', fov);
        payload = url.toString();
      }
      break;
    }

    case 'emergencia': {
      const nombre = str(data.nombre);
      const sangre = str(data.tipoSangre);
      const alergias = str(data.alergias);
      const condiciones = str(data.condiciones);
      const medicamentos = str(data.medicamentos);
      const notas = rawStr(data.notas).trim();
      const contactos = Array.isArray(data.contactos)
        ? (data.contactos as Array<{ nombre?: string; parentesco?: string; telefono?: string }>)
        : [];

      if (!nombre) {
        errors.push('Ingresa el nombre de la persona para la ficha de emergencia.');
      }
      const validContacts = contactos.filter((c) => str(c.nombre) || str(c.telefono));
      const lines: string[] = ['FICHA DE EMERGENCIA'];
      if (nombre) lines.push(`Nombre: ${nombre}`);
      if (sangre) lines.push(`Tipo de sangre: ${sangre}`);
      if (alergias) lines.push(`Alergias: ${alergias}`);
      if (condiciones) lines.push(`Condiciones: ${condiciones}`);
      if (medicamentos) lines.push(`Medicamentos: ${medicamentos}`);
      if (validContacts.length > 0) {
        lines.push('Contactos de emergencia:');
        for (const c of validContacts) {
          const rel = str(c.parentesco) ? ` (${str(c.parentesco)})` : '';
          lines.push(`- ${str(c.nombre)}${rel}: ${str(c.telefono)}`);
        }
      }
      if (notas) lines.push(`Notas: ${notas}`);
      payload = lines.join('\n');
      break;
    }

    case 'bluetooth': {
      const modo = str(data.modoSalida) || 'datos';
      const nombre = str(data.nombreDispositivo);
      const tipo = str(data.tipo) || 'BLE';
      const mac = str(data.macOId);
      const uuid = str(data.uuid);
      const instrucciones = rawStr(data.instrucciones).trim();
      const urlFab = str(data.urlFabricante);

      if (modo === 'url_fabricante') {
        if (!urlFab) {
          errors.push('Ingresa la URL del fabricante para este modo.');
        } else {
          payload = ensureHttps(urlFab);
        }
      } else {
        if (!nombre && !mac) {
          errors.push('Ingresa al menos el nombre del dispositivo o su MAC/identificador.');
        } else {
          const lines = [`BLUETOOTH (${tipo})`];
          if (nombre) lines.push(`Dispositivo: ${nombre}`);
          if (mac) lines.push(`ID/MAC: ${mac}`);
          if (uuid) lines.push(`UUID: ${uuid}`);
          if (instrucciones) lines.push(`Instrucciones: ${instrucciones}`);
          if (urlFab) lines.push(`Fabricante: ${ensureHttps(urlFab)}`);
          payload = lines.join('\n');
        }
      }
      break;
    }

    case 'wifi': {
      const ssid = rawStr(data.ssid);
      const seguridad = str(data.seguridad) || 'WPA';
      const password = rawStr(data.password);
      const oculta = Boolean(data.oculta);

      if (!ssid.trim()) {
        errors.push('Ingresa el nombre de la red (SSID).');
      }
      if (seguridad !== 'nopass' && !password) {
        errors.push('Ingresa la contraseña de la red Wi-Fi o selecciona seguridad abierta.');
      }
      const escSsid = escapeWifiField(ssid);
      const escPass = seguridad === 'nopass' ? '' : escapeWifiField(password);
      const hiddenPart = oculta ? 'H:true;' : '';
      payload = `WIFI:T:${seguridad};S:${escSsid};${seguridad === 'nopass' ? '' : `P:${escPass};`}${hiddenPart};`;
      break;
    }

    case 'impresion_3d': {
      const modo = str(data.modoSalida) || 'texto';
      const profile = {
        marca: str(data.marca),
        material: str(data.material),
        color: str(data.color),
        diametro: str(data.diametro),
        temperatura_boquilla: str(data.tempBoquilla),
        temperatura_cama: str(data.tempCama),
        velocidad: str(data.velocidad),
        ventilacion: str(data.ventilacion),
        flujo: str(data.flujo),
        retraccion: str(data.retraccion),
        lote: str(data.lote),
        impresora: str(data.impresora),
        ficha_tecnica: str(data.fichaTecnica),
        notas: rawStr(data.notas).trim(),
      };
      const nonEmpty = Object.entries(profile).filter(([, v]) => Boolean(v));
      if (nonEmpty.length === 0) {
        errors.push('Captura al menos marca, material o un parámetro de impresión.');
      } else if (modo === 'json') {
        const obj: Record<string, string> = {};
        for (const [k, v] of nonEmpty) obj[k] = v;
        payload = JSON.stringify(obj, null, 2);
      } else {
        const labels: Record<string, string> = {
          marca: 'Marca',
          material: 'Material',
          color: 'Color',
          diametro: 'Diámetro',
          temperatura_boquilla: 'Boquilla',
          temperatura_cama: 'Cama',
          velocidad: 'Velocidad',
          ventilacion: 'Ventilación',
          flujo: 'Flujo',
          retraccion: 'Retracción',
          lote: 'Lote',
          impresora: 'Impresora',
          ficha_tecnica: 'Ficha técnica',
          notas: 'Notas',
        };
        payload = nonEmpty.map(([k, v]) => `${labels[k] || k}: ${v}`).join('\n');
      }
      break;
    }

    case 'datos_personalizados': {
      const modo = str(data.modoSalida) || 'texto';
      const titulo = str(data.titulo);
      const campos = Array.isArray(data.campos)
        ? (data.campos as Array<{ clave?: string; tipo?: string; valor?: unknown }>)
        : [];
      const valid = campos.filter((c) => str(c.clave) !== '');
      if (valid.length === 0) {
        errors.push('Agrega al menos un campo con su nombre de clave.');
      } else if (modo === 'json') {
        const obj: Record<string, unknown> = {};
        if (titulo) obj._titulo = titulo;
        for (const c of valid) {
          const k = str(c.clave);
          const v = c.valor;
          if (c.tipo === 'numero') {
            const n = Number(v);
            obj[k] = Number.isNaN(n) ? str(v) : n;
          } else if (c.tipo === 'booleano') {
            obj[k] = v === true || v === 'true' || v === 'Sí' || v === 'si';
          } else if (c.tipo === 'url') {
            obj[k] = str(v) ? ensureHttps(str(v)) : '';
          } else {
            obj[k] = rawStr(v);
          }
        }
        payload = JSON.stringify(obj, null, 2);
      } else {
        const lines: string[] = [];
        if (titulo) lines.push(titulo);
        for (const c of valid) {
          const k = str(c.clave);
          let valText = '';
          if (c.tipo === 'booleano') {
            valText = c.valor === true || c.valor === 'true' || c.valor === 'Sí' ? 'Sí' : 'No';
          } else if (c.tipo === 'url' && str(c.valor)) {
            valText = ensureHttps(str(c.valor));
          } else {
            valText = rawStr(c.valor);
          }
          lines.push(`${k}: ${valText}`);
        }
        payload = lines.join('\n');
      }
      break;
    }

    case 'whatsapp': {
      const codigo = str(data.codigoPais) || '+52';
      const numero = str(data.numero);
      const mensaje = rawStr(data.mensaje).trim();
      if (!numero) {
        errors.push('Ingresa el número de WhatsApp.');
      } else {
        const digits = `${codigo}${numero}`.replace(/\D/g, '');
        if (digits.length < 7) {
          errors.push('El número de WhatsApp parece demasiado corto.');
        }
        payload = mensaje
          ? `https://wa.me/${digits}?text=${encodeURIComponent(mensaje)}`
          : `https://wa.me/${digits}`;
      }
      break;
    }

    case 'calendario': {
      const nombre = str(data.nombre);
      const diaCompleto = Boolean(data.diaCompleto);
      const inicio = str(data.inicio);
      const fin = str(data.fin);
      const tz = str(data.zonaHoraria);
      const ubicacion = str(data.ubicacion);
      const descripcion = rawStr(data.descripcion).trim();
      const enlace = str(data.enlace);

      if (!nombre) errors.push('Ingresa el nombre del evento.');
      if (!inicio) errors.push('Selecciona la fecha y hora de inicio.');

      if (nombre && inicio) {
        const dtStart = formatIcalDate(inicio, diaCompleto);
        const dtEnd = fin ? formatIcalDate(fin, diaCompleto) : dtStart;
        const lines = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Generador QR LAV//ES',
          'BEGIN:VEVENT',
          `SUMMARY:${escapeIcalText(nombre)}`,
        ];
        if (diaCompleto) {
          lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
          lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
        } else if (tz) {
          lines.push(`DTSTART;TZID=${tz}:${dtStart}`);
          lines.push(`DTEND;TZID=${tz}:${dtEnd}`);
        } else {
          lines.push(`DTSTART:${dtStart}`);
          lines.push(`DTEND:${dtEnd}`);
        }
        if (ubicacion) lines.push(`LOCATION:${escapeIcalText(ubicacion)}`);
        if (descripcion) lines.push(`DESCRIPTION:${escapeIcalText(descripcion)}`);
        if (enlace) lines.push(`URL:${ensureHttps(enlace)}`);
        lines.push('END:VEVENT', 'END:VCALENDAR');
        payload = lines.join('\r\n');
      }
      break;
    }

    case 'menu_catalogo': {
      const urlMenu = str(data.url);
      if (!urlMenu) {
        errors.push('Ingresa la URL existente del menú, catálogo o PDF.');
      } else {
        const normalized = ensureHttps(urlMenu);
        if (!isValidUrlLike(normalized)) {
          errors.push('La URL del menú o catálogo no es válida.');
        }
        payload = normalized;
      }
      break;
    }

    case 'resenas_google': {
      const urlResena = str(data.urlResena);
      if (!urlResena) {
        errors.push('Ingresa el enlace directo para dejar una reseña en Google.');
      } else {
        const normalized = ensureHttps(urlResena);
        if (!isValidUrlLike(normalized)) {
          errors.push('El enlace de reseñas ingresado no es válido.');
        }
        payload = normalized;
      }
      break;
    }
  }

  const byteLength = new TextEncoder().encode(payload).length;
  const maxBytesForEC = QR_MAX_BYTES_BY_EC[ecLevel];
  const exceedsCapacity = byteLength > maxBytesForEC;

  let capacityAdvice: string | null = null;
  if (exceedsCapacity) {
    const excess = byteLength - maxBytesForEC;
    if (ecLevel === 'H' && byteLength <= QR_MAX_BYTES_BY_EC.M) {
      capacityAdvice = `El contenido ocupa ${byteLength} bytes y supera el límite de corrección Alta (${maxBytesForEC} bytes). Reduce ${excess} bytes o cambia la corrección de errores a Media (M) o Baja (L).`;
    } else {
      capacityAdvice = `El contenido ocupa ${byteLength} bytes y supera la capacidad máxima del código QR en nivel ${ecLevel} (${maxBytesForEC} bytes). Acorta notas, descripciones o campos secundarios en al menos ${excess} bytes; tus datos permanecen intactos en el editor.`;
    }
  }

  return {
    payload,
    errors,
    warnings,
    byteLength,
    maxBytesForEC,
    exceedsCapacity,
    capacityAdvice,
  };
}
