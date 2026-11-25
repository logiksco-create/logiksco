"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  ChartColumn,
  FileText,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings,
  Ship,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/formato";
import { Logo } from "../marca";

const principal = [
  { href: "/app", etiqueta: "Inicio", icono: LayoutDashboard, exacto: true },
  { href: "/app/cotizaciones", etiqueta: "Cotizaciones", icono: FileText },
  { href: "/app/operaciones", etiqueta: "Operaciones", icono: Ship },
  { href: "/app/clientes", etiqueta: "Clientes", icono: Building2 },
  { href: "/app/cumplimiento", etiqueta: "Circular 170", icono: ShieldCheck },
  { href: "/app/alertas", etiqueta: "Alertas", icono: Bell, contador: "alertas" as const },
  { href: "/app/facturacion", etiqueta: "Facturación", icono: Receipt },
  { href: "/app/reportes", etiqueta: "Reportes", icono: ChartColumn },
  { href: "/app/configuracion", etiqueta: "Configuración", icono: Settings },
];

function Enlaces({ alertas, alNavegar }: { alertas: number; alNavegar?: () => void }) {
  const ruta = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      <ul className="space-y-0.5">
        {principal.map((item) => {
          const activo = item.exacto ? ruta === item.href : ruta.startsWith(item.href);
          const Icono = item.icono;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={alNavegar}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition-colors",
                  activo
                    ? "bg-white/[0.08] text-white"
                    : "text-white/60 hover:bg-white/[0.04] hover:text-white",
                )}
              >
                {activo && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-[#6a83ff] to-[#14c8b4]" />
                )}
                <Icono className={cn("size-[17px]", activo ? "text-[#9fb0ff]" : "text-white/45 group-hover:text-white/70")} />
                <span className="flex-1">{item.etiqueta}</span>
                {item.contador && alertas > 0 && (
                  <span className="min-w-5 rounded-full bg-[#ff5d6c] px-1.5 text-center text-[11px] font-semibold leading-5 text-white tabular">
                    {alertas}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

    </nav>
  );
}

export function BarraLateral({
  alertas,
  empresa,
  pie,
}: {
  alertas: number;
  empresa: string;
  pie: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-[#0a0f1f] lg:flex">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_0%_0%,rgba(79,107,255,0.18),transparent_60%)]" />
      <div className="relative flex h-16 items-center px-5">
        <Link href="/app">
          <Logo claro />
        </Link>
      </div>
      <div className="relative mx-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
        <p className="text-[11px] uppercase tracking-wider text-white/35">Empresa</p>
        <p className="truncate text-[13px] font-medium text-white/90">{empresa}</p>
      </div>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Enlaces alertas={alertas} />
      </div>
      <div className="relative border-t border-white/[0.06] p-3">{pie}</div>
    </aside>
  );
}

export function NavegacionMovil({
  alertas,
  pie,
}: {
  alertas: number;
  pie: React.ReactNode;
}) {
  // El menú se cierra al navegar: se recuerda la ruta en la que se abrió.
  const ruta = usePathname();
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === ruta;
  const setAbierto = (v: boolean) => setAbiertoEn(v ? ruta : null);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="size-5" />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAbierto(false)} />
          <div className="animate-entrar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[#0a0f1f]">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo claro />
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="inline-flex size-9 items-center justify-center rounded-lg text-white/60 hover:bg-white/5"
                aria-label="Cerrar menú"
              >
                <X className="size-5" />
              </button>
            </div>
            <Enlaces alertas={alertas} alNavegar={() => setAbierto(false)} />
            <div className="border-t border-white/[0.06] p-3">{pie}</div>
          </div>
        </div>
      )}
    </>
  );
}
