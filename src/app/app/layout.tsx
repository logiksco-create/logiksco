import Link from "next/link";
import { Bell, FlaskConical, LogOut, Plus, RotateCcw } from "lucide-react";
import { contexto } from "@/server/contexto";
import { modoDemo } from "@/lib/env";
import { crearSemilla } from "@/server/datos/demo/semilla";
import { cambiarUsuarioDemo, restablecerDemo } from "@/server/acciones/app";
import { salir } from "@/server/acciones/auth";
import { cargarAlertas } from "@/server/consultas";
import { BarraLateral, NavegacionMovil } from "@/components/app/navegacion";
import { Avatar, BotonLink } from "@/components/ui";

const nombresRol = {
  admin: "Administrador",
  comercial: "Comercial",
  operaciones: "Operaciones",
  cumplimiento: "Cumplimiento",
  contabilidad: "Contabilidad",
} as const;

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const repo = await contexto();
  const alertas = await cargarAlertas(repo);
  const { usuario, empresa } = repo;

  const pie = (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
        <Avatar nombre={usuario.nombre} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white/90">{usuario.nombre}</p>
          <p className="truncate text-xs text-white/40">
            {usuario.roles.map((r) => nombresRol[r]).join(" · ")}
          </p>
        </div>
      </div>
      {!modoDemo && (
        <form action={salir}>
          <button className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-white/50 hover:bg-white/5 hover:text-white">
            <LogOut className="size-3.5" /> Cerrar sesión
          </button>
        </form>
      )}
      {modoDemo && (
        <form action={cambiarUsuarioDemo} className="flex gap-1.5">
          <select
            name="usuario"
            defaultValue={usuario.id}
            aria-label="Ver como"
            className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white/80 [&>option]:text-black"
          >
            {crearSemilla().usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre.split(" ")[0]} · {nombresRol[u.roles[u.roles.length - 1]]}
              </option>
            ))}
          </select>
          <button className="h-8 rounded-md bg-white/10 px-2.5 text-xs font-medium text-white hover:bg-white/15">
            Ver como
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <BarraLateral alertas={alertas.length} empresa={empresa.razonSocial} pie={pie} />
      <div className="flex min-w-0 flex-1 flex-col">
        {modoDemo && (
          <div className="flex items-center justify-center gap-2 border-b border-brand/15 bg-brand-soft px-4 py-1.5 text-center text-xs text-brand-fg">
            <FlaskConical className="size-3.5 shrink-0" />
            <span>
              <strong className="font-semibold">Modo demo</strong> con datos del piloto. Los cambios viven
              en memoria.
            </span>
            <Link href="/portal" className="font-medium underline-offset-2 hover:underline">
              Ver portal del cliente
            </Link>
            <form action={restablecerDemo}>
              <button className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
                <RotateCcw className="size-3" /> Restablecer
              </button>
            </form>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <NavegacionMovil alertas={alertas.length} pie={pie} />
          <p className="truncate text-sm text-muted lg:hidden">{empresa.razonSocial}</p>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/app/alertas"
              className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              aria-label={`Alertas (${alertas.length})`}
            >
              <Bell className="size-[18px]" />
              {alertas.length > 0 && (
                <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger ring-2 ring-bg" />
              )}
            </Link>
            <BotonLink href="/app/cotizaciones/nueva" tamano="sm">
              <Plus /> <span className="hidden sm:inline">Nueva cotización</span>
            </BotonLink>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
