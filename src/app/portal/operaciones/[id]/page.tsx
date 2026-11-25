import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Download, Mail } from "lucide-react";
import { contextoPortal } from "@/server/contexto";
import { avance, hitoActual } from "@/domain/operacion";
import { TIPOS_DOCUMENTO_DO, TIPOS_SERVICIO } from "@/domain/types";
import { tamanoLegible } from "@/domain/archivos";
import { EstadoDOBadge, IconoServicio } from "@/components/estados";
import { Progreso, Tarjeta, TarjetaEncabezado } from "@/components/ui";
import { cn, fecha, fechaHora } from "@/lib/formato";

export default async function OperacionCliente({ params }: PageProps<"/portal/operaciones/[id]">) {
  const { id } = await params;
  const repo = await contextoPortal();
  const op = await repo.operacion(id);
  if (!op) notFound();
  const [novedades, documentos] = await Promise.all([repo.novedades(op.id), repo.documentos(op.id)]);
  const actual = hitoActual(op);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
          <ArrowLeft className="size-3.5" /> Inicio
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          <span className="font-mono">{op.consecutivo}</span> <EstadoDOBadge estado={op.estado} />
        </h1>
      </div>

      <Tarjeta className="p-5">
        <div className="flex items-center gap-3">
          <IconoServicio tipo={op.tipo} />
          <div>
            <p className="font-medium">
              {op.origen} → {op.destino}
            </p>
            <p className="text-[13px] text-muted">{TIPOS_SERVICIO[op.tipo]} · abierta el {fecha(op.abiertoEl)}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>{actual ? `Siguiente: ${actual.nombre}` : "Operación completada"}</span>
            <span className="tabular">{Math.round(avance(op) * 100)}%</span>
          </div>
          <Progreso valor={avance(op)} />
        </div>
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Tarjeta>
          <TarjetaEncabezado titulo="Seguimiento" />
          <ol className="relative space-y-4 px-5 pb-5 before:absolute before:top-2 before:bottom-6 before:left-[30px] before:w-px before:bg-border">
            {op.hitos.map((h) => (
              <li key={h.id} className="relative pl-9">
                <span
                  className={cn(
                    "absolute top-0.5 left-0 flex size-[22px] items-center justify-center rounded-full ring-4 ring-surface",
                    h.real ? "bg-success text-white" : actual?.id === h.id ? "bg-brand" : "border-2 border-border-strong bg-surface",
                  )}
                >
                  {h.real && <Check className="size-3" strokeWidth={3} />}
                </span>
                <p className={cn("text-sm font-medium", !h.real && actual?.id !== h.id && "text-muted")}>{h.nombre}</p>
                <p className="text-xs text-subtle">
                  {h.real ? `Realizado ${fecha(h.real)}` : h.estimada ? `Estimado ${fecha(h.estimada)}` : "Por programar"}
                </p>
              </li>
            ))}
          </ol>
        </Tarjeta>

        <div className="space-y-6">
          <Tarjeta>
            <TarjetaEncabezado titulo="Novedades" descripcion="Lo que te hemos informado" />
            <div className="space-y-3 px-5 pb-5">
              {novedades.length === 0 ? (
                <p className="text-[13px] text-muted">Aún no hay novedades.</p>
              ) : (
                novedades.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border bg-surface-2 p-3">
                    <p className="flex items-center gap-2 text-[13px] font-medium">
                      <Mail className="size-3.5 text-brand-fg" /> {n.asunto}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">{n.resumen}</p>
                    <p className="mt-1.5 text-xs text-subtle">{fechaHora(n.fecha)}</p>
                  </div>
                ))
              )}
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado titulo="Documentos" />
            <div className="px-5 pb-5">
              {documentos.length === 0 ? (
                <p className="text-[13px] text-muted">Aún no hay documentos compartidos.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {documentos.map((d) => (
                    <li key={d.id}>
                      <a href={`/portal/archivos/${d.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{d.nombre}</span>
                          <span className="text-xs text-subtle">
                            {TIPOS_DOCUMENTO_DO[d.tipo as keyof typeof TIPOS_DOCUMENTO_DO] ?? d.tipo} · {tamanoLegible(d.tamano)}
                          </span>
                        </span>
                        <Download className="size-4 text-subtle" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
