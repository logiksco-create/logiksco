import { hostname } from "node:os";

/** Configuración por variables de entorno del servidor del bot (nunca en el repo). */
function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export const config = {
  supabaseUrl: requerida("SUPABASE_URL"),
  supabaseServiceKey: requerida("SUPABASE_SERVICE_ROLE_KEY"),
  /** URL pública de LOGIKS para avisar emisiones (POST /api/fe/notificar). */
  logiksUrl: process.env.LOGIKS_URL ?? "https://logiksco.vercel.app",
  /** Secreto compartido con LOGIKS para firmar los avisos (HMAC-SHA256). */
  secretoAvisos: process.env.FE_WORKER_SECRET ?? "",
  workerId: process.env.WORKER_ID ?? `bot-${hostname()}`,
  /**
   * Seguridad: mientras no sea exactamente "si", TODA emisión se ejecuta en
   * modo prueba (se detiene antes de «Enviar»). Se activa solo después de
   * validar la Fase 0 en una cuenta de pruebas.
   */
  permitirEmision: process.env.FE_PERMITIR_EMISION === "si",
  headless: process.env.HEADLESS !== "no",
  /** Bajo demanda (GitHub Actions): procesa la cola y termina. */
  unaVez: process.env.BOT_UNA_VEZ === "si",
  /** Tope de minutos encendido en modo bajo demanda. */
  maxMinutos: Number(process.env.BOT_MAX_MINUTOS ?? 15),
  /** Cada cuánto se busca trabajo y se envía el latido. */
  intervaloMs: Number(process.env.INTERVALO_MS ?? 4000),
};
