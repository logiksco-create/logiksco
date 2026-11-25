"use client";

import { useActionState } from "react";
import { Check, LoaderCircle, UserPlus } from "lucide-react";
import { invitarAlPortal } from "@/server/acciones/portal";
import { Boton, Entrada, Selector } from "@/components/ui";

export function InvitarPortal({
  terceroId,
  contactos,
}: {
  terceroId: string;
  contactos: { nombre: string; correo: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(invitarAlPortal.bind(null, terceroId), null);
  return (
    <form action={accion} className="space-y-2.5">
      {contactos.length > 0 ? (
        <Selector
          name="correo"
          aria-label="Contacto"
          onChange={(e) => {
            const n = e.currentTarget.form?.elements.namedItem("nombre") as HTMLInputElement | null;
            if (n) n.value = contactos.find((c) => c.correo === e.target.value)?.nombre ?? "";
          }}
          defaultValue={contactos[0].correo}
        >
          {contactos.map((c) => (
            <option key={c.correo} value={c.correo}>
              {c.nombre} · {c.correo}
            </option>
          ))}
        </Selector>
      ) : (
        <Entrada name="correo" type="email" placeholder="correo@cliente.co" required />
      )}
      <Entrada name="nombre" defaultValue={contactos[0]?.nombre ?? ""} placeholder="Nombre" required />
      {estado && !estado.ok && <p className="text-[13px] text-danger">{estado.error}</p>}
      {estado?.ok && (
        <p className="flex items-center gap-1.5 text-[13px] text-success">
          <Check className="size-4" /> {estado.mensaje}
        </p>
      )}
      <Boton tamano="sm" disabled={pendiente} className="w-full">
        {pendiente ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Invitar al portal
      </Boton>
    </form>
  );
}
