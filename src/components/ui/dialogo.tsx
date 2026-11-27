"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/formato";

/** Diálogo modal nativo (accesible: Escape, foco atrapado, fondo). */
export function Dialogo({
  abierto,
  cerrar,
  titulo,
  descripcion,
  children,
  ancho = "max-w-2xl",
}: {
  abierto: boolean;
  cerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  ancho?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      onClose={cerrar}
      onClick={(e) => e.target === ref.current && cerrar()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        ancho,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-[13px] text-muted">{descripcion}</p>}
        </div>
        <button type="button" onClick={cerrar} className="rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto">{abierto ? children : null}</div>
    </dialog>
  );
}
