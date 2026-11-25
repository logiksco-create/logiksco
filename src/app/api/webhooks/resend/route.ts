import { createHmac, timingSafeEqual } from "node:crypto";
import { modoDemo } from "@/lib/env";
import { clienteServicio } from "@/server/supabase/clientes";

/**
 * Acuses de Resend (entregado / abierto) para la trazabilidad (RF-38).
 * Firma Svix verificada con RESEND_WEBHOOK_SECRET; se rechaza todo lo demás.
 */
function firmaValida(cuerpo: string, h: Headers, secreto: string): boolean {
  const id = h.get("svix-id");
  const ts = h.get("svix-timestamp");
  const firmas = h.get("svix-signature");
  if (!id || !ts || !firmas) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5 min
  const clave = Buffer.from(secreto.replace(/^whsec_/, ""), "base64");
  const esperada = createHmac("sha256", clave).update(`${id}.${ts}.${cuerpo}`).digest();
  return firmas.split(" ").some((f) => {
    const [, valor] = f.split(",");
    const dada = Buffer.from(valor ?? "", "base64");
    return dada.length === esperada.length && timingSafeEqual(dada, esperada);
  });
}

export async function POST(request: Request) {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;
  if (!secreto || modoDemo) return new Response("No configurado", { status: 404 });
  const cuerpo = await request.text();
  if (!firmaValida(cuerpo, request.headers, secreto)) return new Response("Firma inválida", { status: 401 });

  const evento = JSON.parse(cuerpo) as { type?: string; created_at?: string; data?: { email_id?: string } };
  const columna = { "email.delivered": "entregado_el", "email.opened": "abierto_el" }[evento.type ?? ""];
  const id = evento.data?.email_id;
  if (!columna || !id) return new Response(null, { status: 204 });

  const { error } = await clienteServicio()
    .from("comunicaciones")
    .update({ [columna]: evento.created_at ?? new Date().toISOString() })
    .eq("proveedor_id_mensaje", id)
    .is(columna, null);
  if (error) {
    console.error("[webhook resend]", error.message);
    return new Response("Error", { status: 500 });
  }
  return new Response(null, { status: 204 });
}
