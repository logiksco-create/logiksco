/**
 * Tipos de dominio de LOGIKS.CO.
 *
 * Son independientes de la base de datos y del framework: la capa de datos
 * (Supabase o demo) los produce y la UI los consume. Toda entidad de negocio
 * pertenece a una empresa (tenant) vía `empresaId`.
 */

export type Moneda = "COP" | "USD";

export type Rol =
  | "admin"
  | "comercial"
  | "operaciones"
  | "cumplimiento"
  | "contabilidad";

export interface Empresa {
  id: string;
  nit: string;
  razonSocial: string;
  ciudad: string;
  colorPrimario: string;
  prefijoCotizacion: string;
  prefijoDO: string;
  vigencia170Meses: number;
  bloquearDOSin170: boolean;
  /** Hitos propios por tipo de operación (RF-26); si falta, los de LOGIKS. */
  hitosPorTipo?: Partial<Record<TipoServicio, string[]>>;
  /** Términos y condiciones por defecto de las cotizaciones. */
  terminos?: string;
  /** Servicios que presta (bienvenida). Vacío = todos. */
  servicios?: TipoServicio[];
  /** Completó el asistente de bienvenida. */
  configurada?: boolean;
  /** URL pública del logo (PNG o JPG). */
  logoUrl?: string;
}

export const TIPOS_CATALOGO = {
  puerto: "Puertos",
  aeropuerto: "Aeropuertos",
  ciudad: "Ciudades",
  contenedor: "Contenedores",
  concepto: "Conceptos",
  producto_finppi: "Productos Finppi",
} as const;
export type TipoCatalogo = keyof typeof TIPOS_CATALOGO;

export interface EntradaCatalogo {
  id: string;
  tipo: TipoCatalogo;
  nombre: string;
  codigo?: string;
  /** Base de LOGIKS (no editable) o propia de la empresa. */
  base: boolean;
  datos: { pais?: string; bloque?: Bloque; moneda?: Moneda; unidad?: Unidad; paraTerceros?: boolean; iva?: IvaFinppi };
}

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  roles: Rol[];
  activo?: boolean;
}

export const NOMBRES_ROL: Record<Rol, string> = {
  admin: "Administrador",
  comercial: "Comercial",
  operaciones: "Operaciones",
  cumplimiento: "Cumplimiento",
  contabilidad: "Contabilidad",
};

export type TipoTercero = "cliente" | "prospecto" | "proveedor";

export interface Contacto {
  id: string;
  nombre: string;
  cargo: string;
  correo: string;
  telefono?: string;
  cumpleanos?: string; // yyyy-mm-dd
}

export interface AcuerdoComercial {
  diaCorte: number;
  plazoPagoDias: number;
  moneda: Moneda;
  condiciones?: string;
}

/** Datos que Finppi/DIAN exigen del cliente (PRD Finppi §9A.2, §9C.2). */
export interface DatosFiscales {
  tipoPersona: "Natural" | "Juridica";
  tipoDocumento: string; // texto exacto de Finppi
  numeroDocumento: string; // sin dígito de verificación ni puntos
  nombres: string; // en jurídica: razón social
  apellidos: string;
  email: string; // uno o varios separados por coma
  celular: string;
  regimen: string;
  responsabilidadFiscal: string;
  pais: string;
  ciudad: string; // "MUNICIPIO / Departamento", ej. "LA CEJA / Antioquia"
  direccion: string;
  telefono: string;
}

export interface Tercero {
  id: string;
  empresaId: string;
  tipo: TipoTercero;
  fiscal?: Partial<DatosFiscales>;
  nit: string;
  razonSocial: string;
  ciudad: string;
  contactos: Contacto[];
  acuerdo?: AcuerdoComercial;
}

export const TIPOS_SERVICIO = {
  aereo: "Aéreo",
  maritimo_fcl: "Marítimo FCL",
  maritimo_lcl: "Marítimo LCL / carga suelta",
  terrestre: "Terrestre",
  aduana: "Aduana",
  seguro: "Seguro",
  multimodal: "Multimodal",
} as const;
export type TipoServicio = keyof typeof TIPOS_SERVICIO;

