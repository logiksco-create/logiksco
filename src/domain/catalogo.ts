import base from "./catalogo-base.json";
import type { EntradaCatalogo, TipoCatalogo } from "./types";

/** Catálogo base de LOGIKS (mismo contenido que la migración SQL). */
export function catalogoBase(): EntradaCatalogo[] {
  return (Object.entries(base) as [TipoCatalogo, { nombre: string; codigo: string | null; datos: EntradaCatalogo["datos"] }[]][]).flatMap(
    ([tipo, items]) =>
      items.map((it) => ({
        id: `base-${tipo}-${it.nombre}`,
        tipo,
        nombre: it.nombre,
        codigo: it.codigo ?? undefined,
        base: true,
        datos: it.datos,
      })),
  );
}

/** Texto para sugerir lugares: "Cartagena (COCTG)". */
export const etiquetaLugar = (e: EntradaCatalogo) => (e.codigo && e.tipo === "aeropuerto" ? `${e.nombre} · ${e.codigo}` : e.nombre);
