"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Check, ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { LOGO_MIME, validarLogo } from "@/domain/archivos";
import { guardarLogo, prepararLogo, quitarLogo, subirLogoDemo } from "@/server/acciones/configuracion";
import { Boton } from "@/components/ui";

/** Logo de la empresa: se ve en la app, el portal, los PDF y los correos. */
export function SubidorLogo({ logoUrl, razonSocial, editable }: { logoUrl?: string; razonSocial: string; editable: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string }>();

  const subir = (f: File) =>
    iniciar(async () => {
      setMensaje(undefined);
      const m = { nombre: f.name, mime: f.type, tamano: f.size };
      const invalido = validarLogo(m);
      if (invalido) return setMensaje({ ok: false, texto: invalido });
      let r;
      const prep = await prepararLogo(m);
      if (!prep.ok) return setMensaje({ ok: false, texto: prep.error });
      if (prep.datos) {
        const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
        const { error } = await sb.storage.from("logos").uploadToSignedUrl(prep.datos.ruta, prep.datos.token, f, { contentType: f.type });
        if (error) return setMensaje({ ok: false, texto: "No se pudo subir el logo. Intenta de nuevo." });
        r = await guardarLogo({ ...m, ruta: prep.datos.ruta });
      } else {
        const fd = new FormData();
        fd.set("logo", f);
        r = await subirLogoDemo(fd);
      }
      setMensaje(r?.ok ? { ok: true, texto: r.mensaje ?? "Listo" } : { ok: false, texto: r?.error ?? "Error" });
      if (input.current) input.current.value = "";
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL pública o data URI, sin optimizar
          <img src={logoUrl} alt={`Logo de ${razonSocial}`} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400">Sin logo</span>
        )}
      </div>
      {editable && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Boton type="button" variante="secundario" tamano="sm" disabled={pendiente} onClick={() => input.current?.click()}>
              {pendiente ? <LoaderCircle className="animate-spin" /> : <ImageUp />} {logoUrl ? "Cambiar logo" : "Subir logo"}
            </Boton>
            {logoUrl && (
              <Boton
                type="button"
                variante="fantasma"
                tamano="sm"
                disabled={pendiente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await quitarLogo();
                    setMensaje(r?.ok ? { ok: true, texto: "Logo eliminado" } : { ok: false, texto: r?.error ?? "Error" });
                    router.refresh();
                  })
                }
                aria-label="Quitar logo"
              >
                <Trash2 />
              </Boton>
            )}
          </div>
          <p className="text-xs text-subtle">PNG o JPG, máx. 1 MB. Mejor horizontal y con fondo transparente o blanco.</p>
          {mensaje && (
            <p className={mensaje.ok ? "flex items-center gap-1 text-xs text-success" : "text-xs text-danger"}>
              {mensaje.ok && <Check className="size-3.5" />} {mensaje.texto}
            </p>
          )}
          <input
            ref={input}
            type="file"
            accept={LOGO_MIME.join(",")}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
            }}
          />
        </div>
      )}
    </div>
  );
}