export const INCOTERMS = [
  "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP",
] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export const BLOQUES = {
  origen: "Gastos en origen",
  flete: "Flete internacional",
  destino: "Gastos en destino",
  terrestre: "Transporte terrestre",
  aduana: "Aduana",
  seguro: "Seguro",
  otros: "Otros",
} as const;
export type Bloque = keyof typeof BLOQUES;

export const UNIDADES = {
  contenedor: "Por contenedor",
  kg: "Por kg",
  m3: "Por m³",
  embarque: "Por embarque",
} as const;
export type Unidad = keyof typeof UNIDADES;

export interface Concepto {
  id: string;
  bloque: Bloque;
  descripcion: string;
  proveedorId?: string;
  proveedorNombre?: string;
  moneda: Moneda;
  unidad: Unidad;
  cantidad: number;
  costoUnitario: number;
  ventaUnitaria: number;
  /** Fecha ISO (yyyy-mm-dd) hasta la que el proveedor garantiza la tarifa. */
  vigenciaTarifa?: string;
  /** Ingreso recibido para terceros (gasto pagado por cuenta del cliente). */
  paraTerceros?: boolean;
  /** Código del producto o servicio en Finppi (aparece como «CÓDIGO - Nombre»). */
  productoFinppi?: string;
  /** IVA exacto de Finppi: Ninguno, IVA-0, IVA-5, IVA-19. */
  ivaFinppi?: IvaFinppi;
}

export type IvaFinppi = "Ninguno" | "IVA-0" | "IVA-5" | "IVA-19";

/** Condiciones de la futura factura electrónica, desde la cotización. */
export interface DatosFacturacion {
  monedaFactura: Moneda; // en lo que el operador factura (USD o COP)
  tipoPago: "Contado" | "Crédito";
  plazoDias: number;
  metodoPago: string; // texto exacto de Finppi
  tipoOperacion: string; // Estándar, Mandatos…
}

export interface Mercancia {
  descripcion: string;
  piezas: number;
  pesoKg: number;
  volumenM3: number;
  contenedores?: { tipo: string; cantidad: number }[];
}

export const ESTADOS_COTIZACION = {
  borrador: "Borrador",
  enviada: "Enviada",
  vista: "Vista",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
} as const;
export type EstadoCotizacion = keyof typeof ESTADOS_COTIZACION;

export interface EventoHistorial {
  fecha: string; // ISO datetime
  usuario: string;
  accion: string;
}

export interface Cotizacion {
  id: string;
  empresaId: string;
  consecutivo: string;
  version: number;
  clienteId: string;
  contactoId?: string;
  comercialId: string;
  tipoServicio: TipoServicio;
  incoterm: Incoterm;
  origen: string;
  destino: string;
  mercancia: Mercancia;
  conceptos: Concepto[];
  /** TRM COP por USD usada para consolidar. */
  trm: number;
  monedaPresentacion: Moneda;
  fechaEmision: string; // yyyy-mm-dd
  vigenteHasta: string; // yyyy-mm-dd
  estado: EstadoCotizacion;
  terminos: string;
  /** Si es un duplicado, id de la cotización de origen (RF-10). */
  origenId?: string;
  /** Condiciones de facturación electrónica (Finppi). */
  facturacion?: DatosFacturacion;
  tokenPublico: string;
  historial: EventoHistorial[];
}

export const ESTADOS_170 = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
} as const;
export type Estado170 = keyof typeof ESTADOS_170;

export interface Formulario170 {
  id: string;
  empresaId: string;
  terceroId: string;
  version: number;
  estado: Estado170;
  diligenciadoEl?: string; // ISO
  aprobadoEl?: string; // yyyy-mm-dd
  vigenteHasta?: string; // yyyy-mm-dd
  revisor?: string;
  observaciones?: string;
  datos: Datos170;
}

/** Campos mínimos del numeral 5.2.1 de la Circular 170 de la DIAN. */
export interface Datos170 {
  razonSocial: string;
  nit: string;
  domicilio: string;
  ciudad: string;
  actividadEconomica: string;
  capitalSocial: number;
  origenRecursos: string;
  formaPago: string;
  entidadFinanciera: string;
  representantes: { nombre: string; documento: string; cargo: string }[];
  beneficiarios: string;
  esPEP: boolean;
  autorizaDatos: boolean;
}

