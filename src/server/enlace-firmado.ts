import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Enlace de aprobación FIRMADO para el PDF de cada cotización:
 *   f.<cotizacionId>.<version>.<firma>
 * No se guarda en la base: se verifica recalculando la firma (HMAC-SHA256).
 * Solo vale para esa versión de la cotización; si se edita (versión nueva)
 * o vence, deja de servir. No reemplaza ni invalida el enlace enviado por
 * correo, así que descargar el PDF no rompe nada.
 */
function secreto(): string {
  if (process.env.ENLACES_SECRET) return process.env.ENLACES_SECRET;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Derivado (nunca la llave tal cual) para no depender de otra variable.
  return base ? createHash("sha256").update(`logiks-enlaces|${base}`).digest("hex") : "demo-logiks-enlaces";
}

function firmar(id: string, version: number): string {
  return createHmac("sha256", secreto()).update(`cotizacion|${id}|${version}`).digest("base64url").slice(0, 32);
}

export function tokenFirmado(id: string, version: number): string {
  return `f.${id}.${version}.${firmar(id, version)}`;
}

export function esTokenFirmado(token: string): boolean {
  return token.startsWith("f.");
}

/** Devuelve la cotización y versión si la firma es válida; si no, null. */
export function verificarTokenFirmado(token: string): { id: string; version: number } | null {
  const m = token.match(/^f\.([0-9A-Za-z-]{1,64})\.(\d{1,5})\.([\w-]{32})$/);
  if (!m) return null;
  const [, id, v, firma] = m;
  const esperada = Buffer.from(firmar(id, Number(v)));
  const dada = Buffer.from(firma);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  return { id, version: Number(v) };
}
