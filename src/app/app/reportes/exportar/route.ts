import { contexto } from "@/server/contexto";
import { exportarReporte, periodoDe } from "@/server/reportes";
import { hoyISO } from "@/domain/fechas";

/** Exporta un reporte como CSV que Excel abre directamente (RF-53). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reporte = url.searchParams.get("reporte") ?? "";
  const periodo = periodoDe(url.searchParams.get("periodo"));
  const repo = await contexto();
  const csv = await exportarReporte(repo, reporte, periodo);
  if (csv === null) return new Response("Reporte no disponible para tu rol", { status: 403 });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="logiks-${reporte}-${periodo}-${hoyISO()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
