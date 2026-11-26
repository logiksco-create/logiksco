import { contexto } from "@/server/contexto";
import { pdfFactura } from "@/server/pdf/factura";
import { respuestaPdf } from "@/server/pdf/respuesta";

/** PDF de LOGIKS de la factura (en la moneda negociada, con valores fiscales en COP). */
export async function GET(request: Request, { params }: RouteContext<"/app/facturacion/[id]/pdf">) {
  const { id } = await params;
  const repo = await contexto();
  const f = await repo.factura(id);
  if (!f) return new Response("No encontrada", { status: 404 });
  const [cliente, operaciones, cuenta] = await Promise.all([repo.tercero(f.clienteId), repo.operaciones(), repo.cuentaFe()]);
  if (!cliente) return new Response("Cliente no encontrado", { status: 404 });
  const pdf = await pdfFactura({ f, empresa: repo.empresa, cliente, operaciones, cuenta });
  const descargar = new URL(request.url).searchParams.has("descargar");
  return respuestaPdf(pdf, `Factura-${f.numero ?? `PF-${f.id.slice(0, 6)}`}.pdf`, descargar);
}
