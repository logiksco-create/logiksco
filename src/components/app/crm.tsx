"use client";

import { useActionState, useState, useTransition } from "react";
import { Cake, Check, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { AcuerdoComercial, Contacto } from "@/domain/types";
import { eliminarContacto, guardarAcuerdo, guardarContacto } from "@/server/acciones/crm";
import { Avatar, AreaTexto, Boton, Campo, Entrada, Selector } from "@/components/ui";
import { fecha } from "@/lib/formato";

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

export function FormAcuerdo({
  terceroId,
  acuerdo,
  editable,
}: {
  terceroId: string;
  acuerdo?: AcuerdoComercial;
  editable: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(guardarAcuerdo.bind(null, terceroId), null);
  if (!editable) {
    return acuerdo ? (
      <dl className="space-y-2 px-5 pb-5 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">Corte de facturación</dt>
          <dd>Día {acuerdo.diaCorte}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Plazo de pago</dt>
          <dd>{acuerdo.plazoPagoDias} días</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Moneda</dt>
          <dd>{acuerdo.moneda}</dd>
        </div>
        {acuerdo.condiciones && <p className="text-muted">{acuerdo.condiciones}</p>}
      </dl>
    ) : (
      <p className="px-5 pb-5 text-[13px] text-muted">Sin acuerdo registrado.</p>
    );
  }
  return (
    <form action={accion} className="grid grid-cols-3 gap-3 px-5 pb-5">
      <Campo etiqueta="Día de corte">
        <Entrada name="diaCorte" type="number" min={1} max={31} defaultValue={acuerdo?.diaCorte ?? 25} required />
      </Campo>
      <Campo etiqueta="Plazo (días)">
        <Entrada name="plazoPagoDias" type="number" min={0} max={365} defaultValue={acuerdo?.plazoPagoDias ?? 30} required />
      </Campo>
      <Campo etiqueta="Moneda">
        <Selector name="moneda" defaultValue={acuerdo?.moneda ?? "COP"}>
          <option>COP</option>
          <option>USD</option>
        </Selector>
      </Campo>
      <Campo etiqueta="Condiciones especiales" className="col-span-3">
        <AreaTexto name="condiciones" rows={2} defaultValue={acuerdo?.condiciones ?? ""} placeholder="Descuentos, crédito, requisitos de facturación…" />
      </Campo>
      <div className="col-span-3 flex items-center justify-between gap-2">
        <Mensaje r={estado} />
        <Boton tamano="sm" disabled={pendiente} className="ml-auto">
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar acuerdo
        </Boton>
      </div>
    </form>
  );
}

function FormContacto({
  terceroId,
  contacto,
  alTerminar,
}: {
  terceroId: string;
  contacto?: Contacto;
  alTerminar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(async (p: R, fd: FormData) => {
    const r = await guardarContacto(terceroId, p, fd);
    if (r?.ok) alTerminar();
    return r;
  }, null);
  return (
    <form action={accion} className="grid gap-2.5 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
      {contacto && <input type="hidden" name="id" value={contacto.id} />}
      <Entrada name="nombre" placeholder="Nombre" defaultValue={contacto?.nombre} required aria-label="Nombre" />
      <Entrada name="cargo" placeholder="Cargo" defaultValue={contacto?.cargo} aria-label="Cargo" />
      <Entrada name="correo" type="email" placeholder="Correo" defaultValue={contacto?.correo} aria-label="Correo" />
      <Entrada name="telefono" placeholder="Teléfono" defaultValue={contacto?.telefono} aria-label="Teléfono" />
      <label className="text-xs text-subtle sm:col-span-2">
        Cumpleaños
        <Entrada name="cumpleanos" type="date" defaultValue={contacto?.cumpleanos} className="mt-1" />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Mensaje r={estado} />
        <Boton type="button" variante="fantasma" tamano="sm" className="ml-auto" onClick={alTerminar}>
          <X /> Cancelar
        </Boton>
        <Boton tamano="sm" disabled={pendiente}>
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar
        </Boton>
      </div>
    </form>
  );
}

export function Contactos({
  terceroId,
  contactos,
  editable,
}: {
  terceroId: string;
  contactos: Contacto[];
  editable: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-3 px-5 pb-5">
      {contactos.length === 0 && editando !== "nuevo" && <p className="text-[13px] text-muted">Sin contactos.</p>}
      {contactos.map((k) =>
        editando === k.id ? (
          <FormContacto key={k.id} terceroId={terceroId} contacto={k} alTerminar={() => setEditando(null)} />
        ) : (
          <div key={k.id} className="group flex items-start gap-3">
            <Avatar nombre={k.nombre} className="size-7 text-[10px]" />
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="font-medium">{k.nombre}</p>
              <p className="truncate text-muted">{[k.cargo, k.correo, k.telefono].filter(Boolean).join(" · ")}</p>
              {k.cumpleanos && (
                <p className="flex items-center gap-1 text-xs text-subtle">
                  <Cake className="size-3" /> {fecha(k.cumpleanos).split(" ").slice(0, 2).join(" ")}
                </p>
              )}
            </div>
            {editable && (
              <div className="flex opacity-60 group-hover:opacity-100">
                <button type="button" onClick={() => setEditando(k.id)} className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Editar ${k.nombre}`}>
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => confirm(`¿Eliminar a ${k.nombre}?`) && iniciar(async () => void (await eliminarContacto(terceroId, k.id)))}
                  className="rounded-md p-1.5 text-subtle hover:bg-danger-soft hover:text-danger"
                  aria-label={`Eliminar ${k.nombre}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        ),
      )}
      {editando === "nuevo" ? (
        <FormContacto terceroId={terceroId} alTerminar={() => setEditando(null)} />
      ) : (
        editable && (
          <button type="button" onClick={() => setEditando("nuevo")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-fg hover:underline">
            <Plus className="size-3.5" /> Agregar contacto
          </button>
        )
      )}
    </div>
  );
}
