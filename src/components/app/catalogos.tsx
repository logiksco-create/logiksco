"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, LoaderCircle, Pencil, Plus, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { DialogoProducto } from "@/components/app/crear-rapido";
import { BLOQUES, TIPOS_CATALOGO, type EntradaCatalogo, type TipoCatalogo } from "@/domain/types";
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

/* ------------------------------------------------------------------ */
/* Productos: tabla con código, IVA preestablecido y estado en Finppi    */
/* ------------------------------------------------------------------ */

export function ListaProductos({ productos, editable }: { productos: EntradaCatalogo[]; editable: boolean }) {
  const [dialogo, setDialogo] = useState<{ producto?: EntradaCatalogo } | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-3">
      {editable && (
        <Boton tamano="sm" onClick={() => setDialogo({})}>
          <Plus /> Nuevo producto
        </Boton>
      )}
      {productos.length === 0 ? (
        <p className="text-[13px] text-muted">Aún no hay productos. Créalos aquí o desde una cotización, o tráelos de Finppi.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-xs text-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Producto o servicio</th>
                <th className="px-3 py-2 font-medium">IVA</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">En Finppi</th>
                {editable && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const enFinppi = p.datos.enFinppi !== false;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{p.codigo}</td>
                    <td className="px-3 py-2">{p.nombre}</td>
                    <td className="px-3 py-2">{p.datos.iva ?? <span className="text-subtle">definir</span>}</td>
                    <td className="hidden px-3 py-2 sm:table-cell">
                      {enFinppi ? <span className="text-success">Sí</span> : <span className="text-warning">Se crea al facturar</span>}
                    </td>
                    {editable && (
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => setDialogo({ producto: p })}
                          className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-fg"
                          aria-label={`Editar ${p.nombre}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialogo && (
        <DialogoProducto
          abierto
          cerrar={() => setDialogo(null)}
          producto={dialogo.producto}
          alGuardar={() => router.refresh()}
        />
      )}
    </div>
  );
}
