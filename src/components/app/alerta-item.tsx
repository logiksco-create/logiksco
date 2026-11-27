import Link from "next/link";
import { CalendarClock, CalendarPlus, FilePen, FileSearch, Receipt, ShieldQuestion, Ship, Clock, FileCheck2, FileWarning, ReceiptText, ShieldAlert, TriangleAlert, Plane } from "lucide-react";
import type { Alerta } from "@/domain/types";
import { cn } from "@/lib/formato";

const iconos = {
  tarifa_vencida: TriangleAlert,
  hito_atrasado: Clock,
  eta_proxima: Plane,
  cotizacion_por_vencer: FileWarning,
  f170_por_vencer: ShieldAlert,
  corte_facturacion: CalendarClock,
  factura_rechazada: ReceiptText,
  aceptacion_por_verificar: FileCheck2,
  cotizacion_sin_enviar: FilePen,
  f170_por_pedir: ShieldQuestion,
  f170_por_revisar: FileSearch,
  listo_para_do: Ship,
  do_sin_programar: CalendarPlus,
  do_por_facturar: Receipt,
} as const;

const severidad = {
  alta: { caja: "bg-danger-soft text-danger", texto: "Alta" },
  media: { caja: "bg-warning-soft text-warning", texto: "Media" },
  baja: { caja: "bg-info-soft text-info", texto: "Baja" },
} as const;

export function AlertaItem({ alerta, compacta }: { alerta: Alerta; compacta?: boolean }) {
  const Icono = iconos[alerta.tipo];
  const s = severidad[alerta.severidad];
  return (
    <Link
      href={alerta.href}
      className="group flex gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
    >
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", s.caja)}>
        <Icono className="size-4" aria-label={`Severidad ${s.texto}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium group-hover:text-brand-fg">{alerta.titulo}</span>
        <span className={cn("block text-[13px] text-muted", compacta && "line-clamp-2")}>
          {alerta.detalle}
        </span>
      </span>
    </Link>
  );
}