export type TipoOperacion = TipoServicio;

export const ESTADOS_DO = {
  abierto: "Abierto",
  en_transito: "En tránsito",
  en_destino: "En destino",
  entregado: "Entregado",
  cerrado: "Cerrado",
} as const;
export type EstadoDO = keyof typeof ESTADOS_DO;

export interface Hito {
  id: string;
  nombre: string;
  estimada?: string; // yyyy-mm-dd
  real?: string; // yyyy-mm-dd
  nota?: string;
}

export interface Operacion {
  id: string;
  empresaId: string;
  consecutivo: string;
  cotizacionId: string;
  clienteId: string;
  responsableId: string;
  tipo: TipoOperacion;
  origen: string;
  destino: string;
  estado: EstadoDO;
  abiertoEl: string; // yyyy-mm-dd
  hitos: Hito[];
  conceptos: Concepto[];
  trm: number;
  costosReales?: Record<string, number>;
  /** Parte local del buzón de correo del DO (RF-39). */
  buzon?: string;
}

export type TipoAlerta =
  | "tarifa_vencida"
  | "cotizacion_por_vencer"
  | "hito_atrasado"
  | "eta_proxima"
  | "f170_por_vencer"
  | "corte_facturacion"
  | "factura_rechazada";

export type Severidad = "alta" | "media" | "baja";

export interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  href: string;
  fecha: string; // yyyy-mm-dd
}

export interface Comunicacion {
  id: string;
  empresaId: string;
  entidad: "cotizacion" | "operacion" | "tercero";
  entidadId: string;
  direccion: "saliente" | "entrante";
  asunto: string;
  para: string[];
  resumen: string;
  fecha: string; // ISO
  abiertoEl?: string; // ISO
  entregadoEl?: string; // ISO
  /** Id del mensaje en el proveedor de correo; ausente si no salió. */
  idProveedor?: string;
}

export const TIPOS_DOCUMENTO_DO = {
  bl: "BL",
  awb: "AWB",
  factura_comercial: "Factura comercial",
  lista_empaque: "Lista de empaque",
  declaracion: "Declaración",
  certificado: "Certificado",
  otro: "Otro",
} as const;
export type TipoDocumentoDO = keyof typeof TIPOS_DOCUMENTO_DO;

export const TIPOS_SOPORTE_170 = {
  rut: "RUT",
  camara_comercio: "Certificado de existencia y representación",
  cedula_rl: "Cédula del representante legal",
  cert_bancaria: "Certificación bancaria",
  estados_financieros: "Estados financieros",
  otro: "Otro soporte",
} as const;
export type TipoSoporte170 = keyof typeof TIPOS_SOPORTE_170;

export interface Archivo {
  id: string;
  tipo: string;
  nombre: string;
  mime: string;
  tamano: number;
  creadoEl: string; // ISO
}

export const ESTADOS_FACTURA = {
  borrador: "Prefactura",
  aprobada: "Aprobada",
  en_cola: "En cola de emisión",
  enviando: "Emitiendo en Finppi",
  fallida: "No se emitió",
  estado_desconocido: "En verificación",
  revision: "Requiere revisión",
  emitida: "Emitida",
  rechazada: "Rechazada",
} as const;
export type EstadoFactura = keyof typeof ESTADOS_FACTURA;

export interface LineaFactura {
  operacionId: string;
  descripcion: string;
  /** Ingreso propio o recibido para terceros (gasto pagado por cuenta del cliente). */
  tipo: "propio" | "terceros";
  cantidad: number;
  valorUnitario: number;
  /** Porcentaje de IVA de la línea (lo valida el contador). */
  ivaPct: number;
  /** Producto en Finppi e IVA exacto para la factura electrónica. */
  productoFinppi?: string;
  ivaFinppi?: IvaFinppi;
  /** Unidad del concepto en el DO (se imprime en la factura). */
  unidad?: Unidad;
}

