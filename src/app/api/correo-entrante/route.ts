import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { modoDemo } from "@/lib/env";
import { clienteServicio } from "@/server/supabase/clientes";
import { DOMINIO_ENTRANTE } from "@/server/buzon";

/**
 * Correo entrante al buzón del DO (RF-39). Cualquier proveedor de correo
 * entrante (Resend Inbound, Cloudflare Email Workers, Mailgun…) debe enviar
 * aquí un JSON firmado con HMAC-SHA256 (hex) del cuerpo en `x-logiks-firma`,
 * usando CORREO_ENTRANTE_SECRET:
 *   { "para": ["do-…@entrante…"], "de": "…", "asunto": "…", "texto": "…" }
 */
const correo = z.object({
  para: z.array(z.string()).min(1).max(50),
  de: z.string().max(320),
  asunto: z.string().max(500).default("(sin asunto)"),
  texto: z.string().max(200_000).default(""),
});

function firmaValida(cuerpo: string, firma: string | null, secreto: string) {
  if (!firma) return false;
  const esperada = createHmac("sha256", secreto).update(cuerpo).digest();
  const dada = Buffer.from(firma.replace(/^sha256=/, ""), "hex");
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}

export async function POST(request: Request) {
  const secreto = process.env.CORREO_ENTRANTE_SECRET;
  if (!secreto || modoDemo) return new Response("No configurado", { status: 404 });
  const cuerpo = await request.text();
  if (cuerpo.length > 300_000) return new Response("Demasiado grande", { status: 413 });
  if (!firmaValida(cuerpo, request.headers.get("x-logiks-firma"), secreto)) {
    return new Response("Firma inválida", { status: 401 });
  }
  const d = correo.safeParse(JSON.parse(cuerpo));
  if (!d.success) return new Response("Correo inválido", { status: 400 });

  // Solo direcciones do-<id>@<dominio entrante>.
  const buzones = d.data.para
    .map((p) => p.toLowerCase().match(/<?([a-z0-9-]+)@([a-z0-9.-]+)>?$/))
    .filter((m): m is RegExpMatchArray => !!m && m[2] === DOMINIO_ENTRANTE && /^do-[0-9a-f]{12}$/.test(m[1]))
    .map((m) => m[1]);
  if (buzones.length === 0) return new Response(null, { status: 204 });

  const db = clienteServicio();
  const { data: ops, error } = await db.from("operaciones").select("id, empresa_id, buzon").in("buzon", buzones);
  if (error) return new Response("Error", { status: 500 });
  for (const op of ops ?? []) {
    const { error: e } = await db.from("comunicaciones").insert({
      empresa_id: op.empresa_id,
      operacion_id: op.id,
      direccion: "entrante",
      de: d.data.de,
      para: [`${op.buzon}@${DOMINIO_ENTRANTE}`],
      asunto: d.data.asunto,
      cuerpo_html: d.data.texto.slice(0, 20_000),
    });
    if (e) console.error("[correo entrante]", e.message);
  }
  return new Response(null, { status: 204 });
}
