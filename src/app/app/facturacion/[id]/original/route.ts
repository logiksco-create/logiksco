import { createHash } from "node:crypto";
import { contexto } from "@/server/contexto";
import { ErrorNegocio } from "@/server/datos/errores";

/**
 * PDF o XML original de Finppi, byte a byte. Antes de entregarlo se
 * recalcula el SHA-256: si no coincide con el guardado al descargarlo, no se
 * ofrece (alerta de integridad, §9B.4).
 */
export async function GET(request: Request, { params }: RouteContext<"/app/facturacion/[id]/original">) {
  const { id } = await params;
  const tipo = new URL(request.url).searchParams.get("tipo") === "xml" ? "xml" : "pdf";
  const repo = await contexto();
  try {
    const f = await repo.factura(id);
    const d = await repo.descargarArchivoFe(id, tipo);
    if (!f || !d || !("bytes" in d)) return new Response("No disponible", { status: 404 });
    if (tipo === "pdf" && f.pdfFinppiSha256) {
      const hash = createHash("sha256").update(d.bytes).digest("hex");
      if (hash !== f.pdfFinppiSha256) {
        return new Response("Alerta de integridad: el PDF guardado no coincide con el descargado de Finppi.", { status: 409 });
      }
    }
    return new Response(new Uint8Array(d.bytes), {
      headers: {
        "Content-Type": d.mime,
        "Content-Disposition": `${tipo === "pdf" ? "inline" : "attachment"}; filename="${d.nombre.replace(/[^\w.\-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return new Response(e instanceof ErrorNegocio ? e.message : "Error", { status: 403 });
  }
}
