/**
 * Utilidades de fechas en formato ISO de calendario (yyyy-mm-dd).
 * Se trabaja en UTC para que el resultado no dependa del huso del servidor.
 */

const DIA_MS = 86_400_000;

function aUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function hoyISO(ahora: Date = new Date()): string {
  // Colombia es UTC-5 todo el año (sin horario de verano).
  const co = new Date(ahora.getTime() - 5 * 3_600_000);
  return co.toISOString().slice(0, 10);
}

/** Días calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / DIA_MS);
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aUTC(iso) + dias * DIA_MS).toISOString().slice(0, 10);
}

export function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const objetivo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  objetivo.setUTCDate(Math.min(d, ultimoDia));
  return objetivo.toISOString().slice(0, 10);
}

const legibleFmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });

/** "27 nov" para mensajes de alertas y notificaciones. */
export function fechaLegible(iso: string): string {
  return legibleFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)).replace(".", "").replace(" de ", " ");
}
