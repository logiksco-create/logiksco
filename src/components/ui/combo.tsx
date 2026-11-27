"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/formato";

export interface OpcionCombo {
  valor: string;
  etiqueta: string;
  /** Texto secundario (NIT, código, bloque…). */
  detalle?: string;
  /** Título de grupo (se muestra al cambiar). */
  grupo?: string;
}

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Lista desplegable con búsqueda (combobox accesible). Sustituye al <select>
 * y al <datalist> nativos, que según el sistema se ven en blanco o «flotan».
 *
 * - `libre`: se puede escribir un texto que no esté en la lista (p. ej. un
 *   concepto nuevo). Sin `libre`, solo vale elegir una opción.
 * - `crear`: agrega al final «+ Crear …» con el texto buscado.
 */
export function Combo({
  valor,
  opciones,
  alElegir,
  alEscribir,
  libre,
  crear,
  placeholder = "Buscar…",
  vacio = "Sin resultados",
  className,
  ariaLabel,
  deshabilitado,
}: {
  /** En modo normal: valor de la opción elegida. En modo libre: el texto. */
  valor: string;
  opciones: OpcionCombo[];
  alElegir: (o: OpcionCombo) => void;
  alEscribir?: (texto: string) => void;
  libre?: boolean;
  crear?: { etiqueta: (texto: string) => string; alCrear: (texto: string) => void };
  placeholder?: string;
  vacio?: string;
  className?: string;
  ariaLabel?: string;
  deshabilitado?: boolean;
}) {
  const id = useId();
  const caja = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [activo, setActivo] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arriba: boolean } | null>(null);

  const elegida = libre ? undefined : opciones.find((o) => o.valor === valor);
  const texto = libre ? valor : abierto ? busqueda : elegida?.etiqueta ?? "";
  const filtro = normal(libre ? valor : busqueda);

  const visibles = useMemo(() => {
    const f = filtro.trim();
    const lista = f ? opciones.filter((o) => normal(`${o.etiqueta} ${o.detalle ?? ""}`).includes(f)) : opciones;
    return lista.slice(0, 80);
  }, [opciones, filtro]);
  const textoCrear = (libre ? valor : busqueda).trim();
  const conCrear = !!crear;
  const total = visibles.length + (conCrear ? 1 : 0);

  const [capa, setCapa] = useState<HTMLElement>();
  // Posición del panel (en el body, para no quedar recortado por tarjetas).
  const ubicar = () => {
    setCapa(caja.current?.closest("dialog") ?? document.body);
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    const abajo = window.innerHeight - r.bottom;
    const arriba = abajo < 260 && r.top > abajo;
    setPos({ top: arriba ? r.top - 4 : r.bottom + 4, left: r.left, width: r.width, arriba });
  };
  useEffect(() => {
    if (!abierto) return;
    ubicar();
    const f = () => ubicar();
    window.addEventListener("scroll", f, true);
    window.addEventListener("resize", f);
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!caja.current?.contains(t) && !document.getElementById(`${id}-lista`)?.contains(t)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => {
      window.removeEventListener("scroll", f, true);
      window.removeEventListener("resize", f);
      document.removeEventListener("mousedown", fuera);
    };
  }, [abierto, id]);

  const abrir = () => {
    if (deshabilitado) return;
    setBusqueda("");
    setActivo(0);
    setAbierto(true);
  };
  const elegir = (o: OpcionCombo) => {
    alElegir(o);
    setAbierto(false);
    setBusqueda("");
  };
  const ejecutarCrear = () => {
    crear?.alCrear(textoCrear);
    setAbierto(false);
  };

  return (
    <div ref={caja} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-9 w-full items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-sm text-fg shadow-card transition-colors hover:border-border-strong focus-within:border-brand focus-within:ring-3 focus-within:ring-[var(--ring)]",
          deshabilitado && "pointer-events-none opacity-60",
        )}
        onClick={() => {
          if (!abierto) abrir();
          entrada.current?.focus();
        }}
      >
        {abierto && !libre && <Search className="size-3.5 shrink-0 text-subtle" />}
        <input
          ref={entrada}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          disabled={deshabilitado}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-subtle"
          placeholder={abierto && !libre ? "Escribe para buscar…" : placeholder}
          value={texto}
          onFocus={() => !abierto && abrir()}
          onChange={(e) => {
            if (libre) alEscribir?.(e.target.value);
            else setBusqueda(e.target.value);
            setActivo(0);
            if (!abierto) setAbierto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!abierto) abrir();
              else setActivo((a) => Math.min(a + 1, total - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && abierto) {
              e.preventDefault();
              if (activo < visibles.length) elegir(visibles[activo]);
              else if (conCrear) ejecutarCrear();
            } else if (e.key === "Escape" || e.key === "Tab") {
              setAbierto(false);
            }
          }}
        />
        <ChevronDown className={cn("size-4 shrink-0 text-subtle transition-transform", abierto && "rotate-180")} />
      </div>

      {abierto &&
        pos &&
        createPortal(
          <ul
            id={`${id}-lista`}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              width: Math.max(pos.width, 240),
              ...(pos.arriba ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            className="z-[100] max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm text-fg shadow-[var(--shadow-pop)]"
          >
            {visibles.length === 0 && !conCrear && <li className="px-3 py-2 text-[13px] text-subtle">{vacio}</li>}
            {visibles.map((o, i) => (
              <li key={`${o.valor}-${i}`}>
                {o.grupo && (i === 0 || visibles[i - 1].grupo !== o.grupo) && (
                  <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">{o.grupo}</p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activo}
                  onMouseEnter={() => setActivo(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(o)}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left", i === activo ? "bg-brand-soft text-brand-fg" : "hover:bg-surface-2")}
                >
                  <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
                  {o.detalle && <span className="shrink-0 font-mono text-[11px] text-subtle">{o.detalle}</span>}
                  {!libre && o.valor === valor && <Check className="size-3.5 shrink-0" />}
                </button>
              </li>
            ))}
            {conCrear && (
              <li className={cn(visibles.length > 0 && "mt-1 border-t border-border pt-1")}>
                <button
                  type="button"
                  role="option"
                  aria-selected={activo === visibles.length}
                  onMouseEnter={() => setActivo(visibles.length)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={ejecutarCrear}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium text-brand-fg",
                    activo === visibles.length ? "bg-brand-soft" : "hover:bg-surface-2",
                  )}
                >
                  <Plus className="size-3.5" /> {crear!.etiqueta(textoCrear)}
                </button>
              </li>
            )}
          </ul>,
          // Dentro de un <dialog> modal la lista debe ir en el mismo diálogo
          // (capa superior); en el body quedaría oculta detrás.
          capa ?? document.body,
        )}
    </div>
  );
}
