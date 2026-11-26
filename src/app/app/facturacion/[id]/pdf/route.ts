import { contexto } from "@/server/contexto";
import { datosPdfFactura } from "@/server/fe-datos-pdf";
import { pdfFactura } from "@/server/pdf/factura";
import { respuestaPdf } from "@/server/pdf/respuesta";

/** PDF de LOGIKS de la factura (en la moneda negociada, con valores fiscales en COP). */
export async function GET(request: Request, { params }: RouteContext<"/app/facturacion/[id]/pdf">) {
  const { id } = await params;
  const repo = await contexto();
  const f = await repo.factura(id);
  if (!f) return new Response("No encontrada", { status: 404 });
  const datos = await datosPdfFactura(repo, f);
  if (!datos) return new Response("Cliente no encontrado", { status: 404 });
  const pdf = await pdfFactura(datos);
  const descargar = new URL(request.url).searchParams.has("descargar");
  return respuestaPdf(pdf, `Factura-${f.numero ?? `PF-${f.id.slice(0, 6)}`}.pdf`, descargar);
}
