import { contexto } from "@/server/contexto";
import { pdfTrazabilidad } from "@/server/pdf/trazabilidad";
import { respuestaPdf } from "@/server/pdf/respuesta";

export async function GET(_: Request, { params }: RouteContext<"/app/operaciones/[id]/trazabilidad">) {
  const { id } = await params;
  const repo = await contexto();
  const op = await repo.operacion(id);
  if (!op) return new Response("No encontrado", { status: 404 });
  const [cliente, comunicaciones] = await Promise.all([repo.tercero(op.clienteId), repo.comunicaciones("operacion", op.id)]);
  const pdf = await pdfTrazabilidad({ op, empresa: repo.empresa, cliente, comunicaciones });
  return respuestaPdf(pdf, `trazabilidad-${op.consecutivo}.pdf`);
}
