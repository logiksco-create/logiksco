import type { Operacion } from "./types";
import { fechaLegible } from "./fechas";

/** Plantillas de solicitud a proveedores desde el DO (RF-25). */
export const PLANTILLAS_PROVEEDOR = {
  booking: "Solicitud de booking",
  tarifa: "Actualización de tarifa",
  carga_lista: "Confirmar carga lista",
  documentos: "Solicitud de documentos",
} as const;
export type PlantillaProveedor = keyof typeof PLANTILLAS_PROVEEDOR;

export function textoSolicitud(
  tipo: PlantillaProveedor,
  op: Operacion,
  extra: { concepto?: string; vigencia?: string; salida?: string } = {},
): { asunto: string; mensaje: string } {
  const ruta = `${op.origen} – ${op.destino}`;
  const ref = `Ref. ${op.consecutivo}`;
  switch (tipo) {
    case "booking":
      return {
        asunto: `${ref} · Solicitud de booking ${ruta}`,
        mensaje: `Buen día,\n\nPor favor confirmar booking para la operación ${op.consecutivo} (${ruta}). Agradecemos indicar fechas de cut-off, ETD y ETA.\n\nQuedamos atentos.`,
      };
    case "tarifa":
      return {
        asunto: `${ref} · Actualización de tarifa ${extra.concepto ?? ""}`.trim(),
        mensaje: `Buen día,\n\nLa tarifa de ${extra.concepto ?? "su servicio"} vence el ${extra.vigencia ? fechaLegible(extra.vigencia) : "—"} y la carga sale el ${extra.salida ? fechaLegible(extra.salida) : "—"}. ¿Nos confirman la tarifa vigente para esa fecha?\n\nGracias.`,
      };
    case "carga_lista":
      return {
        asunto: `${ref} · Confirmación de carga lista`,
        mensaje: `Buen día,\n\n¿Nos confirman la fecha en que la carga de la operación ${op.consecutivo} estará lista para recogida?\n\nGracias.`,
      };
    case "documentos":
      return {
        asunto: `${ref} · Solicitud de documentos`,
        mensaje: `Buen día,\n\nPor favor enviarnos los documentos de la operación ${op.consecutivo}: BL/AWB, factura comercial y lista de empaque.\n\nGracias.`,
      };
  }
}
