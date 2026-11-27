"use client";

import { useState, useTransition } from "react";
import { Check, Copy, FileSignature, Link2, LoaderCircle, Send, Ship } from "lucide-react";
import {
  abrirDO,
  aceptarManual,
  duplicarCotizacion,
  enviarCotizacion,
  solicitar170,
  verificarAceptacion,
} from "@/server/acciones/app";
import { AreaTexto, Boton, Selector } from "@/components/ui";
import { cn } from "@/lib/formato";

function Error({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{mensaje}</p>;
}

export function BotonDuplicar({
  id,
  compacto,
  className,
  etiqueta = "Duplicar",
}: {
  id: string;
  compacto?: boolean;
  className?: string;
  etiqueta?: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <Boton
        variante={compacto ? "fantasma" : "secundario"}
        tamano="sm"
        className={className}
        disabled={pendiente}
        title="Duplicar cotización"
        onClick={() =>
          iniciar(async () => {
            const r = await duplicarCotizacion(id);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Copy />}
        {!compacto && etiqueta}
      </Boton>
      {error && !compacto && <Error mensaje={error} />}
    </>
  );
}

export function DuplicarParaCliente({
  id,
  clientes,
}: {
  id: string;
  clientes: { id: string; nombre: string }[];
}) {
  const [cliente, setCliente] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div>
      <div className="flex gap-2">
        <Selector value={cliente} onChange={(e) => setCliente(e.target.value)} aria-label="Cliente destino">
          <option value="">Mismo cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Boton
          variante="secundario"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await duplicarCotizacion(id, cliente || undefined);
              if (r && !r.ok) setError(r.error);
            })
          }
        >
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Copy />} Duplicar
        </Boton>
      </div>
      <Error mensaje={error} />
    </div>
  );
}

export function BotonEnviar({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  const [enlace, setEnlace] = useState<string>();
  const [enviado, setEnviado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  if (enlace) {
    return (
      <div className="rounded-lg border border-success/25 bg-success-soft p-3 text-[13px]">
        <p className="flex items-center gap-1.5 font-medium text-success">
          <Check className="size-4" />{" "}
          {enviado ? "Correo enviado con el PDF. Enlace seguro de aceptación:" : "Lista. El correo no está configurado: comparte este enlace seguro de aceptación:"}
        </p>
        <div className="mt-2 flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 font-mono text-xs">{enlace}</code>
          <Boton
            variante="secundario"
            tamano="sm"
            onClick={() => {
              navigator.clipboard?.writeText(enlace);
              setCopiado(true);
            }}
          >
            {copiado ? <Check /> : <Link2 />} {copiado ? "Copiado" : "Copiar"}
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Boton
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await enviarCotizacion(id);
            if (r.ok) {
              setEnlace(r.datos.enlace);
              setEnviado(r.datos.enviado);
            }
            else setError(r.error);
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Send />} Enviar al cliente
      </Boton>
      <Error mensaje={error} />
    </div>
  );
}

export function AceptacionManual({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();

  if (!abierto) {
    return (
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        <FileSignature /> Registrar aceptación manual
      </Boton>
    );
  }
  return (
    <div className="space-y-2">
      <AreaTexto
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Ej.: El cliente aceptó por correo el 24 nov a las 3:10 p. m. (asunto «RE: Cotización…»)"
        autoFocus
      />
      <div className="flex gap-2">
        <Boton
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await aceptarManual(id, nota);
              if (!r.ok) setError(r.error);
            })
          }
        >
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Check />} Marcar aceptada
        </Boton>
        <Boton variante="fantasma" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
      <Error mensaje={error} />
    </div>
  );
}

export function BotonAbrirDO({ id, deshabilitado, className }: { id: string; deshabilitado?: boolean; className?: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className={cn(className)}>
      <Boton
        variante="exito"
        disabled={pendiente || deshabilitado}
        onClick={() =>
          iniciar(async () => {
            const r = await abrirDO(id);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Ship />} Abrir DO
      </Boton>
      <Error mensaje={error} />
    </div>
  );
}

/** Pide al cliente el formulario de la Circular 170 (correo + enlace para copiar). */
export function BotonSolicitar170({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  const [res, setRes] = useState<{ enlace: string; enviado: boolean; correo: string | null }>();
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2">
      <Boton
        tamano="sm"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            setError(undefined);
            const r = await solicitar170(id);
            if (r.ok) setRes(r.datos);
            else setError(r.error);
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Send />} {res ? "Volver a pedir" : "Pedir la Circular 170 al cliente"}
      </Boton>
      {res && (
        <div className="space-y-1.5 rounded-lg border border-border bg-surface-2 p-3 text-[13px]">
          <p className="text-muted">
            {res.correo
              ? res.enviado
                ? `Enviado a ${res.correo}.`
                : `Registrado para ${res.correo} (el envío de correos aún no está configurado: compártele el enlace).`
              : "El cliente no tiene contacto con correo: compártele este enlace."}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-xs">{res.enlace}</code>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(res.enlace).catch(() => undefined);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
            >
              {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar"}
            </Boton>
          </div>
        </div>
      )}
      <Error mensaje={error} />
    </div>
  );
}

/** Marca como verificada la aceptación en línea (cierra la tarea). */
export function BotonVerificarAceptacion({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div>
      <Boton
        tamano="sm"
        variante="secundario"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await verificarAceptacion(id);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Check />} Marcar como verificada
      </Boton>
      <Error mensaje={error} />
    </div>
  );
}
