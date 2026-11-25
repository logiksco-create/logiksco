import { repositorioPublico } from "@/server/contexto";
import { pdfCotizacion } from "@/server/pdf/cotizacion";
import { respuestaPdf } from "@/server/pdf/respuesta";
import { env } from "@/lib/env";

/** PDF descargable desde el enlace público de la cotización. */
export async function GET(_: Request, { params }: RouteContext<"/c/[token]/pdf">) {
  const { token } = await params;
  const v = await repositorioPublico().cotizacionPorToken(token);
  if (!v) return new Response("Enlace inválido o vencido", { status: 404 });
  const vigente = v.cotizacion.estado === "enviada" || v.cotizacion.estado === "vista";
  const pdf = await pdfCotizacion({
    q: v.cotizacion,
    empresa: v.empresa,
    cliente: v.cliente,
    enlace: vigente ? `${env.appUrl}/c/${token}` : undefined,
  });
  return respuestaPdf(pdf, `${v.cotizacion.consecutivo}-v${v.cotizacion.version}.pdf`, true);
}
