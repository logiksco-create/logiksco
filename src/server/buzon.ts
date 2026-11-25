import "server-only";
import type { Operacion } from "@/domain/types";

/**
 * Buzón por DO (RF-39): do-<id>@<dominio>. El dominio recibe correo entrante
 * y lo envía firmado a /api/correo-entrante.
 */
export const DOMINIO_ENTRANTE = process.env.CORREO_ENTRANTE_DOMINIO ?? "entrante.logiks.co";

export function buzonLocal(op: Pick<Operacion, "id" | "buzon">): string {
  return op.buzon ?? `do-${op.id.replaceAll("-", "").slice(0, 12)}`;
}

export function buzonCompleto(op: Pick<Operacion, "id" | "buzon">): string {
  return `${buzonLocal(op)}@${DOMINIO_ENTRANTE}`;
}
