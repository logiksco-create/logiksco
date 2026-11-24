import type { ReactNode } from "react";
import { cn } from "@/lib/formato";

export function Encabezado({
  titulo,
  descripcion,
  acciones,
  antes,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  antes?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {antes}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

export function Indicador({
  etiqueta,
  valor,
  detalle,
  icono,
  tono = "marca",
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  icono: ReactNode;
  tono?: "marca" | "exito" | "alerta" | "info";
}) {
  const fondo = {
    marca: "bg-brand-soft text-brand-fg",
    exito: "bg-success-soft text-success",
    alerta: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
  }[tono];
  return (
    <div className="animate-entrar min-w-0 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] leading-tight font-medium text-muted">{etiqueta}</p>
        <span className={cn("hidden size-8 shrink-0 items-center sm:flex justify-center rounded-lg [&_svg]:size-4", fondo)}>
          {icono}
        </span>
      </div>
      <p className="mt-3 text-2xl leading-none font-semibold tracking-tight tabular sm:text-[28px]">{valor}</p>
      {detalle && <p className="mt-2 text-xs text-muted">{detalle}</p>}
    </div>
  );
}
