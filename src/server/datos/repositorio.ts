import type {
  AcuerdoComercial,
  Archivo,
  Comunicacion,
  Concepto,
  Contacto,
  Cotizacion,
  Datos170,
  Empresa,
  EntradaCatalogo,
  EstadoCotizacion,
  Factura,
  Formulario170,
  Hito,
  Incoterm,
  Mercancia,
  Moneda,
  Operacion,
  Rol,
  Tercero,
  TipoCatalogo,
  TipoServicio,
  Usuario,
} from "@/domain/types";

/**
 * Contrato de acceso a datos. La aplicación solo depende de esta interfaz;
 * hay dos implementaciones:
 *  - `DemoRepositorio`: en memoria, con datos del piloto (sin configuración).
 *  - `SupabaseRepositorio`: Postgres con RLS (producción).
 *
 * Un repositorio siempre está ligado a una empresa y a un usuario: no expone
 * operaciones entre empresas. El aislamiento real lo garantiza RLS.
 */
export interface Repositorio {
  readonly empresa: Empresa;
  readonly usuario: Usuario;

  usuarios(): Promise<Usuario[]>;
  /** Accesos al portal de un cliente (RF-35). */
  accesosPortal(terceroId: string): Promise<{ usuarioId: string; nombre: string; correo: string }[]>;
  invitarAlPortal(terceroId: string, datos: { nombre: string; correo: string }): Promise<void>;

  /** Catálogos base de LOGIKS + propios de la empresa (RF-54). */
  catalogo(tipo?: TipoCatalogo): Promise<EntradaCatalogo[]>;
  agregarCatalogo(e: Omit<EntradaCatalogo, "id" | "base">): Promise<void>;
  eliminarCatalogo(id: string): Promise<void>;

  /** Logo de la empresa (RF-54). Solo Administrador. */
  prepararSubidaLogo(archivo: { nombre: string; mime: string; tamano: number }): Promise<SubidaFirmada | null>;
  guardarLogo(archivo: { ruta?: string; bytes?: Uint8Array; mime: string; tamano: number }): Promise<void>;
  quitarLogo(): Promise<void>;

  /** Configuración de la empresa (RF-54). Solo Administrador. */
  actualizarEmpresa(cambios: CambiosEmpresa): Promise<void>;
  invitarUsuario(datos: { correo: string; nombre: string; roles: Rol[] }): Promise<void>;
  cambiarRoles(usuarioId: string, roles: Rol[]): Promise<void>;
  desactivarUsuario(usuarioId: string): Promise<void>;

  terceros(tipo?: Tercero["tipo"]): Promise<Tercero[]>;
  tercero(id: string): Promise<Tercero | null>;
  crearTercero(datos: NuevoTercero): Promise<Tercero>;
  /** CRM (RF-41, RF-42) */
  guardarAcuerdo(terceroId: string, acuerdo: AcuerdoComercial): Promise<void>;
  guardarContacto(terceroId: string, contacto: Omit<Contacto, "id"> & { id?: string }): Promise<void>;
  eliminarContacto(terceroId: string, contactoId: string): Promise<void>;

  cotizaciones(): Promise<Cotizacion[]>;
  cotizacion(id: string): Promise<Cotizacion | null>;
  /** Guarda un borrador nuevo, edita un borrador o crea una versión nueva. */
  guardarCotizacion(datos: DatosCotizacion, id?: string): Promise<Cotizacion>;
  duplicarCotizacion(
    id: string,
    clienteId?: string,
  ): Promise<{ cotizacion: Cotizacion; advertencias: Concepto[] }>;
  cambiarEstadoCotizacion(
    id: string,
    estado: EstadoCotizacion,
    accion: string,
  ): Promise<void>;
  /** Emite el token del enlace público de aceptación (RF-05, RF-12). */
  emitirEnlace(id: string): Promise<string>;

  formularios170(terceroId?: string): Promise<Formulario170[]>;
  revisarFormulario170(
    id: string,
    decision: "aprobado" | "devuelto" | "rechazado",
    observaciones?: string,
  ): Promise<void>;

  operaciones(): Promise<Operacion[]>;
  operacion(id: string): Promise<Operacion | null>;
  abrirOperacion(cotizacionId: string): Promise<Operacion>;
  actualizarHito(operacionId: string, hito: Pick<Hito, "id" | "real" | "estimada" | "nota">): Promise<void>;
  /** Costo real total de un concepto del DO (RF-29); null lo borra. */
  registrarCostoReal(operacionId: string, conceptoId: string, costoTotal: number | null): Promise<void>;

