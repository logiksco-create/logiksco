import Link from "next/link";
import { ArrowRight, Check, Clock, Hourglass, TriangleAlert } from "lucide-react";
import { ETAPAS_FLUJO, ORDEN_ETAPAS, type EtapaFlujo, type PasoFlujo } from "@/domain/flujo";
import { NOMBRES_ROL, type Usuario } from "@/domain/types";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/formato";
import { BotonAbrirDO, BotonSolicitar170 } from "./acciones-cotizacion";

/** Quién: la persona responsable o, si no hay, los roles. */
export function quienResponde(p: PasoFlujo, usuarios: Pick<Usuario, "id" | "nombre">[]) {
  const persona = p.responsableId && usuarios.find((u) => u.id === p.responsableId);
  return persona ? persona.nombre : p.roles.map((r) => NOMBRES_ROL[r]).join(" u ");
}

function Dias({ p }: { p: PasoFlujo }) {
  if (p.dias === undefined || p.etapa === "completado") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular whitespace-nowrap",
        p.detenido ? "text-danger" : "text-subtle",
      )}
      title="Días en este paso"
    >
      {p.detenido ? <TriangleAlert className="size-3.5" /> : <Clock className="size-3.5" />}
      {p.dias === 0 ? "Hoy" : `${p.dias} d`}
    </span>
  );
}

/**
 * Paso a paso del negocio (cotización → factura) con la etapa actual
 * resaltada y, debajo, qué sigue y quién lo hace.
 */
