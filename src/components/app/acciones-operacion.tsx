"use client";

import { useState, useTransition } from "react";
import { Check, CircleCheck, LoaderCircle, Mail, Pencil, Send, X } from "lucide-react";
import type { Hito } from "@/domain/types";
import { actualizarHito, notificarCliente, solicitarAProveedor } from "@/server/acciones/app";
import { AreaTexto, Boton, Entrada } from "@/components/ui";
import { cn, fecha } from "@/lib/formato";

/** Fila de hito editable (RF-26): fecha estimada y real. */
export function FilaHito({
  operacionId,
  hito,
  hoy,
  esActual,
  editable,
}: {
  operacionId: string;
  hito: Hito;
  hoy: string;
  esActual: boolean;
  editable: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [estimada, setEstimada] = useState(hito.estimada ?? "");
  const [real, setReal] = useState(hito.real ?? "");
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  const atrasado = !hito.real && hito.estimada && hito.estimada < hoy;

  const guardar = (cambios: { estimada?: string; real?: string }) =>
    iniciar(async () => {
      const r = await actualizarHito(operacionId, { id: hito.id, estimada, real, nota: hito.nota, ...cambios });
      if (r.ok) setEditando(false);
      else setError(r.error);
    });

  return (
    <li className="relative pb-5 pl-9 last:pb-0">
      <span
        className={cn(
          "absolute top-0.5 left-0 flex size-[22px] items-center justify-center rounded-full ring-4 ring-surface",
          hito.real
            ? "bg-success text-white"
            : esActual
              ? "bg-brand text-white"
              : "border-2 border-border-strong bg-surface",
        )}
      >
        {hito.real ? <Check className="size-3" strokeWidth={3} /> : esActual ? <span className="size-1.5 rounded-full bg-white" /> : null}
      </span>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={cn("text-sm font-medium", !hito.real && !esActual && "text-muted")}>{hito.nombre}</p>
          {!editando && (
            <p className="text-xs text-subtle">
              {hito.real ? (
                <span className="text-success">Real {fecha(hito.real)}</span>
              ) : hito.estimada ? (
                <span className={cn(atrasado && "font-medium text-danger")}>
                  Estimado {fecha(hito.estimada)}
                  {atrasado && " · atrasado"}
                </span>
              ) : (
                "Sin fecha"
              )}
              {hito.real && hito.estimada && hito.real !== hito.estimada && ` · estimado ${fecha(hito.estimada)}`}
            </p>
          )}
        </div>
        {editable && !editando && (
          <div className="flex gap-1">
            {!hito.real && (esActual || hito.estimada) && (
              <Boton variante="secundario" tamano="sm" disabled={pendiente} onClick={() => guardar({ real: hoy })}>
                {pendiente ? <LoaderCircle className="animate-spin" /> : <CircleCheck />} Hoy
              </Boton>
            )}
            <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(true)} aria-label={`Editar ${hito.nombre}`}>
              <Pencil />
            </Boton>
          </div>
        )}
      </div>
      {editando && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-subtle">
            Estimada
            <Entrada type="date" className="mt-1 h-8 w-40" value={estimada} onChange={(e) => setEstimada(e.target.value)} />
          </label>
          <label className="text-xs text-subtle">
            Real
            <Entrada type="date" className="mt-1 h-8 w-40" value={real} onChange={(e) => setReal(e.target.value)} />
          </label>
          <Boton tamano="sm" disabled={pendiente} onClick={() => guardar({})}>
            {pendiente ? <LoaderCircle className="animate-spin" /> : <Check />} Guardar
          </Boton>
          <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(false)} aria-label="Cancelar">
            <X />
          </Boton>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  );
}

