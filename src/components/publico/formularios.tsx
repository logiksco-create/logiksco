"use client";

import { useActionState, useState } from "react";
import { CircleCheck, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { Datos170 } from "@/domain/types";
import { enviarFormulario170, responderCotizacion } from "@/server/acciones/publicas";
import { AreaTexto, Boton, Campo, Entrada, Selector } from "@/components/ui";
import { cn } from "@/lib/formato";

export function Decision({
  token,
  contacto,
}: {
  token: string;
  contacto?: { nombre: string; cargo: string; correo: string };
}) {
  const [modo, setModo] = useState<"aceptada" | "rechazada">("aceptada");
  const [estado, accion, pendiente] = useActionState(responderCotizacion.bind(null, token), null);

  if (estado?.ok) {
    return modo === "aceptada" ? (
      estado.requiere170 ? (
        <Formulario170 token={token} intro />
      ) : (
        <Exito titulo="¡Cotización aceptada!" texto="Recibimos tu aceptación. Nuestro equipo de operaciones te contactará con el número de tu operación." />
      )
    ) : (
      <Exito titulo="Respuesta registrada" texto="Gracias por contarnos. Tu comercial revisará el motivo." />
    );
  }

  return (
    <form action={accion} className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-border">
        {(["aceptada", "rechazada"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={cn(
              "h-9 rounded-lg text-sm font-medium transition-colors",
              modo === m ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
            )}
          >
            {m === "aceptada" ? "Aceptar" : "Rechazar"}
          </button>
        ))}
      </div>
      <input type="hidden" name="decision" value={modo} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre completo">
          <Entrada name="nombre" defaultValue={contacto?.nombre} required autoComplete="name" />
        </Campo>
        <Campo etiqueta="Cargo">
          <Entrada name="cargo" defaultValue={contacto?.cargo} required autoComplete="organization-title" />
        </Campo>
        <Campo etiqueta="Correo" className="sm:col-span-2">
          <Entrada name="correo" type="email" defaultValue={contacto?.correo} required autoComplete="email" />
        </Campo>
      </div>
      {modo === "rechazada" ? (
        <Campo etiqueta="Motivo">
          <AreaTexto name="motivo" required placeholder="Precio, tiempos, cambio de planes…" />
        </Campo>
      ) : (
        <label className="flex items-start gap-2.5 text-[13px] text-muted">
          <input type="checkbox" name="acepto" required className="mt-0.5 size-4 accent-[var(--brand)]" />
          Acepto la cotización y sus términos y condiciones. Queda registro de mi nombre, correo, fecha, hora e IP como evidencia.
        </label>
      )}
      {estado && !estado.ok && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{estado.error}</p>}
      <Boton className="w-full" tamano="lg" variante={modo === "aceptada" ? "primario" : "secundario"} disabled={pendiente}>
        {pendiente ? <LoaderCircle className="animate-spin" /> : modo === "aceptada" ? <CircleCheck /> : <X />}
        {modo === "aceptada" ? "Aceptar cotización" : "Enviar rechazo"}
      </Boton>
    </form>
  );
}

export function Exito({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="animate-entrar py-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
        <CircleCheck className="size-6" />
      </span>
      <p className="mt-3 text-lg font-semibold">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{texto}</p>
    </div>
  );
}

export function Formulario170({
  token,
  intro,
  previo,
}: {
  token: string;
  intro?: boolean;
  previo?: Partial<Datos170>;
}) {
  const [estado, accion, pendiente] = useActionState(enviarFormulario170.bind(null, token), null);

  if (estado?.ok) {
    return (
      <Exito
        titulo="Formulario enviado"
        texto="Nuestro oficial de cumplimiento lo revisará. Te avisaremos por correo; si hay algo por corregir, podrás hacerlo en línea."
      />
    );
  }

  const rl = previo?.representantes?.[0];

  return (
    <form action={accion} className="space-y-5">
      {intro && (
        <div className="flex gap-3 rounded-xl bg-success-soft p-4 text-[13.5px] text-success">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-semibold">Cotización aceptada.</strong> Para abrir tu operación necesitamos tu
            formulario de conocimiento del cliente (Circular 170 de la DIAN). Toma unos 5 minutos.
          </p>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-brand-fg" /> Conocimiento del cliente · Circular 170
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Razón social o nombre" className="sm:col-span-2">
          <Entrada name="razonSocial" required defaultValue={previo?.razonSocial} />
        </Campo>
        <Campo etiqueta="NIT o documento">
          <Entrada name="nit" required defaultValue={previo?.nit} />
        </Campo>
        <Campo etiqueta="Actividad económica">
          <Entrada name="actividadEconomica" required defaultValue={previo?.actividadEconomica} />
        </Campo>
        <Campo etiqueta="Domicilio">
          <Entrada name="domicilio" required defaultValue={previo?.domicilio} autoComplete="street-address" />
        </Campo>
        <Campo etiqueta="Ciudad">
          <Entrada name="ciudad" required defaultValue={previo?.ciudad} />
        </Campo>
        <Campo etiqueta="Capital social registrado (COP)">
          <Entrada name="capitalSocial" type="number" min={0} inputMode="numeric" required defaultValue={previo?.capitalSocial} />
        </Campo>
        <Campo etiqueta="Origen de los recursos">
          <Entrada name="origenRecursos" required defaultValue={previo?.origenRecursos} />
        </Campo>
        <Campo etiqueta="Forma de pago">
          <Selector name="formaPago" defaultValue={previo?.formaPago ?? "Transferencia electrónica"}>
            <option>Transferencia electrónica</option>
            <option>Cheque</option>
            <option>Consignación</option>
            <option>Carta de crédito</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Entidad financiera y ciudad">
          <Entrada name="entidadFinanciera" required defaultValue={previo?.entidadFinanciera} placeholder="Bancolombia, Medellín" />
        </Campo>
        <Campo etiqueta="Representante legal">
          <Entrada name="rlNombre" required defaultValue={rl?.nombre} />
        </Campo>
        <Campo etiqueta="Documento del representante">
          <Entrada name="rlDocumento" required defaultValue={rl?.documento} placeholder="CC 43.000.000" />
        </Campo>
        <Campo etiqueta="Beneficiarios de las operaciones" className="sm:col-span-2">
          <Entrada name="beneficiarios" required defaultValue={previo?.beneficiarios} />
        </Campo>
        <Campo etiqueta="¿Es persona expuesta políticamente (PEP)?" className="sm:col-span-2">
          <Selector name="esPEP" defaultValue={previo?.esPEP ? "si" : "no"}>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </Selector>
        </Campo>
      </fieldset>
      <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
        <label className="flex items-start gap-2.5 text-[13px] text-muted">
          <input type="checkbox" name="autorizaDatos" required className="mt-0.5 size-4 accent-[var(--brand)]" />
          Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y declaro que la información es veraz.
        </label>
        <Campo etiqueta="Firma electrónica" ayuda="Escribe tu nombre completo. Registramos fecha, hora, IP y huella del documento.">
          <Entrada name="firma" required className="font-medium italic" />
        </Campo>
      </div>
      <p className="text-xs text-subtle">
        Los soportes (RUT, cámara de comercio, cédula del representante, certificación bancaria) se cargan en el siguiente paso.
      </p>
      {estado && !estado.ok && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{estado.error}</p>}
      <Boton className="w-full" tamano="lg" disabled={pendiente}>
        {pendiente ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />} Firmar y enviar
      </Boton>
    </form>
  );
}
