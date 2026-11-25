import { NextResponse } from "next/server";
import { contextoPortal } from "@/server/contexto";

export async function GET(_: Request, { params }: RouteContext<"/portal/archivos/[id]">) {
  const { id } = await params;
  const repo = await contextoPortal();
  try {
    const d = await repo.descargarDocumento(id);
    if ("url" in d) return NextResponse.redirect(d.url);
    return new Response(new Uint8Array(d.bytes), {
      headers: {
        "Content-Type": d.mime,
        "Content-Disposition": `attachment; filename="${d.nombre.replace(/[^\w.\-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Archivo no encontrado", { status: 404 });
  }
}
