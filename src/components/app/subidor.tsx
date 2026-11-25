"use client";

import { useRef, useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { CircleCheck, FileUp, LoaderCircle } from "lucide-react";
import {
  prepararDocumento,
  prepararSoporte,
  registrarDocumento,
  registrarSoporte,
  subirDocumentoDemo,
  subirSoporteDemo,
} from "@/server/acciones/archivos";
import { MIME_PERMITIDOS, tamanoLegible, validarArchivo } from "@/domain/archivos";
import { Selector } from "@/components/ui";
import { cn } from "@/lib/formato";

type Destino = { clase: "do"; operacionId: string } | { clase: "170"; token: string };

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sube archivos directo del navegador a Storage con URL firmada (o por el
 * servidor en modo demo). Admite arrastrar y soltar.
 */
export function Subidor({
  destino,
  tipos,
  compacto,
}: {
  destino: Destino;
  tipos: Record<string, string>;
  compacto?: boolean;
}) {
  const [tipo, setTipo] = useState(Object.keys(tipos)[0]);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string }>();
  const input = useRef<HTMLInputElement>(null);

  const subir = (archivo: File) =>
    iniciar(async () => {
      setMensaje(undefined);
      const m = { tipo, nombre: archivo.name, mime: archivo.type, tamano: archivo.size };
      const invalido = validarArchivo(m);
      if (invalido) return setMensaje({ ok: false, texto: invalido });

      const prep =
        destino.clase === "do" ? await prepararDocumento(destino.operacionId, m) : await prepararSoporte(destino.token, m);
      if (!prep.ok) return setMensaje({ ok: false, texto: prep.error });

      let r;
      if (prep.datos) {
        // Subida directa a Supabase Storage con la URL firmada.
        const sb = createBrowserClient(URL_SB!, LLAVE_SB!);
        const { error } = await sb.storage
          .from("documentos")
          .uploadToSignedUrl(prep.datos.ruta, prep.datos.token, archivo, { contentType: archivo.type });
        if (error) return setMensaje({ ok: false, texto: "No se pudo subir el archivo. Intenta de nuevo." });
        const reg = { ...m, ruta: prep.datos.ruta };
        r = destino.clase === "do" ? await registrarDocumento(destino.operacionId, reg) : await registrarSoporte(destino.token, reg);
      } else {
        const fd = new FormData();
        fd.set("archivo", archivo);
        fd.set("tipo", tipo);
        r = destino.clase === "do" ? await subirDocumentoDemo(destino.operacionId, fd) : await subirSoporteDemo(destino.token, fd);
      }
      setMensaje(r.ok ? { ok: true, texto: `${archivo.name} (${tamanoLegible(archivo.size)}) cargado` } : { ok: false, texto: r.error });
      if (input.current) input.current.value = "";
    });

  return (
    <div className="space-y-2.5">
      <Selector value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de documento" className="h-8 text-[13px]">
        {Object.entries(tipos).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Selector>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = e.dataTransfer.files[0];
          if (f) subir(f);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors",
          compacto ? "py-4" : "py-6",
          arrastrando ? "border-brand bg-brand-soft" : "border-border-strong bg-surface-2 hover:border-brand",
        )}
      >
        {pendiente ? <LoaderCircle className="size-5 animate-spin text-brand-fg" /> : <FileUp className="size-5 text-subtle" />}
        <p className="mt-2 text-[13px] font-medium">{pendiente ? "Subiendo…" : "Arrastra un archivo o haz clic"}</p>
        <p className="text-xs text-subtle">PDF, imagen, Excel, Word, CSV o XML · máx. 15 MB</p>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={MIME_PERMITIDOS.join(",")}
          disabled={pendiente}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) subir(f);
          }}
        />
      </label>
      {mensaje && (
        <p className={cn("flex items-center gap-1.5 text-[13px]", mensaje.ok ? "text-success" : "text-danger")}>
          {mensaje.ok && <CircleCheck className="size-4" />} {mensaje.texto}
        </p>
      )}
    </div>
  );
}
