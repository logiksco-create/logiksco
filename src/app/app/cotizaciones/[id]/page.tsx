import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Pencil, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { contexto } from "@/server/contexto";
import { modoDemo } from "@/lib/env";
import { estadoEfectivo, tarifasVencidas, totalesConcepto, totalesCotizacion, totalesPorBloque } from "@/domain/cotizacion";
import { habilitadoParaDO, situacion170 } from "@/domain/cumplimiento";
import { hoyISO } from "@/domain/fechas";
import { BLOQUES, TIPOS_SERVICIO, UNIDADES, type Bloque } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import { EstadoCotizacionBadge, IconoServicio, Situacion170Badge } from "@/components/estados";
import {
  AceptacionManual,
  BotonAbrirDO,
  BotonEnviar,
  DuplicarParaCliente,
} from "@/components/app/acciones-cotizacion";
import { Comunicaciones, Historial } from "@/components/app/linea-tiempo";
import { BotonLink, clasesBoton, Tabla, Tarjeta, TarjetaEncabezado, Td, Th } from "@/components/ui";
import { cn, dinero, fecha, numero, porcentaje } from "@/lib/formato";

export default async function DetalleCotizacion({ params }: PageProps<"/app/cotizaciones/[id]">) {
  const { id } = await params;
  const repo = await contexto();
  const q = await repo.cotizacion(id);
  if (!q) notFound();

  const hoy = hoyISO();
  const [cliente, formularios, comunicaciones, operaciones, terceros, origen] = await Promise.all([
    repo.tercero(q.clienteId),
    repo.formularios170(q.clienteId),
    repo.comunicaciones("cotizacion", q.id),
    repo.operaciones(),
    repo.terceros(),
    q.origenId ? repo.cotizacion(q.origenId) : null,
  ]);
  const estado = estadoEfectivo(q, hoy);
  const t = totalesCotizacion(q);
  const porBloque = totalesPorBloque(q.conceptos, q.monedaPresentacion, q.trm);
  const vencidas = tarifasVencidas(q.conceptos, hoy);
  const sit = situacion170(formularios, hoy);
  const doExistente = operaciones.find((o) => o.cotizacionId === q.id);
  const contacto = cliente?.contactos.find((c) => c.id === q.contactoId) ?? cliente?.contactos[0];
  const mon = q.monedaPresentacion;
  const bloques = (Object.keys(BLOQUES) as Bloque[]).filter((b) => q.conceptos.some((c) => c.bloque === b));

  return (
    <>
      <Encabezado
        antes={
          <Link href="/app/cotizaciones" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Cotizaciones
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{q.consecutivo}</span>
            <span className="text-base font-normal text-subtle">v{q.version}</span>
            <EstadoCotizacionBadge estado={estado} />
          </span>
        }
        descripcion={
          <>
            {cliente?.razonSocial} · emitida el {fecha(q.fechaEmision)} · válida hasta {fecha(q.vigenteHasta)}
            {origen && (
              <>
                {" "}· duplicada de{" "}
                <Link href={`/app/cotizaciones/${origen.id}`} className="font-mono text-brand-fg hover:underline">
                  {origen.consecutivo}
                </Link>
              </>
            )}
          </>
        }
        acciones={
          <>
            {modoDemo && q.estado !== "borrador" && (
              <BotonLink href={`/c/${q.tokenPublico}`} target="_blank" variante="fantasma" tamano="sm">
                <ExternalLink /> Vista del cliente
              </BotonLink>
            )}
            <a href={`/app/cotizaciones/${q.id}/pdf`} target="_blank" rel="noopener" className={clasesBoton({ variante: "secundario", tamano: "sm" })}>
              <Download /> PDF
            </a>
            {q.estado !== "aceptada" && (
              <BotonLink href={`/app/cotizaciones/${q.id}/editar`} variante="secundario" tamano="sm">
                <Pencil /> Editar
              </BotonLink>
            )}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          {/* Siguiente paso */}
          {estado === "aceptada" && (
            <Tarjeta className={cn("p-5", doExistente ? "" : habilitadoParaDO(sit) ? "border-success/30" : "border-warning/40")}>
              {doExistente ? (
                <p className="text-sm">
                  Esta cotización ya es el DO{" "}
                  <Link href={`/app/operaciones/${doExistente.id}`} className="font-mono font-medium text-brand-fg hover:underline">
                    {doExistente.consecutivo}
                  </Link>
                  .
                </p>
              ) : habilitadoParaDO(sit) ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
                    <div>
                      <p className="font-medium">Lista para operar</p>
                      <p className="text-[13px] text-muted">Aceptada y con Circular 170 vigente. Abre el DO y se notificará al cliente.</p>
                    </div>
                  </div>
                  <BotonAbrirDO id={q.id} />
                </div>
              ) : (
                <div className="flex gap-3">
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
                  <div>
                    <p className="font-medium">Falta la Circular 170 del cliente</p>
                    <p className="text-[13px] text-muted">
                      {sit.tipo === "en_tramite"
                        ? "El cliente ya envió el formulario; Cumplimiento debe aprobarlo antes de abrir el DO."
                        : "El cliente debe diligenciar o actualizar su formulario 170 antes de abrir el DO."}{" "}
                      <Link href="/app/cumplimiento" className="font-medium text-brand-fg hover:underline">
                        Ir a Cumplimiento
                      </Link>
                    </p>
                  </div>
                </div>
              )}
            </Tarjeta>
          )}

          {(q.estado === "borrador" || q.estado === "enviada" || q.estado === "vista") && estado !== "vencida" && (
            <Tarjeta className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="font-medium">{q.estado === "borrador" ? "Lista para enviar" : "Esperando respuesta del cliente"}</p>
                  <p className="text-[13px] text-muted">
                    {q.estado === "borrador"
                      ? `Se enviará a ${contacto?.nombre ?? "el contacto"} (${contacto?.correo ?? "sin correo"}) con un enlace seguro para aceptar en línea.`
                      : "Si el cliente respondió por correo, registra la aceptación con su evidencia."}
                  </p>
                </div>
                <div className="flex flex-col gap-2 lg:items-end">
                  {q.estado === "borrador" ? <BotonEnviar id={q.id} /> : <AceptacionManual id={q.id} />}
                </div>
              </div>
            </Tarjeta>
          )}

          {vencidas.length > 0 && estado !== "aceptada" && (
            <div className="flex gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 text-[13.5px] text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                {vencidas.map((c) => c.descripcion).join(", ")}: la tarifa del proveedor ya venció. Actualízala antes de
                confirmar al cliente.
              </p>
            </div>
          )}

          <Tarjeta>
            <div className="grid gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-3">
              <div className="bg-surface p-5">
                <p className="text-xs text-subtle">Servicio</p>
                <div className="mt-2 flex items-center gap-3">
                  <IconoServicio tipo={q.tipoServicio} />
                  <div>
                    <p className="text-sm font-medium">{TIPOS_SERVICIO[q.tipoServicio]}</p>
                    <p className="text-xs text-muted">Incoterm {q.incoterm}</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface p-5">
                <p className="text-xs text-subtle">Ruta</p>
                <p className="mt-2 text-sm font-medium">{q.origen}</p>
                <p className="text-sm text-muted">→ {q.destino}</p>
              </div>
              <div className="bg-surface p-5">
                <p className="text-xs text-subtle">Mercancía</p>
                <p className="mt-2 text-sm font-medium">{q.mercancia.descripcion}</p>
                <p className="text-xs text-muted tabular">
                  {numero(q.mercancia.piezas)} piezas · {numero(q.mercancia.pesoKg)} kg · {numero(q.mercancia.volumenM3, 1)} m³
                </p>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado
              titulo="Conceptos"
              descripcion={`Vista interna con costos y utilidad · TRM ${dinero(q.trm, "COP")}`}
            />
            <Tabla>
              <thead>
                <tr>
                  <Th>Concepto</Th>
                  <Th className="hidden md:table-cell">Cantidad</Th>
                  <Th className="text-right">Costo</Th>
                  <Th className="text-right">Venta</Th>
                  <Th className="text-right">Utilidad</Th>
                </tr>
              </thead>
              {bloques.map((b) => (
                <tbody key={b}>
                  <tr className="bg-surface-2/60">
                    <Td colSpan={5} className="py-2">
                      <div className="flex justify-between text-xs text-muted">
                        <span className="font-semibold tracking-wide uppercase">{BLOQUES[b]}</span>
                        <span className="tabular">{dinero(porBloque[b]!.venta, mon)}</span>
                      </div>
                    </Td>
                  </tr>
                  {q.conceptos
                    .filter((c) => c.bloque === b)
                    .map((c) => {
                      const tc = totalesConcepto(c);
                      const vencida = vencidas.includes(c);
                      return (
                        <tr key={c.id}>
                          <Td>
                            <p className="font-medium">{c.descripcion}</p>
                            <p className="text-xs text-subtle">
                              {c.proveedorNombre ?? "Sin proveedor"}
                              {c.vigenciaTarifa && (
                                <span className={cn(vencida && "font-medium text-danger")}>
                                  {" "}· tarifa {vencida ? "vencida" : "hasta"} {fecha(c.vigenciaTarifa)}
                                </span>
                              )}
                              {c.paraTerceros && " · para terceros"}
                            </p>
                          </Td>
                          <Td className="hidden text-[13px] text-muted tabular md:table-cell">
                            {numero(c.cantidad, 2)} {UNIDADES[c.unidad].replace("Por ", "").replace("contenedor", "cont.")}
                          </Td>
                          <Td className="text-right text-muted tabular">{dinero(tc.costo, c.moneda)}</Td>
                          <Td className="text-right tabular">{dinero(tc.venta, c.moneda)}</Td>
                          <Td className={cn("text-right tabular", tc.utilidad < 0 ? "text-danger" : "text-success")}>
                            {dinero(tc.utilidad, c.moneda)}
                          </Td>
                        </tr>
                      );
                    })}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <Td className="border-b-0 font-semibold">Total en {mon}</Td>
                  <Td className="hidden border-b-0 md:table-cell" />
                  <Td className="border-b-0 text-right text-muted tabular">{dinero(t.costo, mon)}</Td>
                  <Td className="border-b-0 text-right font-semibold tabular">{dinero(t.venta, mon)}</Td>
                  <Td className="border-b-0 text-right font-semibold text-success tabular">
                    {dinero(t.utilidad, mon)}
                    <span className="block text-xs font-normal text-muted">{porcentaje(t.margen)}</span>
                  </Td>
                </tr>
              </tfoot>
            </Tabla>
          </Tarjeta>

          {q.terminos && (
            <Tarjeta className="p-5">
              <p className="mb-1 text-xs text-subtle">Términos y condiciones</p>
              <p className="text-[13px] whitespace-pre-line text-muted">{q.terminos}</p>
            </Tarjeta>
          )}
        </div>

        <aside className="space-y-6">
          <Tarjeta>
            <TarjetaEncabezado titulo="Cliente" />
            <div className="space-y-3 px-5 pb-5 text-[13px]">
              <div>
                <p className="font-medium">{cliente?.razonSocial}</p>
                <p className="text-muted">NIT {cliente?.nit}</p>
              </div>
              {contacto && (
                <div>
                  <p>{contacto.nombre}</p>
                  <p className="text-muted">
                    {contacto.cargo} · {contacto.correo}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg bg-surface-2 p-2.5">
                <span className="text-muted">Circular 170</span>
                <Situacion170Badge s={sit} />
              </div>
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado titulo="Duplicar" descripcion="Copia todo a un borrador nuevo; puedes cambiar el cliente." />
            <div className="px-5 pb-5">
              <DuplicarParaCliente
                id={q.id}
                clientes={terceros
                  .filter((x) => x.tipo !== "proveedor" && x.id !== q.clienteId)
                  .map((x) => ({ id: x.id, nombre: x.razonSocial }))}
              />
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado titulo="Historial" />
            <div className="px-5 pb-5">
              <Historial eventos={q.historial} />
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado titulo="Correos" descripcion="Trazabilidad inmutable" />
            <div className="px-5 pb-5">
              <Comunicaciones items={comunicaciones} />
            </div>
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}
