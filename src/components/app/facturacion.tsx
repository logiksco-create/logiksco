"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, KeyRound, LoaderCircle, Plus, Save, Send } from "lucide-react";
import type { LineaFactura, Moneda } from "@/domain/types";
import { totalesFactura } from "@/domain/facturacion";
import { conectarMegafoco, enviarAMegafoco, generarPrefactura, guardarLineas } from "@/server/acciones/facturacion";
import { Boton, Entrada, Selector } from "@/components/ui";
import { cn, dinero, fecha } from "@/lib/formato";

function Mensaje({ r }: { r?: { ok: boolean; mensaje?: string; error?: string } | null }) {
  if (!r) return null;
  return r.ok ? (
    <p className="flex items-center gap-1.5 text-[13px] text-success">
      <Check className="size-4" /> {r.mensaje}
    </p>
  ) : (
    <p className="text-[13px] text-danger">{r.error}</p>
  );
}

export function GenerarPrefactura({
  clienteId,
  operaciones,
}: {
  clienteId: string;
  operaciones: { id: string; consecutivo: string; abiertoEl: string; estado: string; venta: string }[];
}) {
  const [elegidas, setElegidas] = useState(operaciones.map((o) => o.id));
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<{ ok: boolean; error?: string } | null>(null);
  return (
    <div>
      <ul className="divide-y divide-border">
        {operaciones.map((o) => (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand)]"
                checked={elegidas.includes(o.id)}
                onChange={(e) => setElegidas((x) => (e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id)))}
              />
              <span className="font-mono font-medium">{o.consecutivo}</span>
              <span className="text-muted">abierto {fecha(o.abiertoEl)} · {o.estado}</span>
              <span className="ml-auto tabular">{o.venta}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <Mensaje r={r} />
        <Boton
          tamano="sm"
          className="ml-auto"
          disabled={pendiente || elegidas.length === 0}
          onClick={() =>
            iniciar(async () => {
              const x = await generarPrefactura(clienteId, elegidas);
              if (x && !x.ok) setR(x);
            })
          }
        >
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Plus />} Generar prefactura ({elegidas.length})
        </Boton>
      </div>
    </div>
  );
}

export function EditorPrefactura({
  id,
  lineasIniciales,
  moneda,
  editable,
}: {
  id: string;
  lineasIniciales: LineaFactura[];
  moneda: Moneda;
  editable: boolean;
}) {
  const [lineas, setLineas] = useState(lineasIniciales);
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<{ ok: boolean; mensaje?: string; error?: string } | null>(null);
  const t = totalesFactura(lineas);
  const cambiar = (i: number, c: Partial<LineaFactura>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)));
  const sucias = JSON.stringify(lineas) !== JSON.stringify(lineasIniciales);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs tracking-wide text-subtle uppercase">
              <th className="h-9 px-4 font-medium">Concepto</th>
              <th className="h-9 px-3 font-medium">Ingreso</th>
              <th className="h-9 px-3 text-right font-medium">Cant.</th>
              <th className="h-9 px-3 text-right font-medium">Valor unit.</th>
              <th className="h-9 px-3 text-right font-medium">IVA %</th>
              <th className="h-9 px-4 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} className="border-b border-border">
                <td className="px-4 py-2">
                  {editable ? (
                    <Entrada value={l.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} className="h-8 min-w-56" />
                  ) : (
                    l.descripcion
                  )}
                </td>
                <td className="px-3 py-2">
                  {editable ? (
                    <Selector
                      value={l.tipo}
                      onChange={(e) => cambiar(i, { tipo: e.target.value as LineaFactura["tipo"], ivaPct: e.target.value === "terceros" ? 0 : l.ivaPct })}
                      className="h-8 w-32"
                    >
                      <option value="propio">Propio</option>
                      <option value="terceros">Para terceros</option>
                    </Selector>
                  ) : (
                    <span className={cn("text-xs", l.tipo === "terceros" ? "text-info" : "text-muted")}>
                      {l.tipo === "propio" ? "Propio" : "Para terceros"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular">{l.cantidad}</td>
                <td className="px-3 py-2 text-right tabular whitespace-nowrap">{dinero(l.valorUnitario, moneda)}</td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <Entrada
                      type="number"
                      min={0}
                      max={100}
                      value={l.ivaPct}
                      onChange={(e) => cambiar(i, { ivaPct: Number(e.target.value) })}
                      className="ml-auto h-8 w-20 text-right tabular"
                      disabled={l.tipo === "terceros"}
                    />
                  ) : (
                    <span className="tabular">{l.ivaPct}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular whitespace-nowrap">{dinero(l.cantidad * l.valorUnitario, moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          {editable && (
            <p className="max-w-sm text-xs text-subtle">
              El IVA es una sugerencia: los ingresos para terceros no llevan IVA de la empresa. Tu contador lo confirma en Megafoco.
            </p>
          )}
          <Mensaje r={r} />
          {editable && sucias && (
            <Boton
              variante="secundario"
              tamano="sm"
              disabled={pendiente}
              onClick={() => iniciar(async () => setR(await guardarLineas(id, lineas)))}
            >
              {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar cambios
            </Boton>
          )}
        </div>
        <dl className="min-w-64 space-y-1.5 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-muted">Ingresos propios</dt>
            <dd className="tabular">{dinero(t.propios, moneda)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted">Ingresos para terceros</dt>
            <dd className="tabular">{dinero(t.terceros, moneda)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted">IVA</dt>
            <dd className="tabular">{dinero(t.iva, moneda)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{dinero(t.total, moneda)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function BotonEnviarMegafoco({ id, texto }: { id: string; texto: string }) {
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<{ ok: boolean; mensaje?: string; error?: string } | null>(null);
  return (
    <div className="space-y-2">
      <Boton disabled={pendiente} onClick={() => iniciar(async () => setR(await enviarAMegafoco(id)))}>
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Send />} {texto}
      </Boton>
      <Mensaje r={r} />
    </div>
  );
}

export function FormMegafoco({ conectado, editable }: { conectado: boolean; editable: boolean }) {
  const [estado, accion, pendiente] = useActionState(conectarMegafoco, null);
  return (
    <form action={accion} className="space-y-3 p-5">
      <p className="text-[13px] text-muted">
        {conectado
          ? "Conectado. La llave está cifrada en la bóveda y nunca se muestra; puedes reemplazarla."
          : "Genera una llave de API en Megafoco y pégala aquí. Se guarda cifrada y solo el servidor la usa."}
      </p>
      {editable && (
        <>
          <div className="flex gap-2">
            <Entrada name="llave" type="password" autoComplete="off" placeholder="Llave de API de Megafoco" required />
            <Boton disabled={pendiente}>
              {pendiente ? <LoaderCircle className="animate-spin" /> : <KeyRound />} {conectado ? "Reemplazar" : "Conectar"}
            </Boton>
          </div>
          <Mensaje r={estado} />
        </>
      )}
    </form>
  );
}
