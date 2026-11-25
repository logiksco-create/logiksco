import type { Concepto, Cotizacion, Operacion } from "./types";

/**
 * Lo que ve el cliente final: nunca costos, proveedores ni utilidad.
 * Toda salida hacia el portal pasa por estas funciones.
 */
function conceptoParaCliente(c: Concepto): Concepto {
  return {
    id: c.id,
    bloque: c.bloque,
    descripcion: c.descripcion,
    moneda: c.moneda,
    unidad: c.unidad,
    cantidad: c.cantidad,
    costoUnitario: 0,
    ventaUnitaria: c.ventaUnitaria,
    paraTerceros: c.paraTerceros,
  };
}

export function cotizacionParaCliente(q: Cotizacion): Cotizacion {
  return {
    ...q,
    conceptos: q.conceptos.map(conceptoParaCliente),
    historial: [],
    tokenPublico: "",
    comercialId: "",
  };
}

export function operacionParaCliente(o: Operacion): Operacion {
  return {
    ...o,
    conceptos: o.conceptos.map(conceptoParaCliente),
    costosReales: undefined,
    responsableId: "",
  };
}

/** Estados de cotización que el cliente puede ver (no borradores). */
export const visibleParaCliente = (q: Cotizacion) => q.estado !== "borrador";
