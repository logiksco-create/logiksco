"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, KeyRound, LoaderCircle, Plus, Save, Send } from "lucide-react";
import type { IvaFinppi, LineaFactura, Moneda } from "@/domain/types";
import { FINPPI, ivaPorDefecto, lineasEnCop, pctIva, totalesCop, totalesOriginales } from "@/domain/einvoice";
import { conectarMegafoco, enviarAMegafoco, generarPrefactura, guardarLineas } from "@/server/acciones/facturacion";
import { Boton, Entrada, Selector } from "@/components/ui";
import { cn, dinero, fecha, pesosExactos } from "@/lib/formato";

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
  productosFinppi = [],
  trmReferencia,
}: {
  id: string;
  lineasIniciales: LineaFactura[];
  moneda: Moneda;
  editable: boolean;
  productosFinppi?: { codigo: string; nombre: string; iva?: IvaFinppi }[];
  trmReferencia?: number;
}) {
  const [lineas, setLineas] = useState(lineasIniciales);
  const [pendiente, iniciar] = useTransition();
  const [r, setR] = useState<{ ok: boolean; mensaje?: string; error?: string } | null>(null);
  const cambiar = (i: number, c: Partial<LineaFactura>) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...c } : l)));
  const sucias = JSON.stringify(lineas) !== JSON.stringify(lineasIniciales);
  const enUsd = moneda === "USD";
  const conTrm = enUsd && !!trmReferencia;
  const cop = lineasEnCop(lineas, moneda, trmReferencia ?? 1);
  const to = totalesOriginales(cop);
  const tc = totalesCop(cop);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs tracking-wide text-subtle uppercase">
              <th className="h-9 px-4 font-medium">Concepto</th>
              <th className="h-9 px-3 font-medium">Producto Finppi</th>
              <th className="h-9 px-3 font-medium">IVA</th>
              <th className="h-9 px-3 text-right font-medium">Cant.</th>
              <th className="h-9 px-3 text-right font-medium">Unitario {moneda}</th>
              {enUsd && <th className="h-9 px-3 text-right font-medium">Unitario COP</th>}
              <th className="h-9 px-4 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const iva = l.ivaFinppi ?? ivaPorDefecto(l);
              return (
                <tr key={i} className="border-b border-border align-top">
                  <td className="px-4 py-2">
                    {editable ? (
                      <Entrada value={l.descripcion} onChange={(e) => cambiar(i, { descripcion: e.target.value })} className="h-8 min-w-56" />
                    ) : (
                      l.descripcion
                    )}
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                      <input
                        type="checkbox"
                        disabled={!editable}
                        className="size-3.5 accent-[var(--brand)]"
                        checked={l.tipo === "terceros"}
                        onChange={(e) =>
                          cambiar(i, e.target.checked ? { tipo: "terceros", ivaFinppi: "Ninguno", ivaPct: 0 } : { tipo: "propio", ivaFinppi: "IVA-19", ivaPct: 19 })
                        }
                      />
                      Ingreso para terceros
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Selector
                        value={l.productoFinppi ?? ""}
                        onChange={(e) => {
                          const p = productosFinppi.find((x) => x.codigo === e.target.value);
                          const nuevoIva = p?.iva ?? iva;
                          cambiar(i, { productoFinppi: e.target.value || undefined, ivaFinppi: nuevoIva, ivaPct: pctIva(nuevoIva) });
                        }}
                        className={cn("h-8 w-48", !l.productoFinppi && "border-warning/60")}
                      >
                        <option value="">Elige…</option>
                        {productosFinppi.map((p) => (
                          <option key={p.codigo} value={p.codigo}>
                            {p.codigo} - {p.nombre}
                          </option>
                        ))}
                        {l.productoFinppi && !productosFinppi.some((p) => p.codigo === l.productoFinppi) && (
                          <option value={l.productoFinppi}>{l.productoFinppi}</option>
                        )}
                      </Selector>
                    ) : (
                      <span className="font-mono text-xs">{l.productoFinppi ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Selector value={iva} onChange={(e) => cambiar(i, { ivaFinppi: e.target.value as IvaFinppi, ivaPct: pctIva(e.target.value as IvaFinppi) })} className="h-8 w-28">
                        {FINPPI.iva.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Selector>
                    ) : (
                      <span className="text-xs">{iva}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular">{l.cantidad}</td>
                  <td className="px-3 py-2 text-right tabular whitespace-nowrap">{dinero(l.valorUnitario, moneda)}</td>
                  {enUsd && (
                    <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap text-muted">
                      {conTrm ? cop[i].precioCop.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right tabular whitespace-nowrap">{dinero(cop[i].subtotalOriginal, moneda)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          {editable && (
            <p className="max-w-sm text-xs text-subtle">
              Producto e IVA exactamente como en Finppi. Los ingresos para terceros van sin IVA («Ninguno»).
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
        <div className="flex flex-wrap gap-6">
          <dl className="min-w-52 space-y-1.5 text-sm">
            <div className="flex justify-between gap-6">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular">{dinero(to.subtotal, moneda)}</dd>
            </div>
            {to.terceros > 0 && (
              <div className="flex justify-between gap-6 text-xs">
                <dt className="text-subtle">de ello, para terceros</dt>
                <dd className="tabular text-subtle">{dinero(to.terceros, moneda)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-6">
              <dt className="text-muted">IVA</dt>
              <dd className="tabular">{dinero(to.iva, moneda)}</dd>
            </div>
            <div className="flex justify-between gap-6 border-t border-border pt-2 text-base font-semibold">
              <dt>Total {moneda}</dt>
              <dd className="tabular">{dinero(to.total, moneda)}</dd>
            </div>
          </dl>
          {enUsd && (
            <dl className="min-w-52 space-y-1.5 rounded-lg bg-brand-soft p-3 text-sm text-brand-fg">
              <div className="flex justify-between gap-6 text-xs">
                <dt>A la DIAN en pesos</dt>
                <dd className="font-mono">{conTrm ? `TRM ${trmReferencia!.toLocaleString("es-CO")}` : "falta TRM"}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt>Subtotal</dt>
                <dd className="tabular">{conTrm ? pesosExactos(tc.subtotal) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt>IVA</dt>
                <dd className="tabular">{conTrm ? pesosExactos(tc.iva) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-6 border-t border-brand/20 pt-2 text-base font-semibold">
                <dt>Total COP</dt>
                <dd className="tabular">{conTrm ? pesosExactos(tc.total) : "—"}</dd>
              </div>
            </dl>
          )}
        </div>
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
