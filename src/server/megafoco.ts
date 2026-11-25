import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ErrorNegocio } from "./datos/errores";

/**
 * Cliente de la API de Megafoco (contrato borrador del PRD):
 *  - POST /v1/terceros        crear o actualizar tercero
 *  - POST /v1/facturas        crear factura (Idempotency-Key = id de la prefactura)
 *  - webhook firmado          en_cola | emitida | rechazada (+ número, CUFE, PDF, XML)
 * Megafoco encola la emisión y su bot la hace en Finppi; LOGIKS no guarda
 * credenciales de Finppi.
 */
const URL_API = process.env.MEGAFOCO_API_URL?.replace(/\/$/, "");

export const megafocoDisponible = () => !!URL_API;

async function llamar(llave: string, ruta: string, cuerpo: unknown, idempotencia?: string) {
  if (!URL_API) throw new ErrorNegocio("La integración con Megafoco aún no está habilitada en esta instalación.");
  const r = await fetch(`${URL_API}${ruta}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llave}`,
      "Content-Type": "application/json",
      ...(idempotencia ? { "Idempotency-Key": idempotencia } : {}),
    },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(20_000),
  });
  const d = (await r.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
  if (r.status === 401 || r.status === 403) throw new ErrorNegocio("Megafoco rechazó la llave de API. Revísala en Configuración.");
  if (!r.ok) throw new ErrorNegocio(`Megafoco respondió ${r.status}: ${d.message ?? d.error ?? "error"}`);
  return d;
}

export async function crearTerceroMegafoco(llave: string, t: { nit: string; razon_social: string; correo?: string }) {
  return llamar(llave, "/v1/terceros", t);
}

export async function crearFacturaMegafoco(llave: string, payload: { idempotency_key: string } & Record<string, unknown>) {
  const d = await llamar(llave, "/v1/facturas", payload, payload.idempotency_key);
  return { id: d.id };
}

/** Verifica la firma HMAC-SHA256 (hex) del webhook de Megafoco. */
export function firmaMegafocoValida(cuerpo: string, firma: string | null, secreto: string): boolean {
  if (!firma) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest();
  const dada = Buffer.from(firma.replace(/^sha256=/, ""), "hex");
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}
