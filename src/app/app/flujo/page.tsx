import Link from "next/link";
import { CircleCheck, Workflow } from "lucide-react";
import { contexto } from "@/server/contexto";
import { cargarFlujo, cargarTodo } from "@/server/consultas";
import { ETAPAS_FLUJO, ORDEN_ETAPAS, esMio, type EtapaFlujo } from "@/domain/flujo";
import { Encabezado } from "@/components/app/encabezado";
import { EmbudoFlujo, TarjetaPaso } from "@/components/app/flujo";
import { Tarjeta, Vacio } from "@/components/ui";
import { cn } from "@/lib/formato";

export const metadata = { title: "Flujo de clientes" };

const VISTAS = {
  mios: "Mis pendientes",
  detenidos: "Detenidos",
  todos: "Todos",
} as const;
type Vista = keyof typeof VISTAS;

const AYUDA: Record<EtapaFlujo, string> = {
  cotizacion: "Comercial cotiza, envía y hace seguimiento.",
  circular170: "Comercial pide la 170 · Cumplimiento la aprueba.",
  abrir_do: "Operaciones o Comercial abre el DO.",
  operacion: "El responsable del DO actualiza los hitos.",
  facturacion: "Contabilidad prefactura y emite.",
  completado: "Facturados en los últimos 30 días.",
};

export default async function Flujo({ searchParams }: PageProps<"/app/flujo">) {
  const sp = await searchParams;
  const repo = await contexto();
  const [pasos, { usuarios }] = await Promise.all([cargarFlujo(repo), cargarTodo(repo)]);
  const u = repo.usuario;
  const mios = pasos.filter((p) => esMio(p, u));
  const porDefecto: Vista = u.roles.includes("admin") || mios.length === 0 ? "todos" : "mios";
  const vista: Vista = typeof sp.ver === "string" && sp.ver in VISTAS ? (sp.ver as Vista) : porDefecto;
  const etapa = typeof sp.etapa === "string" && sp.etapa in ETAPAS_FLUJO ? (sp.etapa as EtapaFlujo) : undefined;

  const base = vista === "mios" ? mios : vista === "detenidos" ? pasos.filter((p) => p.detenido) : pasos;
  const visibles = etapa ? base.filter((p) => p.etapa === etapa) : base;
  const columnas = etapa ? [etapa] : ORDEN_ETAPAS;
  const enlace = (q: { ver?: Vista; etapa?: EtapaFlujo }) => {
    const u = new URLSearchParams();
    const v = q.ver ?? vista;
    if (v !== porDefecto) u.set("ver", v);
    if (q.etapa) u.set("etapa", q.etapa);
    const s = u.toString();
    return `/app/flujo${s ? `?${s}` : ""}`;
  };
  const detenidos = pasos.filter((p) => p.detenido).length;

  return (
    <>
      <Encabezado
        titulo="Flujo de clientes"
        descripcion="Cada negocio, de la cotización a la factura: en qué etapa va, qué sigue y quién lo hace."
      />

      <EmbudoFlujo pasos={base} activa={etapa} href={(e) => enlace({ etapa: e })} />

      <div className="mt-5 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Vista" className="inline-flex rounded-lg border border-border bg-surface p-0.5 shadow-card">
          {(Object.keys(VISTAS) as Vista[]).map((v) => {
            const n = v === "mios" ? mios.length : v === "detenidos" ? detenidos : pasos.length;
            return (
              <Link
                key={v}
                role="tab"
                aria-selected={v === vista}
                href={enlace({ ver: v, etapa })}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
                  v === vista ? "bg-brand text-white" : "text-muted hover:text-fg",
                )}
              >
                {VISTAS[v]}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular",
                    v === vista ? "bg-white/20" : v === "detenidos" && n ? "bg-danger-soft text-danger" : "bg-surface-2",
                  )}
                >
                  {n}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="text-xs text-subtle">
          <span className="mr-1 inline-block size-2 rounded-full bg-danger align-middle" /> Detenido: lleva más tiempo del esperado en el paso.
        </p>
      </div>

      {visibles.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono={vista === "mios" ? <CircleCheck /> : <Workflow />}
            titulo={vista === "mios" ? "No tienes pasos pendientes" : vista === "detenidos" ? "Nada detenido" : "Sin negocios en esta etapa"}
            descripcion={vista === "mios" ? "Cuando un negocio necesite algo de ti, aparecerá aquí y en tus alertas." : undefined}
          />
        </Tarjeta>
      ) : (
        <div
          className={cn(
            "-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0",
            etapa && "block",
          )}
        >
          {columnas.map((e) => {
            const lista = visibles.filter((p) => p.etapa === e);
            return (
              <section
                key={e}
                aria-label={ETAPAS_FLUJO[e].nombre}
                className={cn(
                  "flex shrink-0 snap-start flex-col rounded-xl bg-surface-2 p-2.5 ring-1 ring-border ring-inset",
                  etapa ? "w-full" : lista.length ? "w-[78vw] sm:w-72" : "w-[60vw] sm:w-48",
                )}
              >
                <header className="px-1 pt-0.5 pb-2.5">
                  <h2 className="flex items-center justify-between text-[13px] font-semibold">
                    {ETAPAS_FLUJO[e].nombre}
                    <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted tabular ring-1 ring-border">{lista.length}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-subtle">{AYUDA[e]}</p>
                </header>
                {lista.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">Vacío</p>
                ) : (
                  <div className={cn("grid gap-2", etapa && "sm:grid-cols-2 xl:grid-cols-3")}>
                    {lista.map((p) => (
                      <TarjetaPaso key={p.id} p={p} usuarios={usuarios} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
