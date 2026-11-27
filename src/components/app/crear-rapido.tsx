"use client";

import { useState, useTransition } from "react";
import { CircleAlert, LoaderCircle, Plus } from "lucide-react";
import type { EntradaCatalogo, IvaFinppi, Tercero } from "@/domain/types";
import { crearTerceroRapido, guardarProducto } from "@/server/acciones/app";
import { Boton, Campo, Entrada, Selector } from "@/components/ui";
import { Dialogo } from "@/components/ui/dialogo";

/**
 * Crear cliente, prospecto, proveedor o producto sin salir de la pantalla
 * (cotización, prefactura…). Devuelve lo creado para elegirlo de una vez.
 */

function Error({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" /> {mensaje}
    </p>
  );
}

const TITULOS = { cliente: "Nuevo cliente", prospecto: "Nuevo prospecto", proveedor: "Nuevo proveedor" } as const;

export function DialogoTercero({
  abierto,
  cerrar,
  tipo,
  nombreInicial = "",
  alCrear,
}: {
  abierto: boolean;
  cerrar: () => void;
  tipo: "cliente" | "proveedor";
  nombreInicial?: string;
  alCrear: (t: Tercero) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  const [clase, setClase] = useState<"cliente" | "prospecto" | "proveedor">(tipo);
  return (
    <Dialogo
      abierto={abierto}
      cerrar={cerrar}
      titulo={TITULOS[clase]}
      descripcion={tipo === "cliente" ? "Queda en Clientes con su hoja de vida. Los datos fiscales se completan cuando vayas a facturar." : "Queda en Proveedores para tus solicitudes y costos."}
      ancho="max-w-xl"
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          setError(undefined);
          iniciar(async () => {
            const r = await crearTerceroRapido({
              tipo: clase,
              nit: d.nit,
              razonSocial: d.razonSocial,
              ciudad: d.ciudad ?? "",
              contactoNombre: d.contactoNombre || undefined,
              contactoCargo: d.contactoCargo || undefined,
              contactoCorreo: d.contactoCorreo || undefined,
              contactoTelefono: d.contactoTelefono || undefined,
            });
            if (r.ok) {
              alCrear(r.datos);
              cerrar();
            } else setError(r.error);
          });
        }}
      >
        {tipo === "cliente" && (
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2 p-1 text-[13px]">
            {(["cliente", "prospecto"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClase(c)}
                className={c === clase ? "rounded-md bg-surface py-1.5 font-medium shadow-sm ring-1 ring-border" : "rounded-md py-1.5 text-muted hover:text-fg"}
              >
                {c === "cliente" ? "Cliente" : "Prospecto (aún no compra)"}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Razón social o nombre" className="sm:col-span-2">
            <Entrada name="razonSocial" defaultValue={nombreInicial} required autoFocus />
          </Campo>
          <Campo etiqueta="NIT o documento" ayuda="Con o sin dígito de verificación">
            <Entrada name="nit" required className="font-mono" placeholder="900.123.456-7" />
          </Campo>
          <Campo etiqueta="Ciudad">
            <Entrada name="ciudad" placeholder="Medellín" />
          </Campo>
        </div>
        <fieldset className="rounded-xl border border-border p-4">
          <legend className="px-1 text-[13px] font-medium">Contacto {tipo === "cliente" ? "(para enviarle la cotización)" : ""}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Entrada name="contactoNombre" placeholder="Nombre" aria-label="Nombre del contacto" />
            <Entrada name="contactoCargo" placeholder="Cargo" aria-label="Cargo" />
            <Entrada name="contactoCorreo" type="email" placeholder="correo@empresa.co" aria-label="Correo" />
            <Entrada name="contactoTelefono" placeholder="Celular" aria-label="Celular" inputMode="tel" />
          </div>
        </fieldset>
        <Error mensaje={error} />
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton disabled={pendiente}>
            {pendiente ? <LoaderCircle className="animate-spin" /> : <Plus />} Crear {clase}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}

const IVAS: IvaFinppi[] = ["IVA-19", "IVA-5", "IVA-0", "Ninguno"];

export function DialogoProducto({
  abierto,
  cerrar,
  nombreInicial = "",
  ivaInicial = "IVA-19",
  producto,
  alGuardar,
}: {
  abierto: boolean;
  cerrar: () => void;
  nombreInicial?: string;
  ivaInicial?: IvaFinppi;
  /** Para editar uno existente. */
  producto?: EntradaCatalogo;
  alGuardar: (p: EntradaCatalogo) => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <Dialogo
      abierto={abierto}
      cerrar={cerrar}
      titulo={producto ? "Editar producto" : "Nuevo producto o servicio"}
      descripcion="Con su IVA preestablecido: al elegirlo en un concepto ya trae el IVA, y lo puedes cambiar."
      ancho="max-w-lg"
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          setError(undefined);
          iniciar(async () => {
            const r = await guardarProducto({ id: producto?.id, nombre: d.nombre, codigo: d.codigo, iva: d.iva as IvaFinppi });
            if (r.ok) {
              alGuardar(r.datos);
              cerrar();
            } else setError(r.error);
          });
        }}
      >
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" required autoFocus defaultValue={producto?.nombre ?? nombreInicial} placeholder="Agenciamiento de carga" />
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Código" ayuda={producto ? "El mismo de Finppi" : "Déjalo vacío y se asigna LG-001…"}>
            <Entrada name="codigo" defaultValue={producto?.codigo ?? ""} className="font-mono" maxLength={30} placeholder="Automático" />
          </Campo>
          <Campo etiqueta="IVA preestablecido">
            <Selector name="iva" defaultValue={producto?.datos.iva ?? ivaInicial}>
              {IVAS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Selector>
          </Campo>
        </div>
        {!producto && (
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
            Si aún no existe en Finppi, el bot lo crea allá automáticamente la primera vez que factures con él.
          </p>
        )}
        <Error mensaje={error} />
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton disabled={pendiente}>
            {pendiente ? <LoaderCircle className="animate-spin" /> : <Plus />} {producto ? "Guardar" : "Crear producto"}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
