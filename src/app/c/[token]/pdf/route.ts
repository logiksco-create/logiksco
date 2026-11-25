import { repositorioPublico } from "@/server/contexto";
import { pdfCotizacion } from "@/server/pdf/cotizacion";
import { respuestaPdf } from "@/server/pdf/respuesta";

/** PDF descargable desde el enlace público de la cotización. */
export async function GET(_: Request, { params }: RouteContext<"/c/[token]/pdf">) {
  const { token } = await params;
  const v = await repositorioPublico().cotizacionPorToken(token);
  if (!v) return new Response("Enlace inválido o vencido", { status: 404 });
  const pdf = await pdfCotizacion({ q: v.cotizacion, empresa: v.empresa, cliente: v.cliente });
  return respuestaPdf(pdf, `${v.cotizacion.consecutivo}-v${v.cotizacion.version}.pdf`, true);
}
