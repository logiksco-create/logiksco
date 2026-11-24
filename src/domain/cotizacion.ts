import type {
  Bloque,
  Concepto,
  Cotizacion,
  EstadoCotizacion,
  Moneda,
  Tercero,
} from "./types";
import { diasEntre, sumarDias } from "./fechas";

/* ------------------------------------------------------------------ */
/* Cálculo de utilidad (RF-03)                                          */
/* ------------------------------------------------------------------ */

export interface Totales {
  costo: number;
  venta: number;
  utilidad: number;
  /** Margen sobre la venta, 0..1. */
  margen: number;
}

/** Convierte un valor a la moneda destino usando la TRM (COP por USD). */
export function convertir(
  valor: number,
  de: Moneda,
  a: Moneda,
  trm: number,
): number {
  if (de === a) return valor;
  if (trm <= 0) throw new Error("La TRM debe ser mayor que cero");
  return de === "USD" ? valor * trm : valor / trm;
}

function margen(venta: number, utilidad: number): number {
  return venta === 0 ? 0 : utilidad / venta;
}

/** Utilidad de un concepto en su propia moneda. */
export function totalesConcepto(c: Concepto): Totales {
  const costo = c.costoUnitario * c.cantidad;
  const venta = c.ventaUnitaria * c.cantidad;
  const utilidad = venta - costo;
  return { costo, venta, utilidad, margen: margen(venta, utilidad) };
}

/** Totales consolidados en la moneda indicada. */
export function totalesConceptos(
  conceptos: Concepto[],
  moneda: Moneda,
  trm: number,
): Totales {
  let costo = 0;
  let venta = 0;
  for (const c of conceptos) {
    const t = totalesConcepto(c);
    costo += convertir(t.costo, c.moneda, moneda, trm);
    venta += convertir(t.venta, c.moneda, moneda, trm);
  }
  const utilidad = venta - costo;
  return { costo, venta, utilidad, margen: margen(venta, utilidad) };
}

export function totalesPorBloque(
  conceptos: Concepto[],
  moneda: Moneda,
  trm: number,
): Partial<Record<Bloque, Totales>> {
  const grupos = new Map<Bloque, Concepto[]>();
  for (const c of conceptos) {
    grupos.set(c.bloque, [...(grupos.get(c.bloque) ?? []), c]);
  }
  return Object.fromEntries(
    [...grupos].map(([b, cs]) => [b, totalesConceptos(cs, moneda, trm)]),
  );
}

export function totalesCotizacion(q: Cotizacion): Totales {
  return totalesConceptos(q.conceptos, q.monedaPresentacion, q.trm);
}

/* ------------------------------------------------------------------ */
/* Vigencias de tarifa (RF-10, RF-30)                                   */
/* ------------------------------------------------------------------ */

/** Conceptos cuya tarifa del proveedor vence antes de `fechaReferencia`. */
export function tarifasVencidas(
  conceptos: Concepto[],
  fechaReferencia: string,
): Concepto[] {
  return conceptos.filter(
    (c) => c.vigenciaTarifa && diasEntre(c.vigenciaTarifa, fechaReferencia) > 0,
  );
}

/** Estado efectivo: una cotización enviada o vista pasa a vencida al expirar. */
export function estadoEfectivo(q: Cotizacion, hoy: string): EstadoCotizacion {
  if (
    (q.estado === "enviada" || q.estado === "vista" || q.estado === "borrador") &&
    diasEntre(q.vigenteHasta, hoy) > 0
  ) {
    return "vencida";
  }
  return q.estado;
}

/* ------------------------------------------------------------------ */
/* Transiciones de estado (RF-04)                                       */
/* ------------------------------------------------------------------ */

const TRANSICIONES: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  borrador: ["enviada"],
  enviada: ["vista", "aceptada", "rechazada", "vencida"],
  vista: ["aceptada", "rechazada", "vencida"],
  aceptada: [],
  rechazada: [],
  vencida: [],
};

export function puedeTransicionar(
  de: EstadoCotizacion,
  a: EstadoCotizacion,
): boolean {
  return TRANSICIONES[de].includes(a);
}

/** Editar una cotización ya enviada crea una nueva versión (RF-06). */
export function requiereNuevaVersion(estado: EstadoCotizacion): boolean {
  return estado !== "borrador";
}

/* ------------------------------------------------------------------ */
/* Duplicar (RF-08, RF-09, RF-10)                                       */
/* ------------------------------------------------------------------ */

export interface OpcionesDuplicado {
  id: string;
  consecutivo: string;
  tokenPublico: string;
  comercialId: string;
  hoy: string;
  vigenciaDias: number;
  /** Cliente nuevo: se aplican sus condiciones comerciales. */
  cliente?: Tercero;
  generarIdConcepto: () => string;
}

export interface ResultadoDuplicado {
  cotizacion: Cotizacion;
  /** Conceptos copiados cuya tarifa ya está vencida hoy. */
  advertencias: Concepto[];
}

export function duplicarCotizacion(
  origen: Cotizacion,
  op: OpcionesDuplicado,
): ResultadoDuplicado {
  const vigenteHasta = sumarDias(op.hoy, op.vigenciaDias);

  const cliente = op.cliente;
  const cotizacion: Cotizacion = {
    ...structuredClone(origen),
    id: op.id,
    consecutivo: op.consecutivo,
    version: 1,
    estado: "borrador",
    comercialId: op.comercialId,
    fechaEmision: op.hoy,
    vigenteHasta,
    origenId: origen.id,
    tokenPublico: op.tokenPublico,
    conceptos: origen.conceptos.map((c) => ({
      ...c,
      id: op.generarIdConcepto(),
    })),
    historial: [
      {
        fecha: `${op.hoy}T00:00:00.000Z`,
        usuario: op.comercialId,
        accion: `Duplicada de ${origen.consecutivo} v${origen.version}`,
      },
    ],
  };

  if (cliente && cliente.id !== origen.clienteId) {
    cotizacion.clienteId = cliente.id;
    cotizacion.contactoId = cliente.contactos[0]?.id;
    if (cliente.acuerdo) cotizacion.monedaPresentacion = cliente.acuerdo.moneda;
  }

  return {
    cotizacion,
    advertencias: tarifasVencidas(cotizacion.conceptos, op.hoy),
  };
}

/* ------------------------------------------------------------------ */
/* Consecutivos (RF-23)                                                 */
/* ------------------------------------------------------------------ */

export function formatearConsecutivo(
  prefijo: string,
  anio: number,
  numero: number,
): string {
  return `${prefijo}-${anio}-${String(numero).padStart(4, "0")}`;
}
