import type { QrTypeId } from '../types/qr';

export type QrCategory =
  | 'Básicos y enlaces'
  | 'Comercio y contenido'
  | 'Comunicación'
  | 'Ubicación y mapas'
  | 'Técnicos y datos';

export interface QrTypeDefinition {
  id: QrTypeId;
  number: number;
  name: string;
  category: QrCategory;
  shortDesc: string;
  scanBehavior: string;
  defaultData: Record<string, unknown>;
}

export const QR_TYPES: QrTypeDefinition[] = [
  {
    id: 'texto',
    number: 1,
    name: 'Texto',
    category: 'Básicos y enlaces',
    shortDesc: 'Texto libre con acentos, ñ, emojis y saltos de línea.',
    scanBehavior: 'Muestra el texto con el título en la primera línea, si se indicó.',
    defaultData: {
      titulo: '',
      texto: '',
    },
  },
  {
    id: 'url',
    number: 2,
    name: 'URL / URI',
    category: 'Básicos y enlaces',
    shortDesc: 'Dirección web estándar con protocolo automático https://.',
    scanBehavior: 'Abre la URL proporcionada en el navegador.',
    defaultData: {
      url: '',
      nombreInterno: '',
    },
  },
  {
    id: 'uri_personalizada',
    number: 3,
    name: 'URL / URI personalizada',
    category: 'Básicos y enlaces',
    shortDesc: 'URI completa o constructor por esquema, ruta, parámetros y fragmento.',
    scanBehavior: 'Entrega la URI configurada. Los esquemas de apps dependen del dispositivo.',
    defaultData: {
      modo: 'constructor', // 'completa' | 'constructor'
      uriCompleta: '',
      esquema: 'https',
      dominioRuta: '',
      parametros: [{ clave: '', valor: '' }],
      fragmento: '',
    },
  },
  {
    id: 'unit_link',
    number: 4,
    name: 'Unit.Link',
    category: 'Básicos y enlaces',
    shortDesc: 'Enlace existente de Unit.Link o agregador de enlaces.',
    scanBehavior: 'Abre el enlace de agregador proporcionado.',
    defaultData: {
      url: '',
      etiquetaInterna: '',
    },
  },
  {
    id: 'busqueda',
    number: 5,
    name: 'Búsqueda',
    category: 'Básicos y enlaces',
    shortDesc: 'Consulta en Google, Bing, DuckDuckGo o YouTube con filtro opcional.',
    scanBehavior: 'Abre la búsqueda en el servicio elegido.',
    defaultData: {
      buscador: 'google', // 'google' | 'bing' | 'duckduckgo' | 'youtube'
      palabrasClave: '',
      filtroSitio: '',
    },
  },
  {
    id: 'pago',
    number: 6,
    name: 'Enlace de pago',
    category: 'Comercio y contenido',
    shortDesc: 'URL de cobro existente con parámetros admitidos por el proveedor.',
    scanBehavior: 'Abre la página de cobro configurada por el proveedor.',
    defaultData: {
      proveedor: 'paypal', // 'paypal' | 'mercadopago' | 'stripe' | 'otro'
      urlCobro: '',
      concepto: '',
      referencia: '',
      importe: '',
      moneda: 'MXN',
    },
  },
  {
    id: 'redes_sociales',
    number: 7,
    name: 'Redes sociales',
    category: 'Comercio y contenido',
    shortDesc: 'Perfil, página o publicación en las principales redes sociales.',
    scanBehavior: 'Abre el destino social elegido.',
    defaultData: {
      plataforma: 'instagram', // 'facebook' | 'instagram' | 'tiktok' | 'x' | 'youtube' | 'linkedin' | 'personalizado'
      tipoDestino: 'perfil', // 'perfil' | 'pagina' | 'publicacion'
      usuarioOUrl: '',
    },
  },
  {
    id: 'video',
    number: 8,
    name: 'Video',
    category: 'Comercio y contenido',
    shortDesc: 'Enlace a video con tiempo de inicio opcional cuando aplica.',
    scanBehavior: 'Abre el video en la plataforma indicada.',
    defaultData: {
      plataforma: 'youtube', // 'youtube' | 'vimeo' | 'tiktok' | 'dailymotion' | 'otro'
      urlVideo: '',
      tiempoInicio: '',
    },
  },
  {
    id: 'archivo',
    number: 9,
    name: 'Archivo',
    category: 'Comercio y contenido',
    shortDesc: 'Enlace existente a PDF, imagen, documento, audio u otro.',
    scanBehavior: 'Abre o descarga el recurso según el destino y sus permisos.',
    defaultData: {
      url: '',
      nombre: '',
      tipoArchivo: 'pdf', // 'pdf' | 'imagen' | 'documento' | 'audio' | 'otro'
    },
  },
  {
    id: 'aplicacion',
    number: 10,
    name: 'Aplicación',
    category: 'Comercio y contenido',
    shortDesc: 'Destino en Google Play, App Store, web o enlace profundo.',
    scanBehavior: 'Abre el destino compatible en el dispositivo.',
    defaultData: {
      destino: 'google_play', // 'google_play' | 'app_store' | 'web' | 'deep_link'
      url: '',
    },
  },
  {
    id: 'email',
    number: 11,
    name: 'E-mail',
    category: 'Comunicación',
    shortDesc: 'Borrador mailto: con múltiples destinatarios, CC, CCO, asunto y mensaje.',
    scanBehavior: 'Abre un borrador de correo mediante mailto:.',
    defaultData: {
      destinatarios: '',
      cc: '',
      cco: '',
      asunto: '',
      mensaje: '',
    },
  },
  {
    id: 'contacto',
    number: 12,
    name: 'Contacto',
    category: 'Comunicación',
    shortDesc: 'Tarjeta vCard 3.0 con teléfonos, correos, sitios y direcciones repetibles.',
    scanBehavior: 'Ofrece guardar el contacto en formato vCard 3.0.',
    defaultData: {
      nombre: '',
      apellidos: '',
      empresa: '',
      puesto: '',
      telefonos: [{ tipo: 'CELL', numero: '' }],
      correos: [{ tipo: 'WORK', correo: '' }],
      sitiosWeb: [''],
      cumpleanos: '',
      notas: '',
      direcciones: [
        {
          tipo: 'WORK',
          calle: '',
          colonia: '',
          ciudad: '',
          estado: '',
          codigoPostal: '',
          pais: '',
        },
      ],
    },
  },
  {
    id: 'telefono',
    number: 13,
    name: 'Número de teléfono',
    category: 'Comunicación',
    shortDesc: 'Llamada directa mediante tel: con código internacional.',
    scanBehavior: 'Abre el marcador telefónico mediante tel:.',
    defaultData: {
      pais: 'México',
      codigoPais: '+52',
      numero: '',
      etiquetaInterna: '',
    },
  },
  {
    id: 'sms',
    number: 14,
    name: 'SMS',
    category: 'Comunicación',
    shortDesc: 'Mensaje de texto corto prellenado para lectores compatibles.',
    scanBehavior: 'Abre un borrador de SMS en lectores compatibles.',
    defaultData: {
      pais: 'México',
      codigoPais: '+52',
      numero: '',
      mensaje: '',
    },
  },
  {
    id: 'ubicacion',
    number: 15,
    name: 'Ubicación',
    category: 'Ubicación y mapas',
    shortDesc: 'Coordenadas geográficas precisas para abrir en Google Maps.',
    scanBehavior: 'Abre el punto exacto en Google Maps.',
    defaultData: {
      latitud: '',
      longitud: '',
      nombre: '',
    },
  },
  {
    id: 'localizacion_personalizada',
    number: 16,
    name: 'Localización personalizada',
    category: 'Ubicación y mapas',
    shortDesc: 'Google Maps, Apple Maps, Waze o enlace de mapa personalizado.',
    scanBehavior: 'Abre el punto en el proveedor de mapas seleccionado.',
    defaultData: {
      nombre: '',
      proveedor: 'google_maps', // 'google_maps' | 'apple_maps' | 'waze' | 'personalizado'
      modoEntrada: 'coordenadas', // 'coordenadas' | 'enlace'
      latitud: '',
      longitud: '',
      enlaceMapa: '',
      referencia: '',
    },
  },
  {
    id: 'direccion',
    number: 17,
    name: 'Dirección',
    category: 'Ubicación y mapas',
    shortDesc: 'Domicilio completo en modo texto legible o enlace a Google Maps.',
    scanBehavior: 'Muestra la dirección en texto o la abre en Google Maps según el modo.',
    defaultData: {
      modoSalida: 'maps', // 'maps' | 'texto'
      lugar: '',
      calle: '',
      numExterior: '',
      numInterior: '',
      colonia: '',
      ciudad: '',
      estado: '',
      codigoPostal: '',
      pais: 'México',
      referencias: '',
    },
  },
  {
    id: 'ruta_destino',
    number: 18,
    name: 'Dirección de destino',
    category: 'Ubicación y mapas',
    shortDesc: 'Ruta en Google Maps con origen opcional y medio de transporte.',
    scanBehavior: 'Abre una ruta guiada en Google Maps.',
    defaultData: {
      destino: '',
      origen: '',
      transporte: 'driving', // 'driving' | 'walking' | 'bicycling' | 'transit'
    },
  },
  {
    id: 'proximidad',
    number: 19,
    name: 'Búsqueda por proximidad',
    category: 'Ubicación y mapas',
    shortDesc: 'Busca negocios, servicios o categorías cerca de una zona.',
    scanBehavior: 'Abre la búsqueda de lugares para la zona indicada.',
    defaultData: {
      busqueda: '',
      zona: '',
    },
  },
  {
    id: 'street_view',
    number: 20,
    name: 'Street View',
    category: 'Ubicación y mapas',
    shortDesc: 'Vista panorámica de calle con orientación, inclinación y FOV.',
    scanBehavior: 'Abre Street View en el punto indicado si existe cobertura.',
    defaultData: {
      latitud: '',
      longitud: '',
      panoId: '',
      orientacion: '0',
      inclinacion: '0',
      fov: '90',
    },
  },
  {
    id: 'emergencia',
    number: 21,
    name: 'Emergencia',
    category: 'Técnicos y datos',
    shortDesc: 'Ficha médica y contactos de emergencia legible sin conexión.',
    scanBehavior: 'Muestra una ficha de texto legible sin internet.',
    defaultData: {
      nombre: '',
      tipoSangre: '',
      alergias: '',
      condiciones: '',
      medicamentos: '',
      contactos: [{ nombre: '', parentesco: '', telefono: '' }],
      notas: '',
    },
  },
  {
    id: 'bluetooth',
    number: 22,
    name: 'Bluetooth',
    category: 'Técnicos y datos',
    shortDesc: 'Datos de emparejamiento Bluetooth clásico / BLE o URL del fabricante.',
    scanBehavior: 'Muestra los datos de conexión o abre la URL del fabricante.',
    defaultData: {
      modoSalida: 'datos', // 'datos' | 'url_fabricante'
      nombreDispositivo: '',
      tipo: 'BLE', // 'Clásico' | 'BLE'
      macOId: '',
      uuid: '',
      instrucciones: '',
      urlFabricante: '',
    },
  },
  {
    id: 'wifi',
    number: 23,
    name: 'Wi-Fi',
    category: 'Técnicos y datos',
    shortDesc: 'Conexión rápida a red inalámbrica en formato estándar WIFI:.',
    scanBehavior: 'Ofrece conectarse a la red Wi-Fi en dispositivos compatibles.',
    defaultData: {
      ssid: '',
      seguridad: 'WPA', // 'WPA' | 'WEP' | 'nopass'
      password: '',
      oculta: false,
    },
  },
  {
    id: 'impresion_3d',
    number: 24,
    name: 'Impresión 3D',
    category: 'Técnicos y datos',
    shortDesc: 'Perfil técnico de filamento y parámetros en texto o JSON.',
    scanBehavior: 'Muestra el perfil de filamento como texto o JSON según el modo.',
    defaultData: {
      modoSalida: 'texto', // 'texto' | 'json'
      marca: '',
      material: 'PLA',
      color: '',
      diametro: '1.75 mm',
      tempBoquilla: '205 °C',
      tempCama: '60 °C',
      velocidad: '60 mm/s',
      ventilacion: '100%',
      flujo: '100%',
      retraccion: '0.8 mm / 45 mm/s',
      lote: '',
      impresora: '',
      fichaTecnica: '',
      notas: '',
    },
  },
  {
    id: 'datos_personalizados',
    number: 25,
    name: 'Datos personalizados',
    category: 'Técnicos y datos',
    shortDesc: 'Pares clave/valor reordenables exportados como texto legible o JSON.',
    scanBehavior: 'Muestra texto legible o JSON válido según el modo elegido.',
    defaultData: {
      modoSalida: 'texto', // 'texto' | 'json'
      titulo: '',
      campos: [{ clave: '', tipo: 'texto', valor: '' }],
    },
  },
  {
    id: 'whatsapp',
    number: 26,
    name: 'WhatsApp',
    category: 'Comunicación',
    shortDesc: 'Enlace directo wa.me con número internacional y mensaje opcional.',
    scanBehavior: 'Abre el chat de WhatsApp mediante wa.me.',
    defaultData: {
      pais: 'México',
      codigoPais: '+52',
      numero: '',
      mensaje: '',
    },
  },
  {
    id: 'calendario',
    number: 27,
    name: 'Evento de calendario',
    category: 'Técnicos y datos',
    shortDesc: 'Evento iCalendar (.ics) con fechas, zona horaria, lugar y descripción.',
    scanBehavior: 'Entrega un evento iCalendar para agregar al calendario.',
    defaultData: {
      nombre: '',
      diaCompleto: false,
      inicio: '',
      fin: '',
      zonaHoraria: 'America/Mexico_City',
      ubicacion: '',
      descripcion: '',
      enlace: '',
    },
  },
  {
    id: 'menu_catalogo',
    number: 28,
    name: 'Menú o catálogo',
    category: 'Comercio y contenido',
    shortDesc: 'Acceso directo a carta digital, catálogo web o PDF existente.',
    scanBehavior: 'Abre el menú o catálogo indicado.',
    defaultData: {
      negocio: '',
      url: '',
    },
  },
  {
    id: 'resenas_google',
    number: 29,
    name: 'Reseñas de Google',
    category: 'Comercio y contenido',
    shortDesc: 'Enlace directo para que tus clientes dejen una reseña en Google.',
    scanBehavior: 'Abre el enlace directo de reseñas ingresado.',
    defaultData: {
      negocio: '',
      urlResena: '',
    },
  },
];

export const QR_TYPES_MAP: Record<QrTypeId, QrTypeDefinition> = QR_TYPES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<QrTypeId, QrTypeDefinition>
);

export const COUNTRY_DIAL_CODES = [
  { country: 'México', code: '+52' },
  { country: 'Estados Unidos / Canadá', code: '+1' },
  { country: 'España', code: '+34' },
  { country: 'Colombia', code: '+57' },
  { country: 'Argentina', code: '+54' },
  { country: 'Chile', code: '+56' },
  { country: 'Perú', code: '+51' },
  { country: 'Guatemala', code: '+502' },
  { country: 'Costa Rica', code: '+506' },
  { country: 'Panamá', code: '+507' },
  { country: 'Ecuador', code: '+593' },
  { country: 'Brasil', code: '+55' },
  { country: 'Reino Unido', code: '+44' },
  { country: 'Alemania', code: '+49' },
  { country: 'Francia', code: '+33' },
];
