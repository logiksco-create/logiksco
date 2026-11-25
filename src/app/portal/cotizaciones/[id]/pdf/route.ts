import { contextoPortal } from "@/server/contexto";
import { pdfCotizacion } from "@/server/pdf/cotizacion";
import { respuestaPdf } from "@/server/pdf/respuesta";

export async function GET(_: Request, { params }: RouteContext<"/portal/cotizaciones/[id]/pdf">) {
  const { id } = await params;
  const repo = await contextoPortal();
  const q = await repo.cotizacion(id);
  if (!q) return new Response("No encontrada", { status: 404 });
  const pdf = await pdfCotizacion({ q, empresa: repo.empresa, cliente: repo.cliente });
  return respuestaPdf(pdf, `${q.consecutivo}-v${q.version}.pdf`, true);
}
