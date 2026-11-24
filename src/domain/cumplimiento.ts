import type { Formulario170 } from "./types";
import { diasEntre, sumarMeses } from "./fechas";

/** Situación de un cliente frente a la Circular 170 (RF-14, RF-18). */
export type Situacion170 =
  | { tipo: "sin_formulario" }
  | { tipo: "en_tramite"; formulario: Formulario170 }
  | { tipo: "vencido"; formulario: Formulario170; diasVencido: number }
  | { tipo: "por_vencer"; formulario: Formulario170; diasRestantes: number }
  | { tipo: "vigente"; formulario: Formulario170; diasRestantes: number };

/** Recordatorios antes del vencimiento, en días (RF-18). */
export const RECORDATORIOS_170 = [30, 15, 5] as const;

export function situacion170(
  formularios: Formulario170[],
  hoy: string,
): Situacion170 {
  if (formularios.length === 0) return { tipo: "sin_formulario" };
  const ultimo = [...formularios].sort((a, b) => b.version - a.version)[0];
  const aprobado = [...formularios]
    .filter((f) => f.estado === "aprobado" && f.vigenteHasta)
    .sort((a, b) => b.version - a.version)[0];

  if (aprobado) {
    const restantes = diasEntre(hoy, aprobado.vigenteHasta!);
    if (restantes < 0) {
      // Si hay una actualización en curso, se reporta como en trámite.
      if (ultimo.version > aprobado.version && ultimo.estado !== "rechazado") {
        return { tipo: "en_tramite", formulario: ultimo };
      }
      return { tipo: "vencido", formulario: aprobado, diasVencido: -restantes };
    }
    if (restantes <= RECORDATORIOS_170[0]) {
      return { tipo: "por_vencer", formulario: aprobado, diasRestantes: restantes };
    }
    return { tipo: "vigente", formulario: aprobado, diasRestantes: restantes };
  }
  if (ultimo.estado === "rechazado") {
    return { tipo: "vencido", formulario: ultimo, diasVencido: 0 };
  }
  return { tipo: "en_tramite", formulario: ultimo };
}

/** ¿El cliente puede abrir un DO hoy? (RF-19) */
export function habilitadoParaDO(s: Situacion170): boolean {
  return s.tipo === "vigente" || s.tipo === "por_vencer";
}

/** Al aceptar una cotización, ¿hay que pedir el formulario en línea? (RF-14) */
export function requiereFormulario(s: Situacion170): boolean {
  return s.tipo === "sin_formulario" || s.tipo === "vencido";
}

export function vigenciaAlAprobar(aprobadoEl: string, meses: number): string {
  return sumarMeses(aprobadoEl, meses);
}

/** Debe enviarse recordatorio hoy si faltan exactamente 30, 15 o 5 días. */
export function tocaRecordatorio(s: Situacion170): boolean {
  return (
    (s.tipo === "por_vencer" || s.tipo === "vigente") &&
    (RECORDATORIOS_170 as readonly number[]).includes(s.diasRestantes)
  );
}
