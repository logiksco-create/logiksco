import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { contextoPortal } from "@/server/contexto";
import { convertir, estadoEfectivo, totalesConceptos } from "@/domain/cotizacion";
import { hoyISO } from "@/domain/fechas";
import { BLOQUES, TIPOS_SERVICIO, type Bloque } from "@/domain/types";
import { EstadoCotizacionBadge } from "@/components/estados";
import { Tarjeta, clasesBoton } from "@/components/ui";
import { dinero, fecha, numero } from "@/lib/formato";

export default async function CotizacionCliente({ params }: PageProps<"/portal/cotizaciones/[id]">) {
  const { id } = await params;
  const repo = await contextoPortal();
  const q = await repo.cotizacion(id);
  if (!q) notFound();
  const mon = q.monedaPresentacion;
  const bloques = (Object.keys(BLOQUES) as Bloque[]).filter((b) => q.conceptos.some((c) => c.bloque === b));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/portal" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Inicio
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="font-mono">{q.consecutivo}</span> <EstadoCotizacionBadge estado={estadoEfectivo(q, hoyISO())} />
          </h1>
          <p className="mt-1 text-sm text-muted">
            {TIPOS_SERVICIO[q.tipoServicio]} · {q.origen} → {q.destino} · válida hasta {fecha(q.vigenteHasta)}
          </p>
        </div>
        <a href={`/portal/cotizaciones/${q.id}/pdf`} className={clasesBoton({ variante: "secundario" })}>
          <Download /> PDF
        </a>
      </div>
      <Tarjeta>
        <div className="divide-y divide-border">
          {bloques.map((b) => (
            <div key={b} className="px-5 py-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{BLOQUES[b]}</p>
              {q.conceptos
                .filter((c) => c.bloque === b)
                .map((c) => (
                  <div key={c.id} className="flex justify-between gap-4 py-1 text-sm">
                    <span>
                      {c.descripcion}
                      {c.cantidad !== 1 && <span className="text-muted"> × {numero(c.cantidad, 2)}</span>}
                    </span>
                    <span className="tabular">{dinero(convertir(c.ventaUnitaria * c.cantidad, c.moneda, mon, q.trm), mon)}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-b-xl border-t border-border bg-surface-2 px-5 py-4">
          <span className="font-semibold">Total</span>
          <span className="text-xl font-semibold tabular">{dinero(totalesConceptos(q.conceptos, mon, q.trm).venta, mon)}</span>
        </div>
      </Tarjeta>
      {q.estado === "enviada" || q.estado === "vista" ? (
        <p className="text-[13px] text-muted">Para aceptarla usa el enlace que te enviamos por correo.</p>
      ) : null}
    </div>
  );
}
