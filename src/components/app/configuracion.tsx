"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, LoaderCircle, Save, UserMinus, UserPlus } from "lucide-react";
import { NOMBRES_ROL, type Empresa, type Rol, type Usuario } from "@/domain/types";
import { actualizarRoles, desactivarUsuario, guardarEmpresa, invitarUsuario } from "@/server/acciones/configuracion";
import { Avatar, Boton, Campo, Entrada, Insignia } from "@/components/ui";
import { cn } from "@/lib/formato";

const ROLES = Object.keys(NOMBRES_ROL) as Rol[];

function Estado({ r }: { r: { ok: true; mensaje?: string } | { ok: false; error: string } | null }) {
  if (!r) return null;
  return r.ok ? (
    <p className="flex items-center gap-1.5 text-[13px] text-success">
      <Check className="size-4" /> {r.mensaje}
    </p>
  ) : (
    <p className="text-[13px] text-danger">{r.error}</p>
  );
}

export function FormEmpresa({ empresa, editable }: { empresa: Empresa; editable: boolean }) {
  const [estado, accion, pendiente] = useActionState(guardarEmpresa, null);
  return (
    <form action={accion} className="grid gap-4 p-5 sm:grid-cols-2">
      <fieldset disabled={!editable} className="contents">
        <Campo etiqueta="Razón social">
          <Entrada name="razonSocial" defaultValue={empresa.razonSocial} required />
        </Campo>
        <Campo etiqueta="NIT" ayuda="Para cambiarlo, escribe a soporte">
          <Entrada value={empresa.nit} disabled readOnly />
        </Campo>
        <Campo etiqueta="Ciudad">
          <Entrada name="ciudad" defaultValue={empresa.ciudad} />
        </Campo>
        <Campo etiqueta="Color de marca" ayuda="Se usa en el PDF y el portal">
          <div className="flex gap-2">
            <input
              type="color"
              name="colorPrimario"
              defaultValue={empresa.colorPrimario}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
            <Entrada defaultValue={empresa.colorPrimario} disabled className="font-mono" />
          </div>
        </Campo>
        <Campo etiqueta="Prefijo de cotizaciones" ayuda={`Ej.: ${empresa.prefijoCotizacion}-2026-0001`}>
          <Entrada name="prefijoCotizacion" defaultValue={empresa.prefijoCotizacion} className="font-mono uppercase" maxLength={6} />
        </Campo>
        <Campo etiqueta="Prefijo de DO" ayuda={`Ej.: ${empresa.prefijoDO}-2026-0001`}>
          <Entrada name="prefijoDO" defaultValue={empresa.prefijoDO} className="font-mono uppercase" maxLength={6} />
        </Campo>
        <Campo etiqueta="Vigencia de la Circular 170 (meses)" ayuda="La práctica del sector es 12">
          <Entrada name="vigencia170Meses" type="number" min={1} max={60} defaultValue={empresa.vigencia170Meses} />
        </Campo>
        <div className="flex items-end">
          <label className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">
            <input type="checkbox" name="bloquearDOSin170" defaultChecked={empresa.bloquearDOSin170} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">Bloquear DO sin 170 vigente</span>
              <span className="block text-muted">Si lo desactivas, se permite con alerta.</span>
            </span>
          </label>
        </div>
        {editable && (
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Estado r={estado} />
            <Boton disabled={pendiente} className="ml-auto">
              {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar
            </Boton>
          </div>
        )}
      </fieldset>
    </form>
  );
}

function SelectorRoles({ valor, onChange, nombre }: { valor: Rol[]; onChange?: (r: Rol[]) => void; nombre?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLES.map((r) => {
        const activo = valor.includes(r);
        return (
          <label
            key={r}
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
              activo ? "border-brand bg-brand-soft text-brand-fg" : "border-border text-muted hover:border-border-strong",
            )}
          >
            <input
              type="checkbox"
              name={nombre}
              value={r}
              checked={activo}
              onChange={(e) => onChange?.(e.target.checked ? [...valor, r] : valor.filter((x) => x !== r))}
              className="sr-only"
            />
            {NOMBRES_ROL[r]}
          </label>
        );
      })}
    </div>
  );
}

function FilaUsuario({ u, yo, editable }: { u: Usuario; yo: boolean; editable: boolean }) {
  const [roles, setRoles] = useState<Rol[]>(u.roles);
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<Parameters<typeof Estado>[0]["r"]>(null);
  const cambiado = roles.slice().sort().join() !== u.roles.slice().sort().join();
  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar nombre={u.nombre} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {u.nombre} {yo && <Insignia tono="marca">Tú</Insignia>}
          </p>
          <p className="truncate text-xs text-muted">{u.correo || "—"}</p>
        </div>
      </div>
      {editable ? (
        <div className="flex flex-col gap-2">
          <SelectorRoles valor={roles} onChange={setRoles} />
          <div className="flex items-center gap-2">
            <Estado r={r} />
            {cambiado && (
              <Boton tamano="sm" disabled={pendiente} onClick={() => iniciar(async () => setR(await actualizarRoles(u.id, roles)))}>
                {pendiente ? <LoaderCircle className="animate-spin" /> : <Check />} Guardar roles
              </Boton>
            )}
            {!yo && (
              <Boton
                variante="fantasma"
                tamano="sm"
                disabled={pendiente}
                onClick={() => confirm(`¿Desactivar a ${u.nombre}? Conserva su historial.`) && iniciar(async () => setR(await desactivarUsuario(u.id)))}
              >
                <UserMinus /> Desactivar
              </Boton>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {u.roles.map((x) => (
            <Insignia key={x}>{NOMBRES_ROL[x]}</Insignia>
          ))}
        </div>
      )}
    </li>
  );
}

export function GestionUsuarios({ usuarios, yoId, editable }: { usuarios: Usuario[]; yoId: string; editable: boolean }) {
  const [estado, accion, pendiente] = useActionState(invitarUsuario, null);
  const [roles, setRoles] = useState<Rol[]>(["comercial"]);
  return (
    <>
      <ul className="divide-y divide-border border-t border-border">
        {usuarios.map((u) => (
          <FilaUsuario key={u.id} u={u} yo={u.id === yoId} editable={editable} />
        ))}
      </ul>
      {editable && (
        <form action={accion} className="grid gap-3 border-t border-border bg-surface-2 p-5 sm:grid-cols-2">
          <p className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <UserPlus className="size-4 text-brand-fg" /> Invitar a alguien del equipo
          </p>
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required />
          </Campo>
          <Campo etiqueta="Correo">
            <Entrada name="correo" type="email" required />
          </Campo>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[13px] font-medium">Roles</p>
            <SelectorRoles valor={roles} onChange={setRoles} nombre="roles" />
          </div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Estado r={estado} />
            <Boton disabled={pendiente} className="ml-auto">
              {pendiente ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Enviar invitación
            </Boton>
          </div>
        </form>
      )}
    </>
  );
}