  documentosDO(operacionId: string): Promise<Archivo[]>;
  soportes170(formularioId: string): Promise<Archivo[]>;
  /**
   * Prepara una subida directa del navegador a Storage (URL firmada).
   * Devuelve null si el repositorio recibe los bytes por el servidor (demo).
   */
  prepararSubidaDO(operacionId: string, archivo: MetaArchivo): Promise<SubidaFirmada | null>;
  registrarDocumentoDO(operacionId: string, archivo: NuevoArchivo): Promise<void>;
  descargarArchivo(clase: "do" | "170", id: string): Promise<Descarga>;

  /* Facturación (RF-45 a RF-50) */
  facturas(): Promise<Factura[]>;
  factura(id: string): Promise<Factura | null>;
  crearPrefactura(f: Omit<Factura, "id" | "empresaId" | "estado" | "creadoEl">): Promise<Factura>;
  actualizarLineas(id: string, lineas: Factura["lineas"]): Promise<void>;
  actualizarFactura(id: string, cambios: Partial<Pick<Factura, "estado" | "megafocoId" | "numero" | "cufe" | "pdfUrl" | "xmlUrl" | "error">>): Promise<void>;
  megafocoConectado(): Promise<boolean>;
  guardarLlaveMegafoco(llave: string): Promise<void>;
  /** Solo servidor: llave descifrada para llamar a Megafoco. */
  llaveMegafoco(): Promise<string | null>;

  comunicaciones(entidad: Comunicacion["entidad"], id: string): Promise<Comunicacion[]>;
  registrarComunicacion(c: Omit<Comunicacion, "id" | "empresaId" | "fecha">): Promise<void>;
}

/** Operaciones públicas (enlace de aceptación, sin sesión). */
export interface RepositorioPublico {
  cotizacionPorToken(token: string): Promise<VistaPublica | null>;
  marcarVista(token: string): Promise<void>;
  registrarDecision(token: string, decision: DecisionCliente): Promise<void>;
  enviarFormulario170(token: string, datos: Datos170): Promise<void>;
  prepararSoporte170(token: string, archivo: MetaArchivo): Promise<SubidaFirmada | null>;
  registrarSoporte170(token: string, archivo: NuevoArchivo): Promise<void>;
  soportesPorToken(token: string): Promise<Archivo[]>;
}

export type CambiosEmpresa = Partial<
  Pick<
    Empresa,
    | "razonSocial"
    | "ciudad"
    | "colorPrimario"
    | "prefijoCotizacion"
    | "prefijoDO"
    | "vigencia170Meses"
    | "bloquearDOSin170"
    | "hitosPorTipo"
    | "terminos"
    | "servicios"
    | "configurada"
  >
>;

export interface MetaArchivo {
  tipo: string;
  nombre: string;
  mime: string;
  tamano: number;
}

export interface NuevoArchivo extends MetaArchivo {
  /** Ruta en Storage cuando el navegador subió directo. */
  ruta?: string;
  /** Contenido cuando sube por el servidor (modo demo). */
  bytes?: Uint8Array;
}

export interface SubidaFirmada {
  ruta: string;
  token: string;
}

export type Descarga = { url: string } | { bytes: Uint8Array; mime: string; nombre: string };

export interface VistaPublica {
  cotizacion: Cotizacion;
  empresa: Empresa;
  cliente: Tercero;
  formularios: Formulario170[];
}

export interface DecisionCliente {
  decision: "aceptada" | "rechazada";
  nombre: string;
  cargo: string;
  correo: string;
  motivo?: string;
  ip?: string;
  userAgent?: string;
}

export interface NuevoTercero {
  tipo: Tercero["tipo"];
  nit: string;
  razonSocial: string;
  ciudad: string;
  contacto?: { nombre: string; cargo: string; correo: string; telefono?: string };
}

export interface DatosCotizacion {
  clienteId: string;
  contactoId?: string;
  tipoServicio: TipoServicio;
  incoterm: Incoterm;
  origen: string;
  destino: string;
  mercancia: Mercancia;
  conceptos: Omit<Concepto, "id">[];
  trm: number;
  monedaPresentacion: Moneda;
  vigenteHasta: string;
  terminos: string;
}

/**
 * Portal del cliente (RF-35, RF-36). Ligado a un usuario del cliente y a un
 * tercero; todo sale ya sin costos ni proveedores.
 */
export interface RepositorioPortal {
  readonly empresa: Empresa;
  readonly cliente: Tercero;
  readonly usuario: { id: string; nombre: string; correo: string };

  cotizaciones(): Promise<Cotizacion[]>;
  cotizacion(id: string): Promise<Cotizacion | null>;
  operaciones(): Promise<Operacion[]>;
  operacion(id: string): Promise<Operacion | null>;
  novedades(operacionId: string): Promise<Comunicacion[]>;
  documentos(operacionId: string): Promise<Archivo[]>;
  descargarDocumento(id: string): Promise<Descarga>;
  facturas(): Promise<Factura[]>;
  formularios170(): Promise<Formulario170[]>;
  enviarFormulario170(datos: Datos170): Promise<void>;
}
