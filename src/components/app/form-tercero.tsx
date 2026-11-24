"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { crearTercero } from "@/server/acciones/app";
import { Boton, Campo, Entrada, Selector, Tarjeta } from "@/components/ui";

export function NuevoTercero() {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(
    async (previo: Awaited<ReturnType<typeof crearTercero>> | null, datos: FormData) => {
      const r = await crearTercero(previo, datos);
      if (r.ok) setAbierto(false);
      return r;
    },
    null,
  );

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)}>
        <Plus /> Nuevo tercero
      </Boton>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAbierto(false)} />
      <Tarjeta className="animate-entrar relative w-full max-w-lg shadow-pop">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Nuevo cliente, prospecto o proveedor</h2>
          <button onClick={() => setAbierto(false)} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <form action={accion} className="grid gap-4 p-5 sm:grid-cols-2">
          <Campo etiqueta="Tipo">
            <Selector name="tipo" defaultValue="cliente">
              <option value="cliente">Cliente</option>
              <option value="prospecto">Prospecto</option>
              <option value="proveedor">Proveedor</option>
            </Selector>
          </Campo>
          <Campo etiqueta="NIT">
            <Entrada name="nit" required placeholder="900.123.456-7" />
          </Campo>
          <Campo etiqueta="Razón social" className="sm:col-span-2">
            <Entrada name="razonSocial" required />
          </Campo>
          <Campo etiqueta="Ciudad" className="sm:col-span-2">
            <Entrada name="ciudad" />
          </Campo>
          <p className="text-xs font-medium tracking-wide text-subtle uppercase sm:col-span-2">Contacto principal</p>
          <Campo etiqueta="Nombre">
            <Entrada name="contactoNombre" />
          </Campo>
          <Campo etiqueta="Cargo">
            <Entrada name="contactoCargo" />
          </Campo>
          <Campo etiqueta="Correo" className="sm:col-span-2">
            <Entrada name="contactoCorreo" type="email" />
          </Campo>
          {estado && !estado.ok && <p className="text-[13px] text-danger sm:col-span-2">{estado.error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton disabled={pendiente}>
              {pendiente && <LoaderCircle className="animate-spin" />} Crear
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </div>
  );
}