export interface Factura {
  id: string;
  empresaId: string;
  clienteId: string;
  estado: EstadoFactura;
  moneda: Moneda;
  trm: number;
  lineas: LineaFactura[];
  operaciones: string[];
  creadoEl: string; // ISO
  megafocoId?: string;
  numero?: string;
  cufe?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  error?: string;
  /* ---- Facturación electrónica (Finppi) ---- */
  /** TRM de referencia escrita por el operador para convertir a COP. */
  trmReferencia?: number;
  tipoPago?: "Contado" | "Crédito";
  metodoPago?: string;
  tipoOperacion?: string;
  vencimiento?: string; // yyyy-mm-dd
  /** Referencia única de LOGIKS que va en «Número de orden» de Finppi. */
  referencia?: string;
  /** Consecutivo que Finppi ofrecía al emitir (anti-saltos). */
  numeroEsperado?: string;
  fechaValidacion?: string; // ISO
  totalCop?: number;
  pdfFinppiRuta?: string;
  pdfFinppiSha256?: string;
  xmlRuta?: string;
  errorCodigo?: string;
  enviadaClienteEl?: string; // ISO
  /** Enviar al cliente apenas quede emitida. */
  enviarAlEmitir?: boolean;
  /** Emisión simulada (modo demo): no es válida ante la DIAN. */
  simulada?: boolean;
  /** Monedas que ve el cliente en el PDF de LOGIKS; vacío = la de la empresa. */
  presentacion?: Presentacion;
}

/* ---------------- Facturación electrónica (Finppi) ---------------- */

export const ESTADOS_CUENTA_FE = {
  pendiente: "Verificando",
  activa: "Activa",
  credenciales_invalidas: "Credenciales inválidas",
  bloqueada: "Bloqueada",
  empresa_distinta: "El NIT no coincide",
  desconectada: "Desconectada",
} as const;
export type EstadoCuentaFe = keyof typeof ESTADOS_CUENTA_FE;

export interface CuentaFe {
  estado: EstadoCuentaFe;
  tieneCredenciales: boolean;
  usuarioPista?: string;
  consentimientoEl?: string;
  consentimientoVersion?: string;
  ultimoLoginOk?: string;
  /** Lectura del último healthcheck (§9D). */
  instantanea: {
    razonSocial?: string;
    nit?: string;
    proximaFactura?: string;
    leidoEl?: string;
    clientes?: number;
    productos?: number;
  };
  /** Información tributaria y resolución DIAN (encabezado del PDF). */
  resolucion?: string;
  /** Condiciones de pago y notas legales (pie del PDF). */
  condiciones?: string;
  /** Monedas que ve el cliente en facturas en USD (por defecto de la empresa). */
  presentacion?: Presentacion;
  /** «borrador»: modo prueba (el bot pulsa «Guardar»); «real»: va a la DIAN. */
  modoEmision?: "borrador" | "real";
}

/**
 * Cómo se presenta al cliente una factura negociada en dólares:
 * solo USD, USD con su equivalente en COP, o solo COP. No cambia lo que va a
 * la DIAN (siempre en pesos).
 */
export const PRESENTACIONES = {
  usd: "Solo dólares",
  ambas: "Dólares y pesos",
  cop: "Solo pesos",
} as const;
export type Presentacion = keyof typeof PRESENTACIONES;

export const ESTADOS_TRABAJO_FE = {
  en_cola: "En cola",
  corriendo: "En curso",
  ok: "Terminado",
  fallido: "Falló",
  desconocido: "En verificación",
  revision: "Requiere revisión",
  cancelado: "Cancelado",
} as const;

export interface TrabajoFe {
  id: string;
  facturaId?: string;
  tipo: "emitir" | "healthcheck" | "reconciliar" | "productos";
  estado: keyof typeof ESTADOS_TRABAJO_FE;
  dryRun: boolean;
  creadoEl: string;
  terminadoEl?: string;
  errorCodigo?: string;
  error?: string;
  resultado: Record<string, unknown>;
  logs: { paso: string; nivel: "info" | "aviso" | "error"; mensaje: string; creadoEl: string }[];
}

export interface EstadoBotFe {
  latidoEl?: string;
  pausado: boolean;
  motivo?: string;
}
