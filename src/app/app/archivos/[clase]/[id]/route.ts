import { NextResponse } from "next/server";
import { contexto } from "@/server/contexto";
import { ErrorNegocio } from "@/server/datos/errores";

/**
 * Descarga de un documento del DO o un soporte 170. Autoriza con la sesión
 * (RLS) y redirige a una URL firmada de 60 segundos.
 */
export async function GET(_: Request, { params }: RouteContext<"/app/archivos/[clase]/[id]">) {
  const { clase, id } = await params;
  if (clase !== "do" && clase !== "170") return new Response("No encontrado", { status: 404 });
  const repo = await contexto();
  try {
    const d = await repo.descargarArchivo(clase, id);
    if ("url" in d) return NextResponse.redirect(d.url);
    return new Response(new Uint8Array(d.bytes), {
      headers: {
        "Content-Type": d.mime,
        "Content-Disposition": `attachment; filename="${d.nombre.replace(/[^\w.\-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return new Response(e instanceof ErrorNegocio ? e.message : "Error", { status: 403 });
  }
}
