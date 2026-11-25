import { timingSafeEqual } from "node:crypto";
import { modoDemo } from "@/lib/env";
import { clienteServicio } from "@/server/supabase/clientes";
import { tareaDiaria } from "@/server/tareas";

/** Ejecutada por Vercel Cron cada mañana (ver vercel.json). Protegida con CRON_SECRET. */
export const maxDuration = 300;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || modoDemo) return new Response("No configurado", { status: 404 });
  const dada = Buffer.from(request.headers.get("authorization") ?? "");
  const esperada = Buffer.from(`Bearer ${secreto}`);
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) {
    return new Response("No autorizado", { status: 401 });
  }
  const r = await tareaDiaria(clienteServicio());
  if (r.errores.length) console.error("[tarea diaria]", r.errores);
  return Response.json(r);
}
