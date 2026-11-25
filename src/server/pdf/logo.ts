import "server-only";
import { esImagenValida } from "@/domain/archivos";

/**
 * Descarga el logo de la empresa para incrustarlo en un PDF. Se valida la
 * firma del archivo; si falla, el PDF sale sin logo (nunca se rompe).
 */
export async function logoParaPdf(url?: string): Promise<{ data: Buffer; format: "png" | "jpg" } | undefined> {
  if (!url) return undefined;
  try {
    let bytes: Uint8Array;
    if (url.startsWith("data:")) {
      bytes = Buffer.from(url.split(",")[1] ?? "", "base64");
    } else {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "force-cache" });
      if (!r.ok) return undefined;
      bytes = new Uint8Array(await r.arrayBuffer());
    }
    const tipo = esImagenValida(bytes);
    if (!tipo || bytes.length > 1024 * 1024) return undefined;
    return { data: Buffer.from(bytes), format: tipo === "image/png" ? "png" : "jpg" };
  } catch {
    return undefined;
  }
}
