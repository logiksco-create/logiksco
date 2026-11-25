/** Reglas de archivos: tipos permitidos, tamaño y rutas en Storage. */

export const TAMANO_MAXIMO = 15 * 1024 * 1024;

export const MIME_PERMITIDOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "application/xml",
  "text/xml",
] as const;

export function validarArchivo(a: { nombre: string; mime: string; tamano: number }): string | null {
  if (!a.nombre.trim()) return "El archivo no tiene nombre";
  if (a.tamano <= 0) return "El archivo está vacío";
  if (a.tamano > TAMANO_MAXIMO) return "El archivo supera 15 MB";
  if (!(MIME_PERMITIDOS as readonly string[]).includes(a.mime)) {
    return "Tipo de archivo no permitido (PDF, imagen, Excel, Word, CSV o XML)";
  }
  return null;
}

/** Nombre seguro para Storage: sin rutas ni caracteres raros. */
export function nombreSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "archivo";
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return limpio || "archivo";
}

export function rutaArchivo(
  empresaId: string,
  clase: "do" | "170",
  entidadId: string,
  id: string,
  nombre: string,
): string {
  return `${empresaId}/${clase}/${entidadId}/${id}-${nombreSeguro(nombre)}`;
}

/** ¿La ruta pertenece a esta empresa/clase/entidad? (evita registrar rutas ajenas) */
export function rutaPertenece(ruta: string, empresaId: string, clase: "do" | "170", entidadId: string) {
  const partes = ruta.split("/");
  return (
    partes.length === 4 &&
    partes[0] === empresaId &&
    partes[1] === clase &&
    partes[2] === entidadId &&
    !ruta.includes("..")
  );
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
