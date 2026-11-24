import "server-only";
import { cache } from "react";
import type { Repositorio } from "./datos/repositorio";
import { calcularAlertas } from "@/domain/alertas";
import { situacion170 } from "@/domain/cumplimiento";
import { estadoEfectivo, totalesCotizacion } from "@/domain/cotizacion";
import { hoyISO, diasEntre } from "@/domain/fechas";

/** Carga todo lo necesario para alertas y tableros (memoizado por petición). */
export const cargarTodo = cache(async (repo: Repositorio) => {
  const [cotizaciones, operaciones, terceros, formularios, usuarios] = await Promise.all([
    repo.cotizaciones(),
    repo.operaciones(),
    repo.terceros(),
    repo.formularios170(),
    repo.usuarios(),
  ]);
  return { cotizaciones, operaciones, terceros, formularios, usuarios, hoy: hoyISO() };
});

export const cargarAlertas = cache(async (repo: Repositorio) => {
  const d = await cargarTodo(repo);
  return calcularAlertas(d);
});

export function situacionCliente(
  formularios: Awaited<ReturnType<typeof cargarTodo>>["formularios"],
  terceroId: string,
  hoy: string,
) {
  return situacion170(formularios.filter((f) => f.terceroId === terceroId), hoy);
}

/** Métricas del tablero comercial y financiero (RF-34). */
export async function metricasComerciales(repo: Repositorio) {
  const { cotizaciones, hoy } = await cargarTodo(repo);
  const mes = hoy.slice(0, 7);
  const ultimos30 = cotizaciones.filter((q) => diasEntre(q.fechaEmision, hoy) <= 30);
  const enviadas = ultimos30.filter((q) => q.estado !== "borrador");
  const aceptadas = ultimos30.filter((q) => q.estado === "aceptada");
  const decididas = ultimos30.filter((q) => q.estado === "aceptada" || q.estado === "rechazada");

  let ventas = 0;
  let utilidad = 0;
  for (const q of cotizaciones.filter((x) => x.estado === "aceptada")) {
    const t = totalesCotizacion({ ...q, monedaPresentacion: "COP" });
    ventas += t.venta;
    utilidad += t.utilidad;
  }
  const pendientes = cotizaciones.filter((q) => {
    const e = estadoEfectivo(q, hoy);
    return e === "enviada" || e === "vista";
  });
  const valorPendiente = pendientes.reduce(
    (s, q) => s + totalesCotizacion({ ...q, monedaPresentacion: "COP" }).venta,
    0,
  );

  return {
    mes,
    enviadas: enviadas.length,
    aceptadas: aceptadas.length,
    conversion: decididas.length ? aceptadas.length / decididas.length : 0,
    ventas,
    utilidad,
    margen: ventas ? utilidad / ventas : 0,
    pendientes: pendientes.length,
    valorPendiente,
  };
}
