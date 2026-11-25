import { ArrowDownLeft, ArrowUpRight, Eye } from "lucide-react";
import type { Comunicacion, EventoHistorial } from "@/domain/types";
import { cn, fechaHora } from "@/lib/formato";

export function Historial({ eventos }: { eventos: EventoHistorial[] }) {
  const lista = [...eventos].reverse();
  if (lista.length === 0) {
    return <p className="text-[13px] text-muted">El historial detallado lo ven Administración y Cumplimiento.</p>;
  }
  return (
    <ol className="relative space-y-4 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border">
      {lista.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={cn(
              "absolute top-1.5 -left-5 size-[11px] rounded-full border-2 border-surface",
              i === 0 ? "bg-brand" : "bg-border-strong",
            )}
          />
          <p className="text-[13px] font-medium">{e.accion}</p>
          <p className="text-xs text-subtle">
            {e.usuario} · {fechaHora(e.fecha)}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Trazabilidad de correos (RF-38 a RF-40): inmutable, solo se agrega. */
export function Comunicaciones({ items }: { items: Comunicacion[] }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-muted">Aún no hay correos registrados.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id} className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
                c.direccion === "saliente" ? "bg-brand-soft text-brand-fg" : "bg-success-soft text-success",
              )}
              title={c.direccion === "saliente" ? "Enviado" : "Recibido"}
            >
              {c.direccion === "saliente" ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{c.asunto}</p>
              <p className="truncate text-xs text-subtle">
                {c.direccion === "saliente" ? "Para" : "Recibido en"} {c.para.join(", ")} · {fechaHora(c.fecha)}
              </p>
              <p className="mt-1.5 text-[13px] text-muted">{c.resumen}</p>
              {c.entregadoEl && !c.abiertoEl && (
                <p className="mt-1.5 text-xs text-muted">Entregado {fechaHora(c.entregadoEl)}</p>
              )}
              {c.abiertoEl && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-success">
                  <Eye className="size-3" /> Abierto {fechaHora(c.abiertoEl)}
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
