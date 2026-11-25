import Link from "next/link";
import { FlaskConical, LogOut } from "lucide-react";
import { contextoPortal } from "@/server/contexto";
import { modoDemo } from "@/lib/env";
import { accesosDemo } from "@/server/datos/demo/repositorio-demo";
import { verPortalComo } from "@/server/acciones/portal";
import { salir } from "@/server/acciones/auth";
import { Avatar } from "@/components/ui";
import { Isotipo } from "@/components/marca";

export const metadata = { title: { default: "Portal", template: "%s · Portal" } };

/** Portal del cliente final (RF-35): sus cotizaciones, DO, documentos y facturas. */
export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const repo = await contextoPortal();
  const accesos = modoDemo ? accesosDemo() : [];
  return (
    <div className="min-h-dvh bg-bg">
      {modoDemo && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-brand/15 bg-brand-soft px-4 py-1.5 text-xs text-brand-fg">
          <FlaskConical className="size-3.5" />
          <span>
            <strong>Portal del cliente</strong> en modo demo.
          </span>
          <form action={verPortalComo} className="flex items-center gap-1.5">
            <select name="acceso" defaultValue={repo.usuario.id} className="h-6 rounded border border-brand/20 bg-surface px-1 text-xs" aria-label="Ver como">
              {accesos.map((a) => (
                <option key={a.usuarioId} value={a.usuarioId}>
                  {a.nombre}
                </option>
              ))}
            </select>
            <button className="font-medium underline-offset-2 hover:underline">Ver como</button>
          </form>
          <Link href="/app" className="font-medium underline-offset-2 hover:underline">
            Volver al equipo
          </Link>
        </div>
      )}
      <header className="relative overflow-hidden bg-[#0a0f1f] text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
        <div
          className="pointer-events-none absolute -top-32 right-0 size-96 rounded-full opacity-30 blur-3xl"
          style={{ background: repo.empresa.colorPrimario }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <Link href="/portal" className="text-lg font-semibold tracking-tight">
            {repo.empresa.razonSocial}
          </Link>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
            {[
              ["/portal", "Inicio"],
              ["/portal#cotizaciones", "Cotizaciones"],
              ["/portal#operaciones", "Operaciones"],
              ["/portal#facturas", "Facturas"],
              ["/portal/circular-170", "Circular 170"],
            ].map(([href, l]) => (
              <Link key={href} href={href} className="shrink-0 rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white">
                {l}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium">{repo.usuario.nombre}</p>
              <p className="text-xs text-white/50">{repo.cliente.razonSocial}</p>
            </div>
            <Avatar nombre={repo.usuario.nombre} />
            {!modoDemo && (
              <form action={salir}>
                <button className="rounded-lg p-2 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Cerrar sesión">
                  <LogOut className="size-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-10 text-xs text-subtle sm:px-6">
        <Isotipo className="size-4" /> Portal seguro de {repo.empresa.razonSocial} · LOGIKS.CO
      </footer>
    </div>
  );
}
