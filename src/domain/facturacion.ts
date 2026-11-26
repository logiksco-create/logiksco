import type { Factura, LineaFactura, Moneda, Operacion, Tercero } from "./types";
import { convertir } from "./cotizacion";
import { diasEntre, sumarMeses } from "./fechas";
import { pctIva } from "./einvoice";

/**
 * Prefacturación (RF-45, RF-46). LOGIKS arma la prefactura y Megafoco la
 * registra en contabilidad y la emite. Los impuestos son una sugerencia que
 * el contador confirma en Megafoco.
 */

export const IVA_PROPIO_SUGERIDO = 19;

/** DO que ya están en una factura vigente (no rechazada). */
export function operacionesFacturadas(facturas: Factura[]): Set<string> {
  return new Set(facturas.filter((f) => f.estado !== "rechazada").flatMap((f) => f.operaciones));
}

/** Fecha de corte del periodo actual del cliente (RF-46). */
export function fechaCorte(diaCorte: number, hoy: string): string {
  const [y, m] = hoy.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dia = Math.min(diaCorte, ultimo);
  const corteMes = `${hoy.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
  // Si el corte de este mes ya pasó, es el actual; si no, el del mes anterior.
  if (diasEntre(corteMes, hoy) >= 0) return corteMes;
  const anterior = sumarMeses(`${hoy.slice(0, 7)}-01`, -1);
  const ultimoAnt = new Date(Date.UTC(Number(anterior.slice(0, 4)), Number(anterior.slice(5, 7)), 0)).getUTCDate();
  return `${anterior.slice(0, 7)}-${String(Math.min(diaCorte, ultimoAnt)).padStart(2, "0")}`;
}

export interface PorFacturar {
  cliente: Tercero;
  corte?: string;
  operaciones: Operacion[];
}

/** DO pendientes de facturar por cliente, hasta su fecha de corte. */
export function pendientesPorCliente(
  operaciones: Operacion[],
  facturas: Factura[],
  clientes: Tercero[],
  hoy: string,
): PorFacturar[] {
  const ya = operacionesFacturadas(facturas);
  return clientes
    .map((cliente) => {
      const corte = cliente.acuerdo?.diaCorte ? fechaCorte(cliente.acuerdo.diaCorte, hoy) : undefined;
      const ops = operaciones.filter(
        (o) =>
          o.clienteId === cliente.id &&
          !ya.has(o.id) &&
          o.estado !== "abierto" &&
          (!corte || diasEntre(o.abiertoEl, corte) >= 0),
      );
      return { cliente, corte, operaciones: ops };
    })
    .filter((p) => p.operaciones.length > 0);
}

/** Líneas de la prefactura a partir de los conceptos de venta de los DO (RF-45). */
export function lineasDesdeOperaciones(ops: Operacion[], moneda: Moneda): LineaFactura[] {
  return ops.flatMap((o) =>
    o.conceptos.map((c) => ({
      operacionId: o.id,
      descripcion: `${c.descripcion} · ${o.consecutivo}`,
      tipo: c.paraTerceros ? ("terceros" as const) : ("propio" as const),
      cantidad: c.cantidad,
      valorUnitario: Math.round(convertir(c.ventaUnitaria, c.moneda, moneda, o.trm) * 100) / 100,
      ivaPct: c.ivaFinppi ? pctIva(c.ivaFinppi) : c.paraTerceros ? 0 : IVA_PROPIO_SUGERIDO,
      productoFinppi: c.productoFinppi,
      ivaFinppi: c.ivaFinppi ?? (c.paraTerceros ? ("Ninguno" as const) : ("IVA-19" as const)),
    })),
  );
}

export function totalesFactura(lineas: LineaFactura[]) {
  let propios = 0;
  let terceros = 0;
  let iva = 0;
  for (const l of lineas) {
    const base = l.cantidad * l.valorUnitario;
    if (l.tipo === "propio") propios += base;
    else terceros += base;
    iva += (base * l.ivaPct) / 100;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { propios: r(propios), terceros: r(terceros), iva: r(iva), total: r(propios + terceros + iva) };
}

/** Cuerpo para "Crear factura" en Megafoco (contrato del PRD, borrador). */
export function payloadMegafoco(f: Factura, cliente: Tercero, consecutivosDO: string[]) {
  return {
    idempotency_key: f.id,
    cliente: { nit: cliente.nit, razon_social: cliente.razonSocial },
    moneda: f.moneda,
    trm: f.trm,
    fecha: f.creadoEl.slice(0, 10),
    referencias_do: consecutivosDO,
    conceptos: f.lineas.map((l) => ({
      descripcion: l.descripcion,
      tipo_ingreso: l.tipo === "propio" ? "propio" : "terceros",
      cantidad: l.cantidad,
      valor_unitario: l.valorUnitario,
      iva_pct: l.ivaPct,
    })),
  };
}
