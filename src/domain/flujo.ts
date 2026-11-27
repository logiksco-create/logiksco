import type { Cotizacion, Factura, Formulario170, Operacion, Rol, Tercero } from "./types";
import { diasEntre, fechaLegible } from "./fechas";
import { estadoEfectivo } from "./cotizacion";
import { habilitadoParaDO, situacion170 } from "./cumplimiento";
import { hitoActual } from "./operacion";

/**
 * Flujo de cada negocio, de la cotización a la factura. Es una función pura:
 * a partir del estado dice en qué etapa está cada cliente, cuál es el
 * siguiente paso, quién lo debe dar y si está detenido. Así ningún cliente
 * queda en el limbo: todo negocio vivo aparece en exactamente una etapa.
 */

export const ETAPAS_FLUJO = {
  cotizacion: { nombre: "Cotización", corto: "Cotizar" },
  circular170: { nombre: "Circular 170", corto: "170" },
  abrir_do: { nombre: "Abrir DO", corto: "DO" },
  operacion: { nombre: "En operación", corto: "Operación" },
  facturacion: { nombre: "Facturación", corto: "Facturar" },
  completado: { nombre: "Facturado", corto: "Listo" },
} as const;
export type EtapaFlujo = keyof typeof ETAPAS_FLUJO;
export const ORDEN_ETAPAS = Object.keys(ETAPAS_FLUJO) as EtapaFlujo[];

/** Días que un paso puede esperar antes de considerarse detenido. */
export const LIMITE_DIAS = {
  sin_cotizar: 3,
  borrador: 2,
  seguimiento: 5,
  pedir_170: 1,
  esperar_170: 3,
  revisar_170: 1,
  abrir_do: 1,
  sin_hitos: 1,
  prefactura: 3,
  emitir: 2,
} as const;

export type AccionRapida = "abrir_do" | "pedir_170" | "enviar_cotizacion";

export interface PasoFlujo {
  /** Estable: t-, q- o do- + id. */
  id: string;
  etapa: EtapaFlujo;
  /** El siguiente paso, en imperativo («Abre el DO»). */
  accion: string;
  detalle: string;
  /** Roles que pueden dar el paso. */
  roles: Rol[];
  /** Persona responsable, si la hay (comercial de la cotización o responsable del DO). */
  responsableId?: string;
  clienteId: string;
  cliente: string;
  referencia: string;
  href: string;
  desde?: string; // yyyy-mm-dd
  dias?: number;
  detenido: boolean;
  /** La pelota está del lado del cliente (no de nuestro equipo). */
  esperaCliente?: boolean;
  cotizacionId?: string;
  operacionId?: string;
  facturaId?: string;
  accionRapida?: AccionRapida;
}

export interface EntradaFlujo {
  hoy: string;
  cotizaciones: Cotizacion[];
  operaciones: Operacion[];
  terceros: Tercero[];
  formularios: Formulario170[];
  facturas?: Factura[];
  /** Si la empresa exige la 170 vigente para abrir el DO (por defecto sí). */
  bloquearDOSin170?: boolean;
}

/** Días en el paso (nunca negativo). */
function transcurridos(desde: string | undefined, hoy: string) {
  return desde ? Math.max(0, diasEntre(desde.slice(0, 10), hoy)) : undefined;
}

function fechaAceptacion(q: Cotizacion): string {
  return (q.aceptacion?.fecha ?? q.historial.findLast((h) => /acept/i.test(h.accion))?.fecha ?? q.fechaEmision).slice(0, 10);
}

/** Fecha en que la carga quedó entregada (último hito con fecha real). */
function ultimaFechaReal(op: Operacion): string {
  return op.hitos.reduce<string>((m, h) => (h.real && h.real > m ? h.real : m), op.abiertoEl);
}

