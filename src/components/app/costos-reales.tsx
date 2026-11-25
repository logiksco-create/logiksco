"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { Concepto } from "@/domain/types";
import { registrarCostoReal } from "@/server/acciones/crm";
import { Entrada } from "@/components/ui";
import { cn, dinero } from "@/lib/formato";

/** RF-29: costo real por concepto frente al cotizado (en la moneda del concepto). */
export function CostosReales({
  operacionId,
  conceptos,
  reales,
  editable,
}: {
  operacionId: string;
  conceptos: Concepto[];
  reales: Record<string, number>;
  editable: boolean;
}) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-y border-border bg-surface-2 text-left text-xs tracking-wide text-subtle uppercase">
          <th className="h-8 px-5 font-medium">Concepto</th>
          <th className="h-8 px-3 text-right font-medium">Cotizado</th>
          <th className="h-8 px-5 text-right font-medium">Real</th>
        </tr>
      </thead>
      <tbody>
        {conceptos.map((c) => (
          <Fila key={c.id} operacionId={operacionId} c={c} real={reales[c.id]} editable={editable} />
        ))}
      </tbody>
    </table>
  );
}

function Fila({ operacionId, c, real, editable }: { operacionId: string; c: Concepto; real?: number; editable: boolean }) {
  const cotizado = c.costoUnitario * c.cantidad;
  const [valor, setValor] = useState(real !== undefined ? String(real) : "");
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<"ok" | string | null>(null);
  const original = real !== undefined ? String(real) : "";
  const diferencia = real !== undefined ? real - cotizado : 0;

  const guardar = () => {
    if (valor === original) return;
    iniciar(async () => {
      const r = await registrarCostoReal(operacionId, c.id, valor);
      setEstado(r?.ok ? "ok" : (r?.error ?? "Error"));
    });
  };

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-5 py-2">
        <p className="font-medium">{c.descripcion}</p>
        {c.proveedorNombre && <p className="text-xs text-subtle">{c.proveedorNombre}</p>}
        {estado && estado !== "ok" && <p className="text-xs text-danger">{estado}</p>}
      </td>
      <td className="px-3 py-2 text-right text-muted tabular whitespace-nowrap">{dinero(cotizado, c.moneda)}</td>
      <td className="px-5 py-2 text-right">
        {editable ? (
          <div className="flex items-center justify-end gap-1.5">
            {pendiente ? (
              <LoaderCircle className="size-3.5 animate-spin text-subtle" />
            ) : (
              estado === "ok" && valor === original && <Check className="size-3.5 text-success" />
            )}
            <Entrada
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="—"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setEstado(null);
              }}
              onBlur={guardar}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              className="h-8 w-32 text-right tabular"
              aria-label={`Costo real de ${c.descripcion} en ${c.moneda}`}
            />
          </div>
        ) : (
          <span className="tabular">{real !== undefined ? dinero(real, c.moneda) : "—"}</span>
        )}
        {real !== undefined && diferencia !== 0 && (
          <p className={cn("mt-0.5 text-xs tabular", diferencia > 0 ? "text-danger" : "text-success")}>
            {diferencia > 0 ? "+" : ""}
            {dinero(diferencia, c.moneda)}
          </p>
        )}
      </td>
    </tr>
  );
}
