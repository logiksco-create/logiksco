"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, CornerUpLeft, LoaderCircle, X } from "lucide-react";
import { BotonAbrirDO } from "./acciones-cotizacion";
import { revisarFormulario } from "@/server/acciones/app";
import { AreaTexto, Boton } from "@/components/ui";

export function Revision170({ id }: { id: string }) {
  const [obs, setObs] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  const [listas, setListas] = useState<{ id: string; consecutivo: string }[]>();

  const decidir = (d: "aprobado" | "devuelto" | "rechazado") =>
    iniciar(async () => {
      const r = await revisarFormulario(id, d, obs);
      if (!r.ok) setError(r.error);
      else if (d === "aprobado") setListas(r.datos.listas);
    });

  if (listas) {
    return (
      <div className="space-y-3 rounded-lg border border-success/30 bg-success-soft p-4 text-[13px]">
        <p className="flex items-center gap-2 font-medium text-success">
          <Check className="size-4" /> Circular 170 aprobada
        </p>
        {listas.length ? (
          <>
            <p className="text-fg">
              Siguiente paso: abrir el DO de {listas.map((q) => q.consecutivo).join(", ")}. Ya avisamos a Operaciones.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <BotonAbrirDO id={listas[0].id} />
              <Link href={`/app/cotizaciones/${listas[0].id}`} className="inline-flex items-center gap-1 font-medium text-brand-fg hover:underline">
                Ver cotización <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </>
        ) : (
          <p className="text-muted">El cliente no tiene cotizaciones aceptadas pendientes de DO.</p>
        )}
      </div>
    );
  }

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
