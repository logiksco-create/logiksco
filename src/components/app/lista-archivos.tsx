import { Download, FileImage, FileSpreadsheet, FileText } from "lucide-react";
import type { Archivo } from "@/domain/types";
import { tamanoLegible } from "@/domain/archivos";
import { fechaHora } from "@/lib/formato";

function Icono({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="size-4 text-info" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet className="size-4 text-success" />;
  return <FileText className="size-4 text-danger" />;
}

export function ListaArchivos({
  archivos,
  clase,
  tipos,
  vacio = "Sin documentos todavía.",
  descargable = true,
}: {
  archivos: Archivo[];
  clase: "do" | "170";
  tipos: Record<string, string>;
  vacio?: string;
  descargable?: boolean;
}) {
  if (archivos.length === 0) return <p className="text-[13px] text-muted">{vacio}</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {archivos.map((a) => {
        const contenido = (
          <>
            <Icono mime={a.mime} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{a.nombre}</span>
              <span className="block text-xs text-subtle">
                {tipos[a.tipo] ?? a.tipo} · {tamanoLegible(a.tamano)} · {fechaHora(a.creadoEl)}
              </span>
            </span>
            {descargable && <Download className="size-4 text-subtle" />}
          </>
        );
        return (
          <li key={a.id}>
            {descargable ? (
              <a href={`/app/archivos/${clase}/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2">
                {contenido}
              </a>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5">{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
