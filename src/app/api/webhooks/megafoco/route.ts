import { z } from "zod";
import { modoDemo } from "@/lib/env";
import { clienteServicio } from "@/server/supabase/clientes";
import { firmaMegafocoValida } from "@/server/megafoco";

/**
 * Estado de la factura desde Megafoco (RF-49). Firmado con
 * MEGAFOCO_WEBHOOK_SECRET en la cabecera x-megafoco-firma.
 */
const evento = z.object({
  idempotency_key: z.uuid(),
  estado: z.enum(["en_cola", "emitida", "rechazada"]),
  megafoco_id: z.string().optional(),
  numero: z.string().optional(),
  cufe: z.string().optional(),
  pdf_url: z.url().optional(),
  xml_url: z.url().optional(),
  error: z.string().optional(),
});

export async function POST(request: Request) {
  const secreto = process.env.MEGAFOCO_WEBHOOK_SECRET;
  if (!secreto || modoDemo) return new Response("No configurado", { status: 404 });
  const cuerpo = await request.text();
  if (!firmaMegafocoValida(cuerpo, request.headers.get("x-megafoco-firma"), secreto)) {
    return new Response("Firma inválida", { status: 401 });
  }
  const e = evento.safeParse(JSON.parse(cuerpo));
  if (!e.success) return new Response("Evento inválido", { status: 400 });
  const d = e.data;
  const { error } = await clienteServicio()
    .from("facturas")
    .update({
      estado: d.estado,
      megafoco_id: d.megafoco_id,
      numero: d.numero,
      cufe: d.cufe,
      pdf_url: d.pdf_url,
      xml_url: d.xml_url,
      error: d.estado === "rechazada" ? (d.error ?? "Rechazada por Finppi") : null,
    })
    .eq("id", d.idempotency_key)
    // Un estado final no retrocede.
    .not("estado", "eq", "emitida");
  if (error) {
    console.error("[webhook megafoco]", error.message);
    return new Response("Error", { status: 500 });
  }
  return new Response(null, { status: 204 });
}
