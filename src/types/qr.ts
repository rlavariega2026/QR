export type QrTypeId =
  | 'texto'
  | 'url'
  | 'uri_personalizada'
  | 'unit_link'
  | 'busqueda'
  | 'pago'
  | 'redes_sociales'
  | 'video'
  | 'archivo'
  | 'aplicacion'
  | 'email'
  | 'contacto'
  | 'telefono'
  | 'sms'
  | 'ubicacion'
  | 'localizacion_personalizada'
  | 'direccion'
  | 'ruta_destino'
  | 'proximidad'
  | 'street_view'
  | 'emergencia'
  | 'bluetooth'
  | 'wifi'
  | 'impresion_3d'
  | 'datos_personalizados'
  | 'whatsapp'
  | 'calendario'
  | 'menu_catalogo'
  | 'resenas_google';

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export type ModuleShape = 'square' | 'dots' | 'circle' | 'rounded';
export type EyeShape = 'square' | 'rounded' | 'circle' | 'dots';
export type ColorFillMode = 'solid' | 'linear' | 'radial';

export interface GradientStop {
  offset: number; // 0 to 100
  color: string;
}

export interface ColorSpec {
  mode: ColorFillMode;
  color: string;
  angle: number; // 0 to 360 for linear
  stops: GradientStop[];
}

export type FrameStyle =
  | 'none'
  | 'square'
  | 'rounded'
  | 'circle_decorative'
  | 'tag'
  | 'plate'
  | 'ribbon';

export interface QrFrameConfig {
  style: FrameStyle;
  color: ColorSpec;
  textColor: string;
  text: string;
  fontFamily: 'Plus Jakarta Sans' | 'DM Sans' | 'JetBrains Mono' | 'Georgia';
  thickness: number; // px relative to 1000 canvas
  cornerRadius: number; // px
  padding: number; // extra inner padding beyond 4-module quiet zone
  shadowIntensity: number; // 0 to 100
}

export type TextureMode = 'flat' | 'matte' | 'metallic' | 'relief';

export interface QrTextureConfig {
  mode: TextureMode;
  intensity: number; // 0 to 100
  shadow: number; // 0 to 100
  gloss: number; // 0 to 100
}

export type LogoPosition =
  | 'center'
  | 'modules'
  | 'frame_top'
  | 'frame_bottom'
  | 'frame_left'
  | 'frame_right';

export interface QrLogoConfig {
  fileId: string | null;
  previewUrl: string | null;
  fileName: string | null;
  position: LogoPosition;
  scale: number; // 10 to 35 (% of QR size when centered, or frame slot size)
  offsetX: number; // -15 to 15 (% nudge)
  offsetY: number; // -15 to 15 (% nudge)
  rotation: number; // -180 to 180 deg
  cornerRadius: number; // 0 to 50 (%)
  hasBase: boolean;
  baseColor: string;
  basePadding: number; // px relative
}

export interface QrDesignConfig {
  errorCorrection: ErrorCorrectionLevel;
  moduleShape: ModuleShape;
  eyeOuterShape: EyeShape;
  eyeInnerShape: EyeShape;
  moduleColor: ColorSpec;
  eyeOuterColor: ColorSpec;
  eyeInnerColor: ColorSpec;
  backgroundColor: ColorSpec;
  frame: QrFrameConfig;
  texture: QrTextureConfig;
  logo: QrLogoConfig;
}

export type ExportQuality = 'medium' | 'high'; // 1024px | 4096px
export type ExportBackgroundMode = 'solid' | 'transparent';

export interface QrExportConfig {
  fileName: string;
  quality: ExportQuality;
  backgroundMode: ExportBackgroundMode;
  transparentBasePlate: boolean;
  transparentBaseColor: string;
}

export type PreviewTestBg = 'white' | 'black' | 'gray' | 'checkerboard';

export interface QrProject {
  id: string;
  ownerId: string;
  ownerUsername?: string;
  name: string;
  qrType: QrTypeId;
  data: Record<string, unknown>;
  design: QrDesignConfig;
  exportConfig: QrExportConfig;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QrTemplate {
  id: string;
  ownerId: string;
  ownerUsername?: string;
  name: string;
  isBuiltIn?: boolean;
  includeContent: boolean;
  qrType: QrTypeId | null;
  data: Record<string, unknown> | null;
  design: QrDesignConfig;
  exportConfig: QrExportConfig;
  createdAt: string;
  updatedAt: string;
}

export interface StoredFileMeta {
  id: string;
  ownerId: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  hasAlpha: boolean;
  sha256: string;
  createdAt: string;
}

export type UserRole = 'superadmin' | 'user';
export type UserStatus = 'active' | 'suspended';

export interface UserAccount {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  isPrimarySuperadmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface VerifyCheckDetail {
  label: string;
  passed: boolean;
  decodedText: string | null;
  matchesExpected: boolean;
}

export interface VerifyResult {
  overallPassed: boolean;
  expectedPayload: string;
  dimensions: { width: number; height: number };
  checks: VerifyCheckDetail[];
  diagnostics: string[];
}
