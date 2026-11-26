import { createHmac, timingSafeEqual } from "node:crypto";
import { modoDemo, env } from "@/lib/env";
import { clienteServicio } from "@/server/supabase/clientes";
import { SupabaseRepositorio, mapEmpresa } from "@/server/datos/supabase/repositorio-supabase";
import { enviarFacturaAlCliente } from "@/server/fe-envio";

/**
 * El worker de facturación electrónica avisa aquí cuando una factura queda
 * emitida (o requiere revisión). Firmado con HMAC-SHA256 del cuerpo usando
 * FE_WORKER_SECRET. LOGIKS envía la factura al cliente si se pidió.
 */
const SISTEMA = { id: "00000000-0000-0000-0000-000000000000", nombre: "LOGIKS.CO", correo: "", roles: ["admin" as const, "contabilidad" as const] };

export async function POST(request: Request) {
  const secreto = process.env.FE_WORKER_SECRET;
  if (!secreto || modoDemo) return new Response("No configurado", { status: 404 });
  const cuerpo = await request.text();
  const firma = Buffer.from(request.headers.get("x-logiks-firma") ?? "");
  const esperada = Buffer.from(createHmac("sha256", secreto).update(cuerpo).digest("hex"));
  if (firma.length !== esperada.length || !timingSafeEqual(firma, esperada)) {
    return new Response("Firma inválida", { status: 401 });
  }
  let facturaId: string;
  try {
    facturaId = String((JSON.parse(cuerpo) as { facturaId?: unknown }).facturaId ?? "");
  } catch {
    return new Response("Cuerpo inválido", { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/.test(facturaId)) return new Response("Factura inválida", { status: 400 });

  const sv = clienteServicio();
  const { data: fila } = await sv.from("facturas").select("empresa_id").eq("id", facturaId).maybeSingle();
  if (!fila) return new Response("No encontrada", { status: 404 });
  const { data: emp } = await sv.from("empresas").select("*").eq("id", fila.empresa_id).single();
  const repo = new SupabaseRepositorio(sv, mapEmpresa(emp), SISTEMA, () => sv, env.appUrl);
  const f = await repo.factura(facturaId);
  if (!f) return new Response("No encontrada", { status: 404 });

  if (f.estado === "emitida" && f.enviarAlEmitir && !f.enviadaClienteEl) {
    try {
      const r = await enviarFacturaAlCliente(repo, f);
      return Response.json({ ok: true, enviado: r.enviado });
    } catch (e) {
      console.error("[fe notificar]", e instanceof Error ? e.message : e);
      return Response.json({ ok: false, error: "No se pudo enviar al cliente" }, { status: 500 });
    }
  }
  return Response.json({ ok: true, enviado: false });
}
