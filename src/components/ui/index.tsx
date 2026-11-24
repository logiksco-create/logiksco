import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn, iniciales } from "@/lib/formato";

/* ------------------------------------------------------------------ */
/* Botón                                                                */
/* ------------------------------------------------------------------ */

const variantes = {
  primario:
    "bg-brand text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(13_19_38/0.2)] hover:bg-brand-hover",
  secundario:
    "bg-surface text-fg border border-border hover:border-border-strong hover:bg-surface-2 shadow-card",
  fantasma: "text-muted hover:text-fg hover:bg-surface-2",
  peligro: "bg-danger text-white hover:opacity-90",
  exito: "bg-success text-white hover:opacity-90",
} as const;

const tamanos = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
} as const;

type BotonBase = {
  variante?: keyof typeof variantes;
  tamano?: keyof typeof tamanos;
};

export function clasesBoton({ variante = "primario", tamano = "md" }: BotonBase = {}) {
  return cn(
    "inline-flex items-center justify-center font-medium whitespace-nowrap transition-colors",
    "disabled:opacity-50 disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    variantes[variante],
    tamanos[tamano],
  );
}

export function Boton({
  variante,
  tamano,
  className,
  ...props
}: BotonBase & ComponentProps<"button">) {
  return <button className={cn(clasesBoton({ variante, tamano }), className)} {...props} />;
}

export function BotonLink({
  variante,
  tamano,
  className,
  ...props
}: BotonBase & ComponentProps<typeof Link>) {
  return <Link className={cn(clasesBoton({ variante, tamano }), className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Tarjetas                                                             */
/* ------------------------------------------------------------------ */

export function Tarjeta({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-surface shadow-card", className)}
      {...props}
    />
  );
}

export function TarjetaEncabezado({
  titulo,
  descripcion,
  accion,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-[13px] text-muted">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insignias                                                            */
/* ------------------------------------------------------------------ */

const tonos = {
  neutro: "bg-surface-2 text-muted ring-border",
  marca: "bg-brand-soft text-brand-fg ring-brand/20",
  exito: "bg-success-soft text-success ring-success/20",
  alerta: "bg-warning-soft text-warning ring-warning/25",
  peligro: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
} as const;
export type Tono = keyof typeof tonos;

export function Insignia({
  tono = "neutro",
  punto,
  className,
  children,
}: {
  tono?: Tono;
  punto?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        tonos[tono],
        className,
      )}
    >
      {punto && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Formularios                                                          */
/* ------------------------------------------------------------------ */

const campoBase =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle shadow-card transition-colors hover:border-border-strong focus:border-brand focus:outline-none focus:ring-3 focus:ring-[var(--ring)] disabled:opacity-60";

export function Entrada({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(campoBase, "h-9", className)} {...props} />;
}

export function Selector({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        campoBase,
        "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%238a92a6%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%238a92a6%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        className,
      )}
      {...props}
    />
  );
}

export function AreaTexto({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(campoBase, "min-h-20 py-2", className)} {...props} />;
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
  className,
}: {
  etiqueta: ReactNode;
  ayuda?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-[13px] font-medium text-fg">{etiqueta}</span>
      {children}
      {error ? (
        <span className="block text-xs text-danger">{error}</span>
      ) : (
        ayuda && <span className="block text-xs text-subtle">{ayuda}</span>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Tablas                                                               */
/* ------------------------------------------------------------------ */

export function Tabla({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-9 px-4 text-left text-xs font-medium uppercase tracking-wide text-subtle border-b border-border bg-surface-2 first:rounded-tl-xl last:rounded-tr-xl",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 border-b border-border align-middle", className)} {...props} />;
}

/* ------------------------------------------------------------------ */
/* Varios                                                               */
/* ------------------------------------------------------------------ */

const coloresAvatar = [
  "from-[#3b5bfd] to-[#7b5cff]",
  "from-[#0fb5a6] to-[#2f80ed]",
  "from-[#f5873a] to-[#e2456b]",
  "from-[#7b5cff] to-[#d04ed6]",
  "from-[#0f9d6b] to-[#0fb5a6]",
];

export function Avatar({ nombre, className }: { nombre: string; className?: string }) {
  const i = [...nombre].reduce((a, c) => a + c.charCodeAt(0), 0) % coloresAvatar.length;
  return (
    <span
      title={nombre}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-white",
        coloresAvatar[i],
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

export function Progreso({ valor, className }: { valor: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-[width]"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, valor)) * 100)}%` }}
      />
    </div>
  );
}

export function Vacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand-fg [&_svg]:size-5">
        {icono}
      </div>
      <p className="font-medium">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-sm text-muted">{descripcion}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Separador({ className }: { className?: string }) {
  return <div className={cn("h-px bg-border", className)} />;
}