export function calcularFlujo(e: EntradaFlujo): PasoFlujo[] {
  const { hoy } = e;
  const bloquear = e.bloquearDOSin170 ?? true;
  const pasos: PasoFlujo[] = [];
  const nombre = new Map(e.terceros.map((t) => [t.id, t.razonSocial]));
  const opPorCotizacion = new Map(e.operaciones.map((o) => [o.cotizacionId, o]));
  const facturas = (e.facturas ?? []).filter((f) => f.estado !== "rechazada");
  const facturaDe = (opId: string) =>
    facturas.filter((f) => f.operaciones.includes(opId)).sort((a, b) => b.creadoEl.localeCompare(a.creadoEl))[0];

  const paso = (p: Omit<PasoFlujo, "dias" | "detenido" | "cliente"> & { limite?: number }): PasoFlujo => {
    const dias = transcurridos(p.desde, hoy);
    const { limite, ...resto } = p;
    return {
      ...resto,
      cliente: nombre.get(p.clienteId) ?? "Cliente",
      dias,
      detenido: limite !== undefined && dias !== undefined && dias > limite,
    };
  };

  // 0. Clientes y prospectos sin ningún negocio: alguien debe cotizarles.
  const conNegocio = new Set([...e.cotizaciones.map((q) => q.clienteId), ...e.operaciones.map((o) => o.clienteId)]);
  for (const t of e.terceros) {
    if (t.tipo === "proveedor" || conNegocio.has(t.id)) continue;
    pasos.push(
      paso({
        id: `t-${t.id}`,
        etapa: "cotizacion",
        accion: "Crea la primera cotización",
        detalle: t.tipo === "prospecto" ? "Prospecto sin cotizaciones" : "Cliente sin cotizaciones",
        roles: ["comercial"],
        clienteId: t.id,
        referencia: t.tipo === "prospecto" ? "Prospecto" : "Cliente nuevo",
        href: `/app/cotizaciones/nueva?cliente=${t.id}`,
      }),
    );
  }

  // 1-3. Cotizaciones: por enviar, esperando respuesta, 170 y apertura del DO.
  // Solo la versión vigente de cada consecutivo cuenta.
  const vigentes = new Map<string, Cotizacion>();
  for (const q of e.cotizaciones) {
    const otra = vigentes.get(q.consecutivo);
    if (!otra || q.version > otra.version) vigentes.set(q.consecutivo, q);
  }
  for (const q of vigentes.values()) {
    const estado = estadoEfectivo(q, hoy);
    const base = {
      clienteId: q.clienteId,
      referencia: q.consecutivo,
      href: `/app/cotizaciones/${q.id}`,
      cotizacionId: q.id,
      responsableId: q.comercialId,
    };
    if (estado === "borrador") {
      pasos.push(
        paso({
          ...base,
          id: `q-${q.id}`,
          etapa: "cotizacion",
          accion: "Envía la cotización al cliente",
          detalle: `Borrador creado el ${fechaLegible(q.fechaEmision)}`,
          roles: ["comercial"],
          desde: q.fechaEmision,
          limite: LIMITE_DIAS.borrador,
          accionRapida: "enviar_cotizacion",
        }),
      );
      continue;
    }
    if (estado === "enviada" || estado === "vista") {
      const vence = diasEntre(hoy, q.vigenteHasta);
      pasos.push(
        paso({
          ...base,
          id: `q-${q.id}`,
          etapa: "cotizacion",
          accion: estado === "vista" ? "Haz seguimiento: el cliente ya la vio" : "Espera la respuesta del cliente",
          detalle: vence <= 0 ? "Vence hoy" : `Vence en ${vence} día${vence === 1 ? "" : "s"}`,
          roles: ["comercial"],
          desde: q.fechaEmision,
          limite: vence <= 3 ? -1 : LIMITE_DIAS.seguimiento,
          esperaCliente: true,
        }),
      );
      continue;
    }
    if (estado !== "aceptada" || opPorCotizacion.has(q.id)) continue;

    const aceptada = fechaAceptacion(q);
    const forms = e.formularios.filter((f) => f.terceroId === q.clienteId);
    const sit = situacion170(forms, hoy);
    if (!bloquear || habilitadoParaDO(sit)) {
      const aprobado = "formulario" in sit ? sit.formulario.aprobadoEl : undefined;
      const desde = aprobado && aprobado > aceptada ? aprobado : aceptada;
      pasos.push(
        paso({
          ...base,
          id: `q-${q.id}`,
          etapa: "abrir_do",
          accion: "Abre el DO",
          detalle: habilitadoParaDO(sit)
            ? `Aceptada el ${fechaLegible(aceptada)} · Circular 170 vigente`
            : `Aceptada el ${fechaLegible(aceptada)}`,
          roles: ["operaciones", "comercial"],
          responsableId: undefined,
          desde,
          limite: LIMITE_DIAS.abrir_do,
          accionRapida: "abrir_do",
        }),
      );
      continue;
    }

    const ultimo = [...forms].sort((a, b) => b.version - a.version)[0];
    if (ultimo?.estado === "en_revision") {
      pasos.push(
        paso({
          ...base,
          id: `q-${q.id}`,
          etapa: "circular170",
          accion: "Revisa y aprueba la Circular 170",
          detalle: `El cliente la envió${ultimo.diligenciadoEl ? ` el ${fechaLegible(ultimo.diligenciadoEl.slice(0, 10))}` : ""}`,
          roles: ["cumplimiento"],
          responsableId: undefined,
          href: `/app/cumplimiento#f-${ultimo.id}`,
          desde: ultimo.diligenciadoEl?.slice(0, 10) ?? aceptada,
          limite: LIMITE_DIAS.revisar_170,
        }),
      );
    } else if (ultimo && (ultimo.estado === "pendiente" || ultimo.estado === "devuelto")) {
      pasos.push(
        paso({
          ...base,
          id: `q-${q.id}`,
          etapa: "circular170",
          accion: ultimo.estado === "devuelto" ? "El cliente debe corregir su 170" : "El cliente debe enviar su 170",
          detalle: ultimo.estado === "devuelto" ? `Devuelta: ${ultimo.observaciones ?? "con observaciones"}` : "Formulario iniciado, sin enviar",
          roles: ["comercial"],
          desde: aceptada,
          limite: LIMITE_DIAS.esperar_170,
          esperaCliente: true,
          accionRapida: "pedir_170",
        }),
      );
    } else {
      pasos.push(
        paso({
          ...base,
          id: `q-${q.id}`,
          etapa: "circular170",
          accion: sit.tipo === "vencido" ? "Pide la actualización de la 170" : "Pide la Circular 170 al cliente",
          detalle: `Aceptada el ${fechaLegible(aceptada)} · ${sit.tipo === "vencido" ? "170 vencida" : "sin formulario 170"}`,
          roles: ["comercial"],
          desde: aceptada,
          limite: LIMITE_DIAS.pedir_170,
          accionRapida: "pedir_170",
        }),
      );
    }
  }

  // 4-6. DO: en operación, por facturar y facturados.
  for (const op of e.operaciones) {
    const base = {
      clienteId: op.clienteId,
      referencia: op.consecutivo,
      href: `/app/operaciones/${op.id}`,
      operacionId: op.id,
      cotizacionId: op.cotizacionId,
    };
    const f = facturaDe(op.id);
    const terminada = op.estado === "entregado" || op.estado === "cerrado";

    if (!terminada) {
      const actual = hitoActual(op);
      const sinFechas = op.hitos.every((h) => !h.estimada && !h.real);
      const atrasado = op.hitos.find((h) => !h.real && h.estimada && diasEntre(hoy, h.estimada) < 0);
      const p = paso({
        ...base,
        id: `do-${op.id}`,
        etapa: "operacion",
        accion: sinFechas
          ? "Programa las fechas de los hitos"
          : atrasado
            ? `Actualiza «${atrasado.nombre}» (atrasado)`
            : actual
              ? `Sigue: ${actual.nombre}`
              : "Marca la entrega",
        detalle: `${op.origen} → ${op.destino}${f ? ` · ${f.estado === "emitida" && !(f.simulada && !f.cufe) ? `factura ${f.numero ?? "emitida"}` : "prefactura en curso"}` : ""}`,
        roles: ["operaciones"],
        responsableId: op.responsableId,
        desde: op.abiertoEl,
        limite: sinFechas ? LIMITE_DIAS.sin_hitos : undefined,
      });
      if (atrasado) p.detenido = true;
      pasos.push(p);
      continue;
    }

    const entregada = ultimaFechaReal(op);
    if (!f) {
      pasos.push(
        paso({
          ...base,
          id: `do-${op.id}`,
          etapa: "facturacion",
          accion: "Genera la prefactura",
          detalle: `Carga entregada el ${fechaLegible(entregada)}`,
          roles: ["contabilidad"],
          href: `/app/facturacion#c-${op.clienteId}`,
          desde: entregada,
          limite: LIMITE_DIAS.prefactura,
        }),
      );
    } else if (f.estado === "emitida" && f.simulada && !f.cufe) {
      // Prueba («Guardar» en Finppi): el DO sigue sin factura real.
      pasos.push(
        paso({
          ...base,
          id: `do-${op.id}`,
          etapa: "facturacion",
          accion: "Prueba guardada: emite la factura real",
          detalle: `Borrador de prueba ${f.numeroEsperado ?? ""} en Finppi`.trim(),
          roles: ["contabilidad"],
          href: `/app/facturacion/${f.id}`,
          facturaId: f.id,
          desde: (f.fechaValidacion ?? f.creadoEl).slice(0, 10),
        }),
      );
    } else if (f.estado !== "emitida") {
      const problema = f.estado === "fallida" || f.estado === "revision" || f.estado === "estado_desconocido" || !!f.error;
      const enBot = f.estado === "en_cola" || f.estado === "enviando";
      pasos.push(
        paso({
          ...base,
          id: `do-${op.id}`,
          etapa: "facturacion",
          accion: problema ? "Revisa la factura: no se emitió" : enBot ? "Emitiendo en Finppi…" : "Emite la factura electrónica",
          detalle: `Prefactura del ${fechaLegible(f.creadoEl.slice(0, 10))}`,
          roles: ["contabilidad"],
          href: `/app/facturacion/${f.id}`,
          facturaId: f.id,
          desde: f.creadoEl.slice(0, 10),
          limite: problema ? -1 : enBot ? undefined : LIMITE_DIAS.emitir,
        }),
      );
    } else if (diasEntre(f.fechaValidacion?.slice(0, 10) ?? f.creadoEl.slice(0, 10), hoy) <= 30) {
      pasos.push(
        paso({
          ...base,
          id: `do-${op.id}`,
          etapa: "completado",
          accion: "Ciclo completo",
          detalle: `Factura ${f.numero ?? "emitida"}`,
          roles: ["contabilidad"],
          href: `/app/facturacion/${f.id}`,
          facturaId: f.id,
          desde: (f.fechaValidacion ?? f.creadoEl).slice(0, 10),
        }),
      );
    }
  }

  return pasos.sort(
    (a, b) =>
      ORDEN_ETAPAS.indexOf(a.etapa) - ORDEN_ETAPAS.indexOf(b.etapa) ||
      Number(b.detenido) - Number(a.detenido) ||
      (b.dias ?? 0) - (a.dias ?? 0),
  );
}

/** ¿Le toca a este usuario? Responsable directo o, si no hay, cualquiera con el rol. */
export function esMio(p: PasoFlujo, u: { id: string; roles: Rol[] }): boolean {
  if (p.etapa === "completado" || (p.esperaCliente && !p.detenido)) return false;
  if (p.responsableId) return p.responsableId === u.id;
  return p.roles.some((r) => u.roles.includes(r));
}

/** Etapa del negocio de una cotización o un DO (para el paso a paso de las fichas). */
export function etapaDe(pasos: PasoFlujo[], ref: { cotizacionId?: string; operacionId?: string }) {
  return pasos.find(
    (p) => (ref.operacionId && p.operacionId === ref.operacionId) || (ref.cotizacionId && p.cotizacionId === ref.cotizacionId),
  );
}
