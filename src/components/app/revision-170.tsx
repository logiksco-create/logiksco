"use client";

import { useState, useTransition } from "react";
import { Check, CornerUpLeft, LoaderCircle, X } from "lucide-react";
import { revisarFormulario } from "@/server/acciones/app";
import { AreaTexto, Boton } from "@/components/ui";

export function Revision170({ id }: { id: string }) {
  const [obs, setObs] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();

  const decidir = (d: "aprobado" | "devuelto" | "rechazado") =>
    iniciar(async () => {
      const r = await revisarFormulario(id, d, obs);
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="space-y-2.5">
      <AreaTexto
        rows={2}
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observaciones para el cliente (obligatorias si devuelves o rechazas)"
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton variante="exito" tamano="sm" disabled={pendiente} onClick={() => decidir("aprobado")}>
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Check />} Aprobar
        </Boton>
        <Boton variante="secundario" tamano="sm" disabled={pendiente} onClick={() => decidir("devuelto")}>
          <CornerUpLeft /> Devolver
        </Boton>
        <Boton variante="fantasma" tamano="sm" className="text-danger hover:text-danger" disabled={pendiente} onClick={() => decidir("rechazado")}>
          <X /> Rechazar
        </Boton>
      </div>
    </div>
  );
}
