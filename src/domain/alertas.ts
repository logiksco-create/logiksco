import type { Alerta, Cotizacion, Factura, Formulario170, Operacion, Tercero } from "./types";
import { diasEntre, fechaLegible as f } from "./fechas";
import { estadoEfectivo, tarifasVencidas } from "./cotizacion";
import { situacion170 } from "./cumplimiento";

/**
 * Motor de alertas (RF-30, RF-31). Es una función pura: recibe el estado y
 * la fecha de hoy y devuelve las alertas abiertas. Puede ejecutarse en cada
 * carga de página o en un job programado que además envíe los correos.
 */

/** Hito que marca la salida real de la carga. */
const HITOS_SALIDA = ["Booking", "ETD"];

export function fechaSalida(op: Operacion): string | undefined {
  for (const nombre of HITOS_SALIDA) {
    const h = op.hitos.find((x) => x.nombre === nombre);
    const f = h?.real ?? h?.estimada;
    if (f) return f;
  }
  return undefined;
}

export interface EntradaAlertas {
  hoy: string;
  cotizaciones: Cotizacion[];
  operaciones: Operacion[];
  terceros: Tercero[];
  formularios: Formulario170[];
  facturas?: Factura[];
}

export function calcularAlertas(e: EntradaAlertas): Alerta[] {
  const { hoy } = e;
  const alertas: Alerta[] = [];
  const nombre = (id: string) =>
    e.terceros.find((t) => t.id === id)?.razonSocial ?? "Cliente";

  // RF-30: tarifa vencida frente a la salida real de la carga.
  for (const op of e.operaciones) {
    if (op.estado === "cerrado" || op.estado === "entregado") continue;
    const salida = fechaSalida(op);
    if (!salida) continue;
    for (const c of tarifasVencidas(op.conceptos, salida)) {
      alertas.push({
        id: `tarifa-${op.id}-${c.id}`,
        tipo: "tarifa_vencida",
        severidad: "alta",
        titulo: `Tarifa vencida en ${op.consecutivo}`,
        detalle: `${c.descripcion} vence el ${f(c.vigenciaTarifa!)} y la carga sale el ${f(salida)}. Pide actualización al proveedor y re-cotiza.`,
        href: `/app/operaciones/${op.id}`,
        fecha: hoy,
      });
    }

    // Hitos atrasados y ETA próxima.
    for (const h of op.hitos) {
      if (h.real || !h.estimada) continue;
      const d = diasEntre(hoy, h.estimada);
      if (d < 0) {
        alertas.push({
          id: `hito-${op.id}-${h.id}`,
          tipo: "hito_atrasado",
          severidad: "media",
          titulo: `${h.nombre} atrasado en ${op.consecutivo}`,
          detalle: `Estimado para el ${f(h.estimada)} (${-d} día${d === -1 ? "" : "s"} de atraso) · ${nombre(op.clienteId)}`,
          href: `/app/operaciones/${op.id}`,
          fecha: hoy,
        });
      } else if (h.nombre === "ETA" && d <= 3) {
        alertas.push({
          id: `eta-${op.id}`,
          tipo: "eta_proxima",
          severidad: "baja",
          titulo: `ETA próxima en ${op.consecutivo}`,
          detalle: `Llega ${d === 0 ? "hoy" : `en ${d} día${d === 1 ? "" : "s"}`} · ${nombre(op.clienteId)}`,
          href: `/app/operaciones/${op.id}`,
          fecha: hoy,
        });
      }
    }
  }

  // Cotizaciones por vencer sin respuesta.
  for (const q of e.cotizaciones) {
    const estado = estadoEfectivo(q, hoy);
    if (estado !== "enviada" && estado !== "vista") continue;
    const d = diasEntre(hoy, q.vigenteHasta);
    if (d <= 3) {
      alertas.push({
        id: `cot-${q.id}`,
        tipo: "cotizacion_por_vencer",
        severidad: "media",
        titulo: `${q.consecutivo} vence ${d === 0 ? "hoy" : `en ${d} días`}`,
        detalle: `Sin respuesta de ${nombre(q.clienteId)}. Haz seguimiento.`,
        href: `/app/cotizaciones/${q.id}`,
        fecha: hoy,
      });
    }
  }

  // Formularios 170 por vencer o vencidos.
  for (const t of e.terceros.filter((x) => x.tipo === "cliente")) {
    const s = situacion170(
      e.formularios.filter((f) => f.terceroId === t.id),
      hoy,
    );
    if (s.tipo === "por_vencer") {
      alertas.push({
        id: `170-${t.id}`,
        tipo: "f170_por_vencer",
        severidad: s.diasRestantes <= 5 ? "alta" : "media",
        titulo: `Circular 170 de ${t.razonSocial} vence en ${s.diasRestantes} días`,
        detalle: "Envía la solicitud de actualización; el formulario llega prellenado.",
        href: `/app/cumplimiento`,
        fecha: hoy,
      });
    } else if (s.tipo === "vencido") {
      alertas.push({
        id: `170-${t.id}`,
        tipo: "f170_por_vencer",
        severidad: "alta",
        titulo: `Circular 170 de ${t.razonSocial} vencida`,
        detalle: "No se pueden abrir nuevos DO hasta actualizarla.",
        href: `/app/cumplimiento`,
        fecha: hoy,
      });
    }

    // Corte de facturación del cliente.
    const corte = t.acuerdo?.diaCorte;
    if (corte) {
      const diaHoy = Number(hoy.slice(8, 10));
      const faltan = corte - diaHoy;
      if (faltan >= 0 && faltan <= 2) {
        alertas.push({
          id: `corte-${t.id}`,
          tipo: "corte_facturacion",
          severidad: "baja",
          titulo: `Corte de facturación de ${t.razonSocial}`,
          detalle: `El corte es el día ${corte}${faltan === 0 ? " (hoy)" : faltan === 1 ? " (mañana)" : ` (en ${faltan} días)`}. Prepara la prefactura.`,
          href: `/app/clientes`,
          fecha: hoy,
        });
      }
    }
  }

  // RF-49: rechazos de Finppi van a Contabilidad con el error.
  for (const f of e.facturas ?? []) {
    if (f.estado !== "rechazada" && !f.error) continue;
    alertas.push({
      id: `factura-${f.id}`,
      tipo: "factura_rechazada",
      severidad: "alta",
      titulo: `Factura de ${nombre(f.clienteId)} ${f.estado === "rechazada" ? "rechazada" : "con error de envío"}`,
      detalle: f.error ?? "Revisa la prefactura y vuelve a enviarla.",
      href: `/app/facturacion/${f.id}`,
      fecha: hoy,
    });
  }

  const peso = { alta: 0, media: 1, baja: 2 };
  return alertas.sort((a, b) => peso[a.severidad] - peso[b.severidad]);
}
