import type {
  Comunicacion,
  Concepto,
  Cotizacion,
  Datos170,
  Empresa,
  EstadoCotizacion,
  Formulario170,
  Hito,
  Incoterm,
  Mercancia,
  Moneda,
  Operacion,
  Tercero,
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

  terceros(tipo?: Tercero["tipo"]): Promise<Tercero[]>;
  tercero(id: string): Promise<Tercero | null>;
  crearTercero(datos: NuevoTercero): Promise<Tercero>;

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

  comunicaciones(entidad: Comunicacion["entidad"], id: string): Promise<Comunicacion[]>;
  registrarComunicacion(c: Omit<Comunicacion, "id" | "empresaId" | "fecha">): Promise<void>;
}

/** Operaciones públicas (enlace de aceptación, sin sesión). */
export interface RepositorioPublico {
  cotizacionPorToken(token: string): Promise<VistaPublica | null>;
  marcarVista(token: string): Promise<void>;
  registrarDecision(token: string, decision: DecisionCliente): Promise<void>;
  enviarFormulario170(token: string, datos: Datos170): Promise<void>;
}

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
