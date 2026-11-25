import type { Cotizacion, Hito, Operacion, TipoServicio } from "./types";
import { totalesConceptos } from "./cotizacion";

/** Hitos por defecto por tipo de operación (RF-26). Configurables por empresa. */
export const HITOS_POR_TIPO: Record<TipoServicio, string[]> = {
  maritimo_fcl: ["Carga lista", "Booking", "ETD", "Salida", "ETA", "Arribo", "Nacionalización", "Entrega", "Cierre"],
  maritimo_lcl: ["Carga lista", "Booking", "ETD", "Salida", "ETA", "Arribo", "Desconsolidación", "Nacionalización", "Entrega", "Cierre"],
  aereo: ["Carga lista", "Booking", "ETD", "Salida", "ETA", "Arribo", "Nacionalización", "Entrega", "Cierre"],
  terrestre: ["Cargue", "Salida", "En ruta", "Entrega", "Cumplido", "Cierre"],
  aduana: ["Documentos recibidos", "Declaración", "Levante", "Retiro", "Cierre"],
  seguro: ["Póliza emitida", "Cierre"],
  multimodal: ["Carga lista", "Booking", "ETD", "Salida", "ETA", "Arribo", "Nacionalización", "Tramo terrestre", "Entrega", "Cierre"],
};

export function crearOperacion(
  q: Cotizacion,
  op: {
    id: string;
    consecutivo: string;
    responsableId: string;
    hoy: string;
    generarId: () => string;
    /** Hitos propios de la empresa para este tipo (RF-26). */
    hitos?: string[];
  },
): Operacion {
  if (q.estado !== "aceptada") {
    throw new Error("Solo se abre un DO desde una cotización aceptada");
  }
  const hitos: Hito[] = (op.hitos?.length ? op.hitos : HITOS_POR_TIPO[q.tipoServicio]).map((nombre) => ({
    id: op.generarId(),
    nombre,
  }));
  return {
    id: op.id,
    empresaId: q.empresaId,
    consecutivo: op.consecutivo,
    cotizacionId: q.id,
    clienteId: q.clienteId,
    responsableId: op.responsableId,
    tipo: q.tipoServicio,
    origen: q.origen,
    destino: q.destino,
    estado: "abierto",
    abiertoEl: op.hoy,
    trm: q.trm,
    conceptos: q.conceptos.map((c) => ({ ...c })),
    hitos,
  };
}

/** Avance del DO: proporción de hitos con fecha real. */
export function avance(op: Operacion): number {
  if (op.hitos.length === 0) return 0;
  return op.hitos.filter((h) => h.real).length / op.hitos.length;
}

export function hitoActual(op: Operacion): Hito | undefined {
  return op.hitos.find((h) => !h.real);
}

/** Utilidad cotizada vs real (RF-29). */
export function utilidadOperacion(op: Operacion) {
  const cotizada = totalesConceptos(op.conceptos, "COP", op.trm);
  const conReales = op.conceptos.map((c) => ({
    ...c,
    costoUnitario:
      op.costosReales?.[c.id] !== undefined
        ? op.costosReales[c.id] / c.cantidad
        : c.costoUnitario,
  }));
  const real = totalesConceptos(conReales, "COP", op.trm);
  return { cotizada, real };
}

/** Estado del DO según los hitos con fecha real. Nunca retrocede ni toca un DO cerrado. */
export function estadoSegunHitos(op: Operacion): Operacion["estado"] {
  if (op.estado === "cerrado") return "cerrado";
  const hecho = (...n: string[]) => op.hitos.some((h) => n.includes(h.nombre) && h.real);
  const orden: Operacion["estado"][] = ["abierto", "en_transito", "en_destino", "entregado"];
  let nuevo: Operacion["estado"] = "abierto";
  if (hecho("Salida")) nuevo = "en_transito";
  if (hecho("Arribo")) nuevo = "en_destino";
  if (hecho("Entrega", "Cumplido")) nuevo = "entregado";
  return orden.indexOf(nuevo) > orden.indexOf(op.estado) ? nuevo : op.estado;
}

/** Hitos que aplica la empresa para un tipo de operación. */
export function hitosDe(tipo: TipoServicio, propios?: Partial<Record<TipoServicio, string[]>>): string[] {
  const h = propios?.[tipo]?.map((x) => x.trim()).filter(Boolean);
  return h?.length ? h : HITOS_POR_TIPO[tipo];
}
