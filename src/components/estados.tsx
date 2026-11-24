import {
  Anchor,
  Container,
  FileCheck2,
  Package,
  Plane,
  Route,
  ShieldCheck,
  Truck,
} from "lucide-react";
import {
  ESTADOS_170,
  ESTADOS_COTIZACION,
  ESTADOS_DO,
  TIPOS_SERVICIO,
  type Estado170,
  type EstadoCotizacion,
  type EstadoDO,
  type TipoServicio,
} from "@/domain/types";
import type { Situacion170 } from "@/domain/cumplimiento";
import { Insignia, type Tono } from "./ui";
import { cn } from "@/lib/formato";

const tonoCotizacion: Record<EstadoCotizacion, Tono> = {
  borrador: "neutro",
  enviada: "info",
  vista: "marca",
  aceptada: "exito",
  rechazada: "peligro",
  vencida: "alerta",
};

export function EstadoCotizacionBadge({ estado }: { estado: EstadoCotizacion }) {
  return (
    <Insignia tono={tonoCotizacion[estado]} punto>
      {ESTADOS_COTIZACION[estado]}
    </Insignia>
  );
}

const tonoDO: Record<EstadoDO, Tono> = {
  abierto: "info",
  en_transito: "marca",
  en_destino: "alerta",
  entregado: "exito",
  cerrado: "neutro",
};

export function EstadoDOBadge({ estado }: { estado: EstadoDO }) {
  return (
    <Insignia tono={tonoDO[estado]} punto>
      {ESTADOS_DO[estado]}
    </Insignia>
  );
}

const tono170: Record<Estado170, Tono> = {
  pendiente: "neutro",
  en_revision: "info",
  devuelto: "alerta",
  aprobado: "exito",
  rechazado: "peligro",
};

export function Estado170Badge({ estado }: { estado: Estado170 }) {
  return <Insignia tono={tono170[estado]}>{ESTADOS_170[estado]}</Insignia>;
}

export function Situacion170Badge({ s }: { s: Situacion170 }) {
  switch (s.tipo) {
    case "vigente":
      return (
        <Insignia tono="exito">
          <ShieldCheck className="size-3" /> Vigente
        </Insignia>
      );
    case "por_vencer":
      return <Insignia tono="alerta">Vence en {s.diasRestantes} d</Insignia>;
    case "vencido":
      return <Insignia tono="peligro">Vencida</Insignia>;
    case "en_tramite":
      return (
        <Insignia tono="info">
          <FileCheck2 className="size-3" /> En revisión
        </Insignia>
      );
    default:
      return <Insignia tono="neutro">Sin formulario</Insignia>;
  }
}

const iconosServicio: Record<TipoServicio, typeof Plane> = {
  aereo: Plane,
  maritimo_fcl: Container,
  maritimo_lcl: Anchor,
  terrestre: Truck,
  aduana: FileCheck2,
  seguro: ShieldCheck,
  multimodal: Route,
};

const colorServicio: Record<TipoServicio, string> = {
  aereo: "bg-[#eaf2fe] text-[#2f80ed] dark:bg-[#0f2340]",
  maritimo_fcl: "bg-brand-soft text-brand-fg",
  maritimo_lcl: "bg-[#e9f8f6] text-[#0d9488] dark:bg-[#0b2a27]",
  terrestre: "bg-warning-soft text-warning",
  aduana: "bg-[#f3efff] text-[#7b5cff] dark:bg-[#211a3d]",
  seguro: "bg-success-soft text-success",
  multimodal: "bg-[#fdeef4] text-[#d0467a] dark:bg-[#2f1422]",
};

export function IconoServicio({ tipo, className }: { tipo: TipoServicio; className?: string }) {
  const Icono = iconosServicio[tipo] ?? Package;
  return (
    <span
      title={TIPOS_SERVICIO[tipo]}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
        colorServicio[tipo],
        className,
      )}
    >
      <Icono />
    </span>
  );
}
