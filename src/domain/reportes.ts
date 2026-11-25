import type { Cotizacion, Formulario170, Operacion, Tercero, TipoServicio, Usuario } from "./types";
import { TIPOS_SERVICIO } from "./types";
import { utilidadOperacion } from "./operacion";
import { situacion170 } from "./cumplimiento";
import { diasEntre, sumarMeses } from "./fechas";

/** Reportes estándar (RF-53). Funciones puras sobre los datos de la empresa. */

export type Periodo = "mes" | "trimestre" | "anio" | "todo";

export const PERIODOS: Record<Periodo, string> = {
  mes: "Este mes",
  trimestre: "Últimos 3 meses",
  anio: "Últimos 12 meses",
  todo: "Todo",
};

export function rangoPeriodo(p: Periodo, hoy: string): { desde: string; hasta: string } {
  const primeroDeMes = `${hoy.slice(0, 7)}-01`;
  switch (p) {
    case "mes":
      return { desde: primeroDeMes, hasta: hoy };
    case "trimestre":
      return { desde: sumarMeses(primeroDeMes, -2), hasta: hoy };
    case "anio":
      return { desde: sumarMeses(primeroDeMes, -11), hasta: hoy };
    default:
      return { desde: "0000-01-01", hasta: hoy };
  }
}

const enRango = (f: string, r: { desde: string; hasta: string }) =>
  diasEntre(r.desde, f) >= 0 && diasEntre(f, r.hasta) >= 0;

export interface FilaVentas {
  clave: string;
  etiqueta: string;
  operaciones: number;
  ventas: number;
  utilidadCotizada: number;
  utilidadReal: number;
  margenReal: number;
}

function agrupar(ops: Operacion[], clave: (o: Operacion) => string, etiqueta: (k: string) => string): FilaVentas[] {
  const m = new Map<string, FilaVentas>();
  for (const o of ops) {
    const k = clave(o);
    const { cotizada, real } = utilidadOperacion(o);
    const f = m.get(k) ?? { clave: k, etiqueta: etiqueta(k), operaciones: 0, ventas: 0, utilidadCotizada: 0, utilidadReal: 0, margenReal: 0 };
    f.operaciones += 1;
    f.ventas += cotizada.venta;
    f.utilidadCotizada += cotizada.utilidad;
    f.utilidadReal += real.utilidad;
    m.set(k, f);
  }
  return [...m.values()]
    .map((f) => ({ ...f, margenReal: f.ventas ? f.utilidadReal / f.ventas : 0 }))
    .sort((a, b) => b.ventas - a.ventas);
}

export interface FilaConversion {
  comercialId: string;
  comercial: string;
  enviadas: number;
  aceptadas: number;
  rechazadas: number;
  conversion: number;
}

export interface DatosReporte {
  hoy: string;
  periodo: Periodo;
  operaciones: Operacion[];
  cotizaciones: Cotizacion[];
  terceros: Tercero[];
  usuarios: Usuario[];
  formularios: Formulario170[];
}

export function calcularReportes(d: DatosReporte) {
  const rango = rangoPeriodo(d.periodo, d.hoy);
  const ops = d.operaciones.filter((o) => enRango(o.abiertoEl, rango));
  const cots = d.cotizaciones.filter((q) => enRango(q.fechaEmision, rango));
  const nombreTercero = (id: string) => d.terceros.find((t) => t.id === id)?.razonSocial ?? "—";
  const nombreUsuario = (id: string) => d.usuarios.find((u) => u.id === id)?.nombre ?? "Sin asignar";
  const comercialDe = (o: Operacion) => d.cotizaciones.find((q) => q.id === o.cotizacionId)?.comercialId ?? "—";

  const porCliente = agrupar(ops, (o) => o.clienteId, nombreTercero);
  const porComercial = agrupar(ops, comercialDe, nombreUsuario);
  const porTipo = agrupar(ops, (o) => o.tipo, (k) => TIPOS_SERVICIO[k as TipoServicio] ?? k);

  const conv = new Map<string, FilaConversion>();
  for (const q of cots.filter((x) => x.estado !== "borrador")) {
    const f = conv.get(q.comercialId) ?? {
      comercialId: q.comercialId,
      comercial: nombreUsuario(q.comercialId),
      enviadas: 0,
      aceptadas: 0,
      rechazadas: 0,
      conversion: 0,
    };
    f.enviadas += 1;
    if (q.estado === "aceptada") f.aceptadas += 1;
    if (q.estado === "rechazada") f.rechazadas += 1;
    conv.set(q.comercialId, f);
  }
  const conversion = [...conv.values()].map((f) => ({ ...f, conversion: f.enviadas ? f.aceptadas / f.enviadas : 0 }));

  const clientes = d.terceros.filter((t) => t.tipo === "cliente");
  const estado170 = clientes.map((t) => {
    const s = situacion170(d.formularios.filter((f) => f.terceroId === t.id), d.hoy);
    const ref = "formulario" in s ? s.formulario : undefined;
    return { cliente: t.razonSocial, nit: t.nit, situacion: s.tipo, vigenteHasta: ref?.vigenteHasta };
  });

  const total = porTipo.reduce(
    (a, f) => ({
      operaciones: a.operaciones + f.operaciones,
      ventas: a.ventas + f.ventas,
      utilidadCotizada: a.utilidadCotizada + f.utilidadCotizada,
      utilidadReal: a.utilidadReal + f.utilidadReal,
    }),
    { operaciones: 0, ventas: 0, utilidadCotizada: 0, utilidadReal: 0 },
  );

  return { rango, total, porCliente, porComercial, porTipo, conversion, estado170 };
}

/* ------------------------------------------------------------------ */
/* Exportación CSV compatible con Excel en español (separador ";")      */
/* ------------------------------------------------------------------ */

function celda(v: string | number | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
  return /[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

export function aCSV(encabezados: string[], filas: (string | number | undefined)[][]): string {
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  return "﻿" + [encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
}
