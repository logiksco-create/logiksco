"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  Copy,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  BLOQUES,
  INCOTERMS,
  TIPOS_SERVICIO,
  UNIDADES,
  type Bloque,
  type Concepto,
  type DatosFacturacion,
  type IvaFinppi,
  type Moneda,
  type Tercero,
} from "@/domain/types";
import type { OpcionesClienteFinppi } from "@/domain/types";
import { FINPPI, faltantesFiscales, fiscalSugerido } from "@/domain/einvoice";
import { CompletarDatosFiscales } from "@/components/app/factura-electronica";
import { tarifasVencidas, totalesConcepto, totalesConceptos, totalesPorBloque } from "@/domain/cotizacion";
import { guardarCotizacion, type EntradaCotizacion } from "@/server/acciones/app";
import { AreaTexto, Boton, Campo, Entrada, Selector, Tarjeta } from "@/components/ui";
import { Combo } from "@/components/ui/combo";
import { DialogoProducto, DialogoTercero } from "@/components/app/crear-rapido";
import { cn, dinero, porcentaje } from "@/lib/formato";

type ConceptoEditable = Omit<Concepto, "id"> & { clave: string };

export interface PropsEditor {
  id?: string;
  inicial: Omit<EntradaCotizacion, "conceptos"> & { conceptos: Omit<Concepto, "id">[] };
  clientes: Tercero[];
  proveedores: { id: string; nombre: string }[];
  hoy: string;
  aviso?: { duplicada: boolean; vencidas: number; origen?: string };
  trmDia?: { valor: number; fecha: string; oficial: boolean };
  /** Sugerencias de catálogos (RF-54). */
  lugares?: string[];
  conceptosCatalogo?: { nombre: string; bloque?: Bloque; moneda?: Moneda; unidad?: Concepto["unidad"]; paraTerceros?: boolean }[];
  servicios?: string[];
  /** Productos de Finppi de la empresa (código exacto + IVA por defecto). */
  productosFinppi?: { codigo: string; nombre: string; iva?: IvaFinppi }[];
  /** Listas reales del panel de cliente de Finppi. */
  opcionesFinppi?: OpcionesClienteFinppi;
}

const facturacionPorDefecto = (c?: Tercero, moneda: Moneda = "COP"): DatosFacturacion => ({
  monedaFactura: c?.acuerdo?.moneda ?? moneda,
  tipoPago: c?.acuerdo?.plazoPagoDias ? "Crédito" : "Contado",
  plazoDias: c?.acuerdo?.plazoPagoDias ?? 0,
  metodoPago: "Acuerdo mutuo",
  tipoOperacion: "Estándar",
});

let secuencia = 0;
const clave = () => `k${++secuencia}`;

const num = (v: string) => (v === "" ? 0 : Number(v.replace(",", ".")));

function SeccionTitulo({ n, titulo, descripcion }: { n: number; titulo: string; descripcion?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-5 py-4">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-fg">
        {n}
      </span>
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{titulo}</h2>
        {descripcion && <p className="text-[13px] text-muted">{descripcion}</p>}
      </div>
    </div>
  );
}

