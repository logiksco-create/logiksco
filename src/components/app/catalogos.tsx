"use client";

import { useActionState, useTransition } from "react";
import { Check, LoaderCircle, Plus, Save, X } from "lucide-react";
import { BLOQUES, TIPOS_CATALOGO, type TipoCatalogo } from "@/domain/types";
import { agregarCatalogo, eliminarCatalogo, guardarHitos, guardarTerminos } from "@/server/acciones/configuracion";
import { AreaTexto, Boton, Entrada, Selector } from "@/components/ui";

type R = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

function Mensaje({ r }: { r: R }) {
  if (!r) return null;
  return r.ok ? (
    <p className="flex items-center gap-1.5 text-[13px] text-success">
      <Check className="size-4" /> {r.mensaje}
    </p>
  ) : (
    <p className="text-[13px] text-danger">{r.error}</p>
  );
}

export function AgregarCatalogo({ tipo }: { tipo: TipoCatalogo }) {
  const [estado, accion, pendiente] = useActionState(agregarCatalogo, null);
  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="tipo" value={tipo} />
      <div className="flex flex-wrap gap-2">
        <Entrada name="nombre" placeholder={`Nuevo en ${TIPOS_CATALOGO[tipo].toLowerCase()}`} required className="min-w-48 flex-1" />
        {(tipo === "puerto" || tipo === "aeropuerto" || tipo === "contenedor") && (
          <Entrada name="codigo" placeholder="Código" className="w-28 font-mono uppercase" maxLength={10} />
        )}
        {tipo === "producto_finppi" && (
          <>
            <Entrada name="codigo" placeholder="Código en Finppi" required className="w-36 font-mono" maxLength={30} />
            <Selector name="iva" defaultValue="IVA-19" className="w-32" aria-label="IVA por defecto">
              {["IVA-19", "IVA-5", "IVA-0", "Ninguno"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Selector>
          </>
        )}
        {tipo === "concepto" && (
          <Selector name="bloque" defaultValue="otros" className="w-48" aria-label="Bloque">
            {Object.entries(BLOQUES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Selector>
        )}
        <Boton disabled={pendiente}>
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Plus />} Agregar
        </Boton>
      </div>
      <Mensaje r={estado} />
    </form>
  );
}

export function QuitarCatalogo({ id, nombre }: { id: string; nombre: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => iniciar(async () => void (await eliminarCatalogo(id)))}
      className="rounded p-0.5 text-subtle hover:bg-danger-soft hover:text-danger"
      aria-label={`Quitar ${nombre}`}
    >
      {pendiente ? <LoaderCircle className="size-3 animate-spin" /> : <X className="size-3" />}
    </button>
  );
}

export function FormHitos({ tipos }: { tipos: { tipo: string; etiqueta: string; hitos: string[]; propios: boolean }[] }) {
  const [estado, accion, pendiente] = useActionState(guardarHitos, null);
  return (
    <form action={accion} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tipos.map((t) => (
          <label key={t.tipo} className="block">
            <span className="mb-1.5 flex items-center justify-between text-[13px] font-medium">
              {t.etiqueta}
              {!t.propios && <span className="text-xs font-normal text-subtle">de LOGIKS</span>}
            </span>
            <AreaTexto name={t.tipo} rows={8} defaultValue={t.hitos.join("\n")} className="font-mono text-xs leading-relaxed" />
          </label>
        ))}
      </div>
      <p className="text-xs text-subtle">Un hito por línea, en orden. «Salida», «Arribo» y «Entrega» cambian el estado del DO; «Booking» y «ETD» alimentan la alerta de tarifas vencidas.</p>
      <div className="flex items-center justify-between gap-3">
        <Mensaje r={estado} />
        <Boton disabled={pendiente} className="ml-auto">
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar hitos
        </Boton>
      </div>
    </form>
  );
}

export function FormTerminos({ terminos }: { terminos: string }) {
  const [estado, accion, pendiente] = useActionState(guardarTerminos, null);
  return (
    <form action={accion} className="space-y-3 p-5">
      <AreaTexto name="terminos" rows={5} defaultValue={terminos} placeholder="Tarifas sujetas a disponibilidad de espacio…" />
      <div className="flex items-center justify-between gap-3">
        <Mensaje r={estado} />
        <Boton disabled={pendiente} className="ml-auto">
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar términos
        </Boton>
      </div>
    </form>
  );
}
