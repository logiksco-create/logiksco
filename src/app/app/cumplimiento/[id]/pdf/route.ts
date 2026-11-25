import { contexto } from "@/server/contexto";
import { pdfFormulario170 } from "@/server/pdf/formulario170";
import { respuestaPdf } from "@/server/pdf/respuesta";

export async function GET(_: Request, { params }: RouteContext<"/app/cumplimiento/[id]/pdf">) {
  const { id } = await params;
  const repo = await contexto();
  const f = (await repo.formularios170()).find((x) => x.id === id);
  if (!f) return new Response("No encontrado", { status: 404 });
  const cliente = await repo.tercero(f.terceroId);
  if (!cliente) return new Response("No encontrado", { status: 404 });
  const pdf = await pdfFormulario170({ f, empresa: repo.empresa, cliente });
  return respuestaPdf(pdf, `circular-170-${cliente.nit}-v${f.version}.pdf`);
}
