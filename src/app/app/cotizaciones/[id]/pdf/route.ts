import { contexto } from "@/server/contexto";
import { env } from "@/lib/env";
import { tokenFirmado } from "@/server/enlace-firmado";
import { pdfCotizacion } from "@/server/pdf/cotizacion";
import { respuestaPdf } from "@/server/pdf/respuesta";

/** PDF de la cotización para el equipo (RF-05). Mismo contenido que ve el cliente. */
export async function GET(request: Request, { params }: RouteContext<"/app/cotizaciones/[id]/pdf">) {
  const { id } = await params;
  const repo = await contexto();
  const q = await repo.cotizacion(id);
  if (!q) return new Response("No encontrada", { status: 404 });
  const cliente = await repo.tercero(q.clienteId);
  if (!cliente) return new Response("Cliente no encontrado", { status: 404 });
  // Enlace firmado de aprobación de esta versión (no invalida el del correo).
  const enlace = `${env.appUrl}/c/${tokenFirmado(q.id, q.version)}`;
  const pdf = await pdfCotizacion({ q, empresa: repo.empresa, cliente, enlace });
  const descargar = new URL(request.url).searchParams.has("descargar");
  return respuestaPdf(pdf, `${q.consecutivo}-v${q.version}.pdf`, descargar);
}