export function EditorCotizacion({
  id,
  inicial,
  clientes,
  proveedores,
  hoy,
  aviso,
  trmDia,
  lugares = [],
  conceptosCatalogo = [],
  servicios = [],
  productosFinppi = [],
  opcionesFinppi,
}: PropsEditor) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();

  const [f, setF] = useState(() => {
    const { conceptos: _ignorar, ...resto } = inicial;
    return {
      ...resto,
      facturacion:
        resto.facturacion ??
        facturacionPorDefecto(clientes.find((c) => c.id === resto.clienteId), resto.monedaPresentacion as Moneda),
    };
  });
  const fac = f.facturacion!;
  const setFac = (cambio: Partial<DatosFacturacion>) => setF((p) => ({ ...p, facturacion: { ...p.facturacion!, ...cambio } }));
  const [conceptos, setConceptos] = useState<ConceptoEditable[]>(() =>
    inicial.conceptos.map((c) => ({ ...c, clave: clave() })),
  );

  // Lo creado sin salir de la cotización se suma a las listas de inmediato.
  const [clientesNuevos, setClientesNuevos] = useState<Tercero[]>([]);
  const [proveedoresNuevos, setProveedoresNuevos] = useState<{ id: string; nombre: string }[]>([]);
  const [productosNuevos, setProductosNuevos] = useState<{ codigo: string; nombre: string; iva?: IvaFinppi }[]>([]);
  const todosClientes = [...clientes, ...clientesNuevos.filter((n) => !clientes.some((c) => c.id === n.id))];
  const todosProveedores = [...proveedores, ...proveedoresNuevos.filter((n) => !proveedores.some((c) => c.id === n.id))];
  const todosProductos = [...productosFinppi.filter((p) => !productosNuevos.some((n) => n.codigo === p.codigo)), ...productosNuevos];
  const [dlgTercero, setDlgTercero] = useState<null | { tipo: "cliente" | "proveedor"; nombre: string; alCrear: (t: Tercero) => void }>(null);
  const [dlgProducto, setDlgProducto] = useState<null | { nombre: string; iva: IvaFinppi; alCrear: (p: { codigo: string; nombre: string; iva?: IvaFinppi }) => void }>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const setMercancia = (k: keyof typeof f.mercancia, v: unknown) =>
    setF((p) => ({ ...p, mercancia: { ...p.mercancia, [k]: v } }));

  const cliente = todosClientes.find((c) => c.id === f.clienteId);

  const cambiarCliente = (clienteId: string, nuevo?: Tercero) => {
    const c = nuevo ?? todosClientes.find((x) => x.id === clienteId);
    setF((p) => ({
      ...p,
      clienteId,
      contactoId: c?.contactos[0]?.id,
      // RF-10: al cambiar de cliente se aplican sus condiciones comerciales.
      monedaPresentacion: c?.acuerdo?.moneda ?? p.monedaPresentacion,
      facturacion: { ...p.facturacion!, ...facturacionPorDefecto(c, c?.acuerdo?.moneda ?? p.monedaPresentacion), metodoPago: p.facturacion!.metodoPago, tipoOperacion: p.facturacion!.tipoOperacion },
    }));
  };

  const actualizar = (k: string, cambio: Partial<ConceptoEditable>) =>
    setConceptos((cs) => cs.map((c) => (c.clave === k ? { ...c, ...cambio } : c)));

  const agregar = (bloque: Bloque) =>
    setConceptos((cs) => [
      ...cs,
      {
        clave: clave(),
        bloque,
        descripcion: "",
        moneda: bloque === "flete" || bloque === "origen" ? "USD" : "COP",
        unidad: "embarque",
        cantidad: 1,
        costoUnitario: 0,
        ventaUnitaria: 0,
      },
    ]);

  const quitar = (k: string) => setConceptos((cs) => cs.filter((c) => c.clave !== k));
  const duplicarFila = (k: string) =>
    setConceptos((cs) => {
      const i = cs.findIndex((c) => c.clave === k);
      return [...cs.slice(0, i + 1), { ...cs[i], clave: clave() }, ...cs.slice(i + 1)];
    });

  const comoConceptos = conceptos.map((c) => ({ ...c, id: c.clave }));
  const totales = useMemo(
    () => totalesConceptos(comoConceptos, f.monedaPresentacion as Moneda, f.trm || 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conceptos, f.monedaPresentacion, f.trm],
  );
  const porBloque = totalesPorBloque(comoConceptos, f.monedaPresentacion as Moneda, f.trm || 1);
  const vencidas = tarifasVencidas(comoConceptos, hoy);
  const vencenAntesQueCotizacion = tarifasVencidas(comoConceptos, f.vigenteHasta).filter(
    (c) => !vencidas.includes(c),
  );

  const bloquesUsados = (Object.keys(BLOQUES) as Bloque[]).filter((b) => conceptos.some((c) => c.bloque === b));
  const bloquesLibres = (Object.keys(BLOQUES) as Bloque[]).filter((b) => !bloquesUsados.includes(b));

  const guardar = () => {
    setError(undefined);
    iniciar(async () => {
      const r = await guardarCotizacion(
        {
          ...f,
          conceptos: conceptos.map(({ clave: _clave, ...c }) => ({
            ...c,
            vigenciaTarifa: c.vigenciaTarifa || undefined,
            proveedorId: c.proveedorId || undefined,
          })),
        } as EntradaCotizacion,
        id,
      );
      if (r.ok) router.push(`/app/cotizaciones/${r.datos.id}`);
      else setError(r.error);
    });
  };

  const mon = f.monedaPresentacion as Moneda;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        {aviso?.duplicada && (
          <div className="flex gap-3 rounded-xl border border-brand/20 bg-brand-soft p-4 text-[13.5px] text-brand-fg">
            <Copy className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Cotización duplicada{aviso.origen ? ` de ${aviso.origen}` : ""}.</p>
              <p className="opacity-80">
                Puedes cambiar cualquier dato, incluido el cliente.
                {aviso.vencidas > 0 &&
                  ` Ojo: ${aviso.vencidas} tarifa${aviso.vencidas > 1 ? "s" : ""} copiada${aviso.vencidas > 1 ? "s" : ""} ya ${aviso.vencidas > 1 ? "están vencidas" : "está vencida"}.`}
              </p>
            </div>
          </div>
        )}

        <Tarjeta>
          <SeccionTitulo n={1} titulo="Cliente y servicio" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Campo etiqueta="Cliente o prospecto">
              <Combo
                ariaLabel="Cliente o prospecto"
                valor={f.clienteId}
                placeholder="Busca o crea el cliente…"
                opciones={todosClientes.map((c) => ({
                  valor: c.id,
                  etiqueta: c.razonSocial,
                  detalle: c.tipo === "prospecto" ? "prospecto" : c.nit,
                }))}
                alElegir={(o) => cambiarCliente(o.valor)}
                crear={{
                  etiqueta: (t) => (t ? `Crear cliente «${t}»` : "Crear cliente nuevo"),
                  alCrear: (t) =>
                    setDlgTercero({
                      tipo: "cliente",
                      nombre: t,
                      alCrear: (nuevo) => {
                        setClientesNuevos((l) => [...l, nuevo]);
                        cambiarCliente(nuevo.id, nuevo);
                      },
                    }),
                }}
              />
            </Campo>
            <Campo etiqueta="Contacto">
              <Selector
                value={f.contactoId ?? ""}
                onChange={(e) => set("contactoId", e.target.value || undefined)}
                disabled={!cliente?.contactos.length}
              >
                {(cliente?.contactos ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nombre}
                    {k.cargo ? ` · ${k.cargo}` : ""}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Tipo de servicio">
              <Selector value={f.tipoServicio} onChange={(e) => set("tipoServicio", e.target.value as typeof f.tipoServicio)}>
                {Object.entries(TIPOS_SERVICIO)
                  .filter(([v]) => servicios.length === 0 || servicios.includes(v) || v === f.tipoServicio)
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Incoterm">
              <Selector value={f.incoterm} onChange={(e) => set("incoterm", e.target.value as typeof f.incoterm)}>
                {INCOTERMS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Origen" ayuda="Puerto, aeropuerto o ciudad">
              <Combo
                libre
                ariaLabel="Origen"
                valor={f.origen}
                placeholder="Ningbo, China"
                opciones={lugares.map((l) => ({ valor: l, etiqueta: l }))}
                alEscribir={(t) => set("origen", t)}
                alElegir={(o) => set("origen", o.valor)}
              />
            </Campo>
            <Campo etiqueta="Destino">
              <Combo
                libre
                ariaLabel="Destino"
                valor={f.destino}
                placeholder="Rionegro, Antioquia"
                opciones={lugares.map((l) => ({ valor: l, etiqueta: l }))}
                alEscribir={(t) => set("destino", t)}
                alElegir={(o) => set("destino", o.valor)}
              />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta>
          <SeccionTitulo n={2} titulo="Mercancía" />
          <div className="grid gap-4 p-5 sm:grid-cols-6">
            <Campo etiqueta="Descripción" className="sm:col-span-6">
              <Entrada
                value={f.mercancia.descripcion}
                onChange={(e) => setMercancia("descripcion", e.target.value)}
                placeholder="Maquinaria agrícola"
              />
            </Campo>
            <Campo etiqueta="Piezas" className="sm:col-span-2">
              <Entrada type="number" min={0} inputMode="numeric" value={f.mercancia.piezas} onChange={(e) => setMercancia("piezas", num(e.target.value))} />
            </Campo>
            <Campo etiqueta="Peso (kg)" className="sm:col-span-2">
              <Entrada type="number" min={0} step="any" value={f.mercancia.pesoKg} onChange={(e) => setMercancia("pesoKg", num(e.target.value))} />
            </Campo>
            <Campo etiqueta="Volumen (m³)" className="sm:col-span-2">
              <Entrada type="number" min={0} step="any" value={f.mercancia.volumenM3} onChange={(e) => setMercancia("volumenM3", num(e.target.value))} />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta>
          <SeccionTitulo
            n={3}
            titulo="Conceptos"
            descripcion="Costo y venta por concepto. El cliente nunca ve costos ni utilidad."
          />
          <div className="divide-y divide-border">
            {bloquesUsados.map((b) => (
              <div key={b} className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{BLOQUES[b]}</h3>
                  {porBloque[b] && (
                    <p className="text-[13px] text-muted tabular">
                      {dinero(porBloque[b]!.venta, mon)} ·{" "}
                      <span className={porBloque[b]!.utilidad < 0 ? "text-danger" : "text-success"}>
                        +{dinero(porBloque[b]!.utilidad, mon)}
                      </span>
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  {conceptos
                    .filter((c) => c.bloque === b)
                    .map((c) => {
                      const t = totalesConcepto({ ...c, id: c.clave });
                      const vencida = vencidas.some((v) => v.id === c.clave);
                      return (
                        <div
                          key={c.clave}
                          className={cn(
                            "rounded-lg border bg-surface-2 p-3",
                            vencida ? "border-danger/40" : "border-border",
                          )}
                        >
                          <div className="grid gap-2.5 sm:grid-cols-12">
                            <label className="sm:col-span-7">
                              <span className="mb-1 block text-[11px] text-subtle">Concepto</span>
                              <Combo
                                libre
                                ariaLabel="Descripción"
                                valor={c.descripcion}
                                placeholder={`Ej.: ${conceptosCatalogo.find((x) => x.bloque === b)?.nombre ?? "Descripción del concepto"}`}
                                vacio="Escribe la descripción"
                                opciones={conceptosCatalogo
                                  .filter((x) => !x.bloque || x.bloque === b)
                                  .map((x) => ({ valor: x.nombre, etiqueta: x.nombre, detalle: x.paraTerceros ? "terceros" : x.moneda }))}
                                alEscribir={(t) => actualizar(c.clave, { descripcion: t })}
                                alElegir={(o) => {
                                  const cat = conceptosCatalogo.find((x) => x.nombre === o.valor);
                                  // Al elegir del catálogo en una fila nueva, se traen moneda, unidad y tipo.
                                  actualizar(
                                    c.clave,
                                    cat && c.costoUnitario === 0 && c.ventaUnitaria === 0
                                      ? { descripcion: o.valor, moneda: cat.moneda ?? c.moneda, unidad: cat.unidad ?? c.unidad, paraTerceros: cat.paraTerceros ?? c.paraTerceros }
                                      : { descripcion: o.valor },
                                  );
                                }}
                              />
                            </label>
                            <label className="sm:col-span-5">
                              <span className="mb-1 block text-[11px] text-subtle">Proveedor</span>
                              <Combo
                                ariaLabel="Proveedor"
                                valor={c.proveedorId ?? ""}
                                placeholder="Sin proveedor"
                                opciones={[{ valor: "", etiqueta: "Sin proveedor" }, ...todosProveedores.map((p) => ({ valor: p.id, etiqueta: p.nombre }))]}
                                alElegir={(o) =>
                                  actualizar(c.clave, {
                                    proveedorId: o.valor || undefined,
                                    proveedorNombre: o.valor ? o.etiqueta : undefined,
                                  })
                                }
                                crear={{
                                  etiqueta: (t) => (t ? `Crear proveedor «${t}»` : "Crear proveedor nuevo"),
                                  alCrear: (t) =>
                                    setDlgTercero({
                                      tipo: "proveedor",
                                      nombre: t,
                                      alCrear: (nuevo) => {
                                        setProveedoresNuevos((l) => [...l, { id: nuevo.id, nombre: nuevo.razonSocial }]);
                                        actualizar(c.clave, { proveedorId: nuevo.id, proveedorNombre: nuevo.razonSocial });
                                      },
                                    }),
                                }}
                              />
                            </label>
                          </div>
                          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-[88px_120px_1fr_1fr_1fr_150px]">
                            <label>
                              <span className="mb-1 block text-[11px] text-subtle">Moneda</span>
                              <Selector value={c.moneda} onChange={(e) => actualizar(c.clave, { moneda: e.target.value as Moneda })}>
                                <option>COP</option>
                                <option>USD</option>
                              </Selector>
                            </label>
                            <label>
                              <span className="mb-1 block text-[11px] text-subtle">Unidad</span>
                              <Selector value={c.unidad} onChange={(e) => actualizar(c.clave, { unidad: e.target.value as Concepto["unidad"] })}>
                                {Object.entries(UNIDADES).map(([v, l]) => (
                                  <option key={v} value={v}>
                                    {l.replace("Por ", "")}
                                  </option>
                                ))}
                              </Selector>
                            </label>
                            <label>
                              <span className="mb-1 block text-[11px] text-subtle">Cantidad</span>
                              <Entrada type="number" min={0} step="any" className="tabular" value={c.cantidad} onChange={(e) => actualizar(c.clave, { cantidad: num(e.target.value) })} />
                            </label>
                            <label>
                              <span className="mb-1 block text-[11px] text-subtle">Costo unit.</span>
                              <Entrada type="number" min={0} step="any" className="tabular" value={c.costoUnitario} onChange={(e) => actualizar(c.clave, { costoUnitario: num(e.target.value) })} />
                            </label>
                            <label>
                              <span className="mb-1 block text-[11px] text-subtle">Venta unit.</span>
                              <Entrada type="number" min={0} step="any" className="tabular" value={c.ventaUnitaria} onChange={(e) => actualizar(c.clave, { ventaUnitaria: num(e.target.value) })} />
                            </label>
                            <label>
                              <span className={cn("mb-1 block text-[11px]", vencida ? "text-danger" : "text-subtle")}>
                                {vencida ? "Tarifa vencida" : "Vigencia tarifa"}
                              </span>
                              <Entrada
                                type="date"
                                className={cn(vencida && "border-danger/50 text-danger")}
                                value={c.vigenciaTarifa ?? ""}
                                onChange={(e) => actualizar(c.clave, { vigenciaTarifa: e.target.value || undefined })}
                              />
                            </label>
                          </div>
                          <div className="mt-2.5 grid grid-cols-[1fr_110px] gap-2.5 sm:grid-cols-[1fr_130px]">
                            <label>
                              <span className="mb-1 block text-[11px] text-subtle">Producto (para la factura)</span>
                              <Combo
                                ariaLabel="Producto"
                                valor={c.productoFinppi ?? ""}
                                placeholder="Elige o crea el producto…"
                                opciones={[
                                  ...todosProductos.map((p) => ({ valor: p.codigo, etiqueta: p.nombre, detalle: `${p.codigo}${p.iva ? ` · ${p.iva}` : ""}` })),
                                  ...(c.productoFinppi && !todosProductos.some((p) => p.codigo === c.productoFinppi)
                                    ? [{ valor: c.productoFinppi, etiqueta: c.productoFinppi }]
                                    : []),
                                ]}
                                alElegir={(o) => {
                                  const p = todosProductos.find((x) => x.codigo === o.valor);
                                  // El producto trae su IVA preestablecido; luego se puede cambiar.
                                  actualizar(c.clave, { productoFinppi: o.valor || undefined, ivaFinppi: p?.iva ?? c.ivaFinppi });
                                }}
                                crear={{
                                  etiqueta: (t) => (t ? `Crear producto «${t}»` : "Crear producto nuevo"),
                                  alCrear: (t) =>
                                    setDlgProducto({
                                      nombre: t || c.descripcion,
                                      iva: c.paraTerceros ? "Ninguno" : c.ivaFinppi ?? "IVA-19",
                                      alCrear: (nuevo) => {
                                        setProductosNuevos((l) => [...l, nuevo]);
                                        actualizar(c.clave, { productoFinppi: nuevo.codigo, ivaFinppi: nuevo.iva ?? c.ivaFinppi });
                                      },
                                    }),
                                }}
                              />
                            </label>
                            <label>
                              <span className="mb-1 block text-[11px] text-subtle">IVA</span>
                              <Selector
                                value={c.ivaFinppi ?? (c.paraTerceros ? "Ninguno" : "IVA-19")}
                                onChange={(e) => actualizar(c.clave, { ivaFinppi: e.target.value as IvaFinppi })}
                              >
                                {FINPPI.iva.map((v) => (
                                  <option key={v}>{v}</option>
                                ))}
                              </Selector>
                            </label>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                            <label className="flex items-center gap-2 text-muted">
                              <input
                                type="checkbox"
                                className="size-4 accent-[var(--brand)]"
                                checked={!!c.paraTerceros}
                                onChange={(e) =>
                                  actualizar(c.clave, {
                                    paraTerceros: e.target.checked,
                                    ivaFinppi: e.target.checked ? "Ninguno" : c.ivaFinppi === "Ninguno" ? "IVA-19" : c.ivaFinppi,
                                  })
                                }
                              />
                              Ingreso para terceros
                            </label>
                            <div className="flex items-center gap-3">
                              <span className="text-muted tabular">
                                Venta <strong className="font-medium text-fg">{dinero(t.venta, c.moneda)}</strong>
                              </span>
                              <span className={cn("tabular", t.utilidad < 0 ? "text-danger" : "text-success")}>
                                Utilidad {dinero(t.utilidad, c.moneda)}
                              </span>
                              <button type="button" onClick={() => duplicarFila(c.clave)} className="rounded-md p-1.5 text-subtle hover:bg-surface hover:text-fg" aria-label="Duplicar concepto">
                                <Copy className="size-3.5" />
                              </button>
                              <button type="button" onClick={() => quitar(c.clave)} className="rounded-md p-1.5 text-subtle hover:bg-danger-soft hover:text-danger" aria-label="Eliminar concepto">
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  <button
                    type="button"
                    onClick={() => agregar(b)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-fg hover:underline"
                  >
                    <Plus className="size-3.5" /> Agregar en {BLOQUES[b].toLowerCase()}
                  </button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 px-5 py-4">
              <span className="text-[13px] text-muted">Agregar bloque:</span>
              {bloquesLibres.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => agregar(b)}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border-strong px-3 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand-fg"
                >
                  <Plus className="size-3" /> {BLOQUES[b]}
                </button>
              ))}
            </div>
          </div>
        </Tarjeta>

        <Tarjeta>
          <SeccionTitulo n={4} titulo="Términos y condiciones" />
          <div className="p-5">
            <AreaTexto rows={4} value={f.terminos} onChange={(e) => set("terminos", e.target.value)} />
          </div>
        </Tarjeta>

        <Tarjeta>
          <SeccionTitulo
            n={5}
            titulo="Facturación electrónica"
            descripcion="Lo que necesitará Finppi. Al facturar solo confirmas con un clic."
          />
          <div className="space-y-4 p-5">
            {cliente && (
              <CompletarDatosFiscales
                terceroId={cliente.id}
                inicial={fiscalSugerido(cliente)}
                faltantes={faltantesFiscales(cliente.fiscal, opcionesFinppi)}
                opciones={opcionesFinppi}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Campo etiqueta="Facturar en">
                <Selector value={fac.monedaFactura} onChange={(e) => setFac({ monedaFactura: e.target.value as Moneda })}>
                  <option value="USD">Dólares (USD)</option>
                  <option value="COP">Pesos (COP)</option>
                </Selector>
              </Campo>
              <Campo etiqueta="Tipo de pago">
                <Selector
                  value={fac.tipoPago}
                  onChange={(e) => setFac({ tipoPago: e.target.value as DatosFacturacion["tipoPago"], plazoDias: e.target.value === "Contado" ? 0 : fac.plazoDias || 30 })}
                >
                  {FINPPI.tipoPago.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Plazo (días)">
                <Entrada
                  type="number"
                  min={0}
                  max={365}
                  value={fac.plazoDias}
                  disabled={fac.tipoPago === "Contado"}
                  onChange={(e) => setFac({ plazoDias: num(e.target.value) })}
                />
              </Campo>
              <Campo etiqueta="Tipo de operación">
                <Selector value={fac.tipoOperacion} onChange={(e) => setFac({ tipoOperacion: e.target.value })}>
                  {FINPPI.tipoOperacion.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Método de pago" className="sm:col-span-2">
                <Selector value={fac.metodoPago} onChange={(e) => setFac({ metodoPago: e.target.value })}>
                  {FINPPI.metodoPago.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Selector>
              </Campo>
            </div>
            {fac.monedaFactura === "USD" && (
              <p className="text-xs text-subtle">
                La factura se presenta en dólares. Al emitir, Contabilidad escribe la TRM de referencia y LOGIKS envía los valores en pesos a Finppi y la DIAN.
              </p>
            )}
          </div>
        </Tarjeta>
      </div>

      {/* Resumen fijo */}
      <aside className="xl:sticky xl:top-20 xl:self-start">
        <Tarjeta className="overflow-hidden">
          <div className="bg-gradient-to-br from-[#0a0f1f] to-[#1a2550] p-5 text-white">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-white/60">
                Total al cliente <span className="font-medium text-white/80">en {mon === "USD" ? "dólares (USD)" : "pesos (COP)"}</span>
              </p>
              {/* Moneda en que se presenta la cotización (por defecto USD). */}
              <div role="radiogroup" aria-label="Moneda de la cotización" className="flex rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
                {(["USD", "COP"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mon === m}
                    onClick={() => set("monedaPresentacion", m)}
                    className={cn("rounded-md px-2.5 py-1 transition-colors", mon === m ? "bg-white text-[#0a0f1f]" : "text-white/70 hover:text-white")}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 flex items-baseline gap-2 tabular">
              <span className="text-sm font-semibold text-white/60">{mon === "USD" ? "US$" : "$"}</span>
              <span className="text-3xl font-semibold tracking-tight">
                {totales.venta.toLocaleString(mon === "USD" ? "en-US" : "es-CO", { minimumFractionDigits: mon === "USD" ? 2 : 0, maximumFractionDigits: mon === "USD" ? 2 : 0 })}
              </span>
              <span className="text-sm font-semibold text-white/60">{mon}</span>
            </p>
            <p className="mt-1 text-xs text-white/50 tabular">
              ≈ {dinero(mon === "USD" ? totales.venta * (f.trm || 1) : totales.venta / (f.trm || 1), mon === "USD" ? "COP" : "USD")} con TRM {(f.trm || 0).toLocaleString("es-CO")}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div className="rounded-lg bg-white/[0.06] p-2.5">
                <p className="text-white/50">Utilidad</p>
                <p className={cn("font-semibold tabular", totales.utilidad < 0 ? "text-[#ff8a95]" : "text-[#5eead4]")}>
                  {dinero(totales.utilidad, mon)}
                </p>
              </div>
              <div className="rounded-lg bg-white/[0.06] p-2.5">
                <p className="text-white/50">Margen</p>
                <p className="font-semibold tabular">{porcentaje(totales.margen)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-white/50 tabular">Costo total {dinero(totales.costo, mon)}</p>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-3">
              <Campo
                etiqueta="TRM"
                ayuda={
                  trmDia?.oficial ? (
                    f.trm === trmDia.valor ? (
                      `Oficial del ${trmDia.fecha.split("-").reverse().join("/")}`
                    ) : (
                      <button type="button" className="text-brand-fg hover:underline" onClick={() => set("trm", trmDia.valor)}>
                        Usar la del día ({trmDia.valor.toLocaleString("es-CO")})
                      </button>
                    )
                  ) : trmDia ? (
                    "Sin conexión a la TRM oficial: revísala"
                  ) : undefined
                }
              >
                <Entrada type="number" min={1} step="any" className="tabular" value={f.trm} onChange={(e) => set("trm", num(e.target.value))} />
              </Campo>
            </div>
            <Campo etiqueta="Válida hasta">
              <Entrada type="date" value={f.vigenteHasta} min={hoy} onChange={(e) => set("vigenteHasta", e.target.value)} />
            </Campo>

            {vencidas.length > 0 && (
              <div className="flex gap-2.5 rounded-lg bg-danger-soft p-3 text-[13px] text-danger">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  {vencidas.length} tarifa{vencidas.length > 1 ? "s" : ""} del proveedor {vencidas.length > 1 ? "están vencidas" : "está vencida"}. Pide actualización antes de enviar.
                </p>
              </div>
            )}
            {vencenAntesQueCotizacion.length > 0 && (
              <div className="flex gap-2.5 rounded-lg bg-warning-soft p-3 text-[13px] text-warning">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  {vencenAntesQueCotizacion.length} tarifa{vencenAntesQueCotizacion.length > 1 ? "s vencen" : " vence"} antes que la cotización. Considera acortar la vigencia.
                </p>
              </div>
            )}

            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

            <Boton className="w-full" tamano="lg" onClick={guardar} disabled={pendiente}>
              {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />}
              {id ? "Guardar cambios" : "Crear cotización"}
            </Boton>
            <p className="text-center text-xs text-subtle">
              {id ? "Si ya fue enviada, se guardará como una versión nueva." : "Se guarda como borrador; luego la envías."}
            </p>
          </div>
        </Tarjeta>
      </aside>
      {dlgTercero && (
        <DialogoTercero
          abierto
          cerrar={() => setDlgTercero(null)}
          tipo={dlgTercero.tipo}
          nombreInicial={dlgTercero.nombre}
          alCrear={dlgTercero.alCrear}
        />
      )}
      {dlgProducto && (
        <DialogoProducto
          abierto
          cerrar={() => setDlgProducto(null)}
          nombreInicial={dlgProducto.nombre}
          ivaInicial={dlgProducto.iva}
          alGuardar={(p) => dlgProducto.alCrear({ codigo: p.codigo!, nombre: p.nombre, iva: p.datos.iva })}
        />
      )}
    </div>
  );
}
