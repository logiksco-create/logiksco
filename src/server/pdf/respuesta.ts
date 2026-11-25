import "server-only";

export function respuestaPdf(buffer: Buffer | Uint8Array, nombre: string, descargar = false) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombre.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