/** Notificar una novedad al cliente con plantilla (RF-27). */
export function NotificarCliente({
  operacionId,
  consecutivo,
  plantillas,
}: {
  operacionId: string;
  consecutivo: string;
  plantillas: { etiqueta: string; texto: string }[];
}) {
  const [asunto, setAsunto] = useState(`Novedad ${consecutivo}`);
  const [mensaje, setMensaje] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<{ ok?: boolean; error?: string }>({});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {plantillas.map((p) => (
          <button
            key={p.etiqueta}
            type="button"
            onClick={() => {
              setMensaje(p.texto);
              setAsunto(`Novedad ${consecutivo}: ${p.etiqueta.toLowerCase()}`);
              setEstado({});
            }}
            className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand-fg"
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <Entrada value={asunto} onChange={(e) => setAsunto(e.target.value)} aria-label="Asunto" />
      <AreaTexto
        rows={3}
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value)}
        placeholder="Escribe la novedad o elige una plantilla…"
        aria-label="Mensaje"
      />
      {estado.error && <p className="text-[13px] text-danger">{estado.error}</p>}
      {estado.ok && (
        <p className="flex items-center gap-1.5 text-[13px] text-success">
          <Check className="size-4" /> Enviado y registrado en la trazabilidad.
        </p>
      )}
      <Boton
        className="w-full"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await notificarCliente(operacionId, asunto, mensaje);
            setEstado(r.ok ? { ok: true } : { error: r.error });
            if (r.ok) setMensaje("");
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Send />} Enviar al cliente
      </Boton>
      <p className="flex items-center gap-1.5 text-xs text-subtle">
        <Mail className="size-3.5" /> Las respuestas del cliente llegan al buzón del DO.
      </p>
    </div>
  );
}

/** Solicitud a un proveedor con plantilla (RF-25). */
export function SolicitudProveedor({
  operacionId,
  proveedores,
  plantillas,
  inicial,
}: {
  operacionId: string;
  proveedores: { id: string; nombre: string; correo: string }[];
  plantillas: Record<string, { etiqueta: string; asunto: string; mensaje: string }>;
  inicial?: { plantilla?: string; proveedorId?: string };
}) {
  const p0 = plantillas[inicial?.plantilla ?? ""] ?? Object.values(plantillas)[0];
  const prov0 = proveedores.find((p) => p.id === inicial?.proveedorId) ?? proveedores[0];
  const [proveedorId, setProveedorId] = useState(prov0?.id ?? "");
  const [correo, setCorreo] = useState(prov0?.correo ?? "");
  const [asunto, setAsunto] = useState(p0.asunto);
  const [mensaje, setMensaje] = useState(p0.mensaje);
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<{ ok?: boolean; enviado?: boolean; error?: string }>({});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(plantillas).map(([k, p]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setAsunto(p.asunto);
              setMensaje(p.mensaje);
              setEstado({});
            }}
            className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand-fg"
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={proveedorId}
          onChange={(e) => {
            setProveedorId(e.target.value);
            setCorreo(proveedores.find((p) => p.id === e.target.value)?.correo ?? "");
          }}
          className="h-9 rounded-lg border border-border bg-surface px-3 text-sm"
          aria-label="Proveedor"
        >
          <option value="">Otro proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <Entrada type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="correo@proveedor.com" aria-label="Correo del proveedor" />
      </div>
      <Entrada value={asunto} onChange={(e) => setAsunto(e.target.value)} aria-label="Asunto de la solicitud" />
      <AreaTexto rows={5} value={mensaje} onChange={(e) => setMensaje(e.target.value)} aria-label="Mensaje al proveedor" />
      {estado.error && <p className="text-[13px] text-danger">{estado.error}</p>}
      {estado.ok && (
        <p className="flex items-center gap-1.5 text-[13px] text-success">
          <Check className="size-4" /> {estado.enviado ? "Enviada y registrada." : "Registrada en la trazabilidad (el correo aún no está configurado)."}
        </p>
      )}
      <Boton
        className="w-full"
        variante="secundario"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await solicitarAProveedor(operacionId, { correo, asunto, mensaje });
            setEstado(r.ok ? { ok: true, enviado: r.datos.enviado } : { error: r.error });
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Send />} Enviar solicitud
      </Boton>
    </div>
  );
}
