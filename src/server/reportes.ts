import "server-only";
import type { Repositorio } from "./datos/repositorio";
import { cargarTodo } from "./consultas";
import { aCSV, calcularReportes, type Periodo, PERIODOS } from "@/domain/reportes";
import { tieneRol } from "./contexto";

export function periodoDe(v: unknown): Periodo {
  return typeof v === "string" && v in PERIODOS ? (v as Periodo) : "mes";
}

export async function reportesDe(repo: Repositorio, periodo: Periodo) {
  const d = await cargarTodo(repo);
  return calcularReportes({ ...d, periodo });
}

export const puedeVerFinanzas = (repo: Repositorio) => tieneRol(repo, "comercial", "contabilidad");
export const puedeVer170 = (repo: Repositorio) => tieneRol(repo, "cumplimiento", "comercial");

const SITUACION: Record<string, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencida",
  en_tramite: "En revisión",
  sin_formulario: "Sin formulario",
};

export async function exportarReporte(repo: Repositorio, reporte: string, periodo: Periodo) {
  const r = await reportesDe(repo, periodo);
  const ventas = (filas: typeof r.porCliente, etiqueta: string) =>
    aCSV(
      [etiqueta, "Operaciones", "Ventas (COP)", "Utilidad cotizada (COP)", "Utilidad real (COP)", "Margen real (%)"],
      filas.map((f) => [f.etiqueta, f.operaciones, f.ventas, f.utilidadCotizada, f.utilidadReal, f.margenReal * 100]),
    );
  switch (reporte) {
    case "clientes":
      return puedeVerFinanzas(repo) ? ventas(r.porCliente, "Cliente") : null;
    case "comerciales":
      return puedeVerFinanzas(repo) ? ventas(r.porComercial, "Comercial") : null;
    case "tipos":
      return puedeVerFinanzas(repo) ? ventas(r.porTipo, "Tipo de operación") : null;
    case "conversion":
      return puedeVerFinanzas(repo)
        ? aCSV(
            ["Comercial", "Enviadas", "Aceptadas", "Rechazadas", "Conversión (%)"],
            r.conversion.map((f) => [f.comercial, f.enviadas, f.aceptadas, f.rechazadas, f.conversion * 100]),
          )
        : null;
    case "circular170":
      return puedeVer170(repo)
        ? aCSV(
            ["Cliente", "NIT", "Estado", "Vigente hasta"],
            r.estado170.map((f) => [f.cliente, f.nit, SITUACION[f.situacion], f.vigenteHasta]),
          )
        : null;
    default:
      return null;
  }
}