export function PasoAPaso({
  paso,
  usuarios,
  className,
  accion = true,
}: {
  paso?: PasoFlujo;
  usuarios: Pick<Usuario, "id" | "nombre">[];
  className?: string;
  accion?: boolean;
}) {
  if (!paso) return null;
  const actual = ORDEN_ETAPAS.indexOf(paso.etapa);
  return (
    <section
      aria-label="Flujo del negocio"
      className={cn(
        "rounded-xl border bg-surface p-4 shadow-card sm:p-5",
        paso.detenido ? "border-danger/35" : "border-border",
        className,
      )}
    >
      <ol className="grid grid-cols-6 gap-1.5">
        {ORDEN_ETAPAS.map((e, i) => {
          const hecho = i < actual || paso.etapa === "completado";
          const ahora = i === actual && paso.etapa !== "completado";
          return (
            <li key={e} className="min-w-0" aria-current={ahora ? "step" : undefined}>
              <span
                className={cn(
                  "block h-1.5 rounded-full",
                  hecho ? "bg-success" : ahora ? (paso.detenido ? "bg-danger" : "bg-brand") : "bg-border",
                )}
              />
              <span
                className={cn(
                  "mt-2 flex items-center gap-1 truncate text-[11px] font-medium sm:text-xs",
                  hecho ? "text-success" : ahora ? "text-fg" : "text-subtle",
                )}
              >
                {hecho && <Check className="size-3 shrink-0" />}
                <span className="truncate sm:hidden">{ETAPAS_FLUJO[e].corto}</span>
                <span className="hidden truncate sm:inline">{ETAPAS_FLUJO[e].nombre}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {paso.etapa !== "completado" && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
              <span className="text-subtle">Sigue:</span> {paso.accion}
              <Dias p={paso} />
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {paso.esperaCliente ? (
                <>
                  <Hourglass className="mr-1 inline size-3.5 align-[-2px]" />
                  Depende del cliente · seguimiento de {quienResponde(paso, usuarios)}
                </>
              ) : (
                <>Responsable: {quienResponde(paso, usuarios)}</>
              )}
              {paso.detenido && <span className="font-medium text-danger"> · detenido</span>}
            </p>
          </div>
          {accion && <AccionPaso paso={paso} />}
        </div>
      )}
    </section>
  );
}

/** Botón para dar el paso ahí mismo (o ir a donde se da). */
export function AccionPaso({ paso, compacta }: { paso: PasoFlujo; compacta?: boolean }) {
  if (paso.accionRapida === "abrir_do" && paso.cotizacionId) return <BotonAbrirDO id={paso.cotizacionId} />;
  if (paso.accionRapida === "pedir_170" && paso.cotizacionId)
    return <BotonSolicitar170 id={paso.cotizacionId} etiqueta={compacta ? (paso.esperaCliente ? "Recordar 170" : "Pedir 170") : paso.esperaCliente ? "Recordarle al cliente" : undefined} />;
  if (paso.accionRapida === "enviar_cotizacion" && paso.cotizacionId && !compacta) return null;
  return (
    <Link
      href={paso.href}
      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-brand-fg hover:underline"
    >
      {compacta ? "Ir" : "Ir al paso"} <ArrowRight className="size-3.5" />
    </Link>
  );
}

/** Tarjeta de un negocio en el tablero o en «Tus siguientes pasos». */
export function TarjetaPaso({
  p,
  usuarios,
  mostrarEtapa,
}: {
  p: PasoFlujo;
  usuarios: Pick<Usuario, "id" | "nombre">[];
  mostrarEtapa?: boolean;
}) {
  const quien = quienResponde(p, usuarios);
  return (
    <article
      className={cn(
        "group relative rounded-lg border bg-surface p-3 shadow-card transition-colors hover:border-border-strong",
        p.detenido ? "border-danger/40" : "border-border",
      )}
    >
      {p.detenido && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-danger" aria-hidden />}
      <div className="flex items-start justify-between gap-2">
        <Link href={p.href} className="min-w-0 after:absolute after:inset-0 after:content-['']">
          <p className="truncate text-[13.5px] font-medium group-hover:text-brand-fg">{p.cliente}</p>
          <p className="truncate font-mono text-xs text-subtle">
            {p.referencia}
            {mostrarEtapa && <span className="font-sans"> · {ETAPAS_FLUJO[p.etapa].nombre}</span>}
          </p>
        </Link>
        <Dias p={p} />
      </div>
      <p className={cn("mt-2 text-[13px] font-medium", p.etapa === "completado" ? "text-success" : "text-fg")}>
        {p.esperaCliente && <Hourglass className="mr-1 inline size-3.5 align-[-2px] text-subtle" />}
        {p.accion}
      </p>
      <p className="line-clamp-2 text-xs text-muted">{p.detalle}</p>
      {p.etapa !== "completado" && (
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Avatar nombre={quien} className="size-5 text-[9px]" />
            <span className="truncate">{quien}</span>
          </span>
          {(p.accionRapida === "abrir_do" || (p.accionRapida === "pedir_170" && (!p.esperaCliente || p.detenido))) && (
            <span className="relative z-10 [&_button]:h-7 [&_button]:px-2.5 [&_button]:text-xs">
              <AccionPaso paso={p} compacta />
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/** Embudo con el número de negocios por etapa; cada etapa filtra el tablero. */
export function EmbudoFlujo({
  pasos,
  activa,
  href,
}: {
  pasos: PasoFlujo[];
  activa?: EtapaFlujo;
  href: (e?: EtapaFlujo) => string;
}) {
  return (
    <nav aria-label="Etapas" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {ORDEN_ETAPAS.map((e, i) => {
        const de = pasos.filter((p) => p.etapa === e);
        const detenidos = de.filter((p) => p.detenido).length;
        const sel = activa === e;
        return (
          <Link
            key={e}
            href={sel ? href() : href(e)}
            aria-current={sel ? "true" : undefined}
            className={cn(
              "relative min-w-0 rounded-xl border p-3 transition-colors",
              sel ? "border-brand bg-brand-soft" : "border-border bg-surface shadow-card hover:border-border-strong",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span className="flex size-4.5 items-center justify-center rounded-full bg-surface-2 text-[10px] tabular">{i + 1}</span>
              <span className="truncate sm:hidden">{ETAPAS_FLUJO[e].corto}</span>
              <span className="hidden truncate sm:inline">{ETAPAS_FLUJO[e].nombre}</span>
            </span>
            <span className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight tabular">{de.length}</span>
              {detenidos > 0 && (
                <span className="text-xs font-medium text-danger tabular">{detenidos} detenido{detenidos > 1 ? "s" : ""}</span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
