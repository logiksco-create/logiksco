import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileCode2,
  FileText,
  Info,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { contexto, tieneRol } from "@/server/contexto";
import { trmDelDia } from "@/server/trm";
import { modoDemo } from "@/lib/env";
import {
  bloqueosEmision,
  faltantesFiscales,
  fiscalSugerido,
  lineasEnCop,
  totalesCop,
  totalesOriginales,
  urlDian,
  presentacionEfectiva,
} from "@/domain/einvoice";
import { diasEntre, hoyISO } from "@/domain/fechas";
import { ESTADOS_CUENTA_FE, ESTADOS_TRABAJO_FE, PRESENTACIONES, type TrabajoFe } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import { EditorPrefactura } from "@/components/app/facturacion";
import {
  BotonEmitir,
  BotonEnviarCliente,
  CompletarDatosFiscales,
  CondicionesFe,
  EstadoBot,
  RefrescoEnVivo,
  SelectorPresentacion,
  BotonDescartarPrueba,
} from "@/components/app/factura-electronica";
import { EstadoFacturaBadge } from "@/components/estado-factura";
import { Insignia, Tarjeta, TarjetaEncabezado, clasesBoton } from "@/components/ui";
import { cn, dinero, fechaHora, pesosExactos } from "@/lib/formato";

const EN_PROCESO = ["en_cola", "enviando", "estado_desconocido"];
const EDITABLE = ["borrador", "aprobada", "fallida", "rechazada"];

function Trabajo({ j }: { j: TrabajoFe }) {
  const activo = j.estado === "en_cola" || j.estado === "corriendo";
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-medium">
          {j.dryRun ? "Prueba sin emitir" : j.tipo === "reconciliar" ? "Verificación en Finppi" : "Emisión"}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{fechaHora(j.creadoEl)}</span>
          <Insignia
            tono={j.estado === "ok" ? "exito" : j.estado === "fallido" ? "peligro" : activo ? "marca" : j.estado === "cancelado" ? "neutro" : "alerta"}
            punto
          >
            {activo && <LoaderCircle className="size-3 animate-spin" />} {ESTADOS_TRABAJO_FE[j.estado]}
          </Insignia>
        </div>
      </div>
      {j.logs.length > 0 && (
        <ol className="mt-3 space-y-1.5 border-l border-border pl-4">
          {j.logs.map((l, i) => (
            <li key={i} className="relative text-[13px]">
              <span
                className={cn(
                  "absolute top-1.5 -left-[20.5px] size-2 rounded-full",
                  l.nivel === "error" ? "bg-danger" : l.nivel === "aviso" ? "bg-warning" : "bg-brand",
                )}
              />
              <span className={cn(l.nivel === "error" ? "text-danger" : l.nivel === "aviso" ? "text-warning" : "text-fg")}>{l.mensaje}</span>
              <span className="ml-2 font-mono text-[11px] text-subtle">{fechaHora(l.creadoEl).split(", ").pop()}</span>
            </li>
          ))}
        </ol>
      )}
      {j.error && (
        <p className="mt-2 text-[13px] text-danger">
          {j.errorCodigo && <span className="mr-1.5 font-mono text-xs">{j.errorCodigo}</span>}
          {j.error}
        </p>
      )}
    </li>
  );
}

export default async function DetalleFactura({ params }: PageProps<"/app/facturacion/[id]">) {
  const { id } = await params;
  const repo = await contexto();
  const f = await repo.factura(id);
  if (!f) notFound();
  const [cliente, operaciones, cuenta, trabajos, bot, catalogo, trm] = await Promise.all([
    repo.tercero(f.clienteId),
    repo.operaciones(),
    repo.cuentaFe(),
    repo.trabajosFe(f.id),
    repo.estadoBotFe(),
    repo.catalogo("producto_finppi"),
    f.moneda === "USD" ? trmDelDia() : Promise.resolve(undefined),
  ]);
  const contable = tieneRol(repo, "contabilidad");
  const editable = contable && EDITABLE.includes(f.estado);
  const puedePresentar = tieneRol(repo, "contabilidad", "comercial");
  const enProceso = EN_PROCESO.includes(f.estado) || trabajos.some((j) => j.estado === "en_cola" || j.estado === "corriendo");
  // Recién emitida y con envío automático pendiente: seguir mirando un par de minutos.
  // eslint-disable-next-line react-hooks/purity -- marca de tiempo del render en el servidor
  const ahora = Date.now();
  const esperandoEnvio =
    f.estado === "emitida" && f.enviarAlEmitir !== false && !f.enviadaClienteEl && !!f.fechaValidacion && ahora - new Date(f.fechaValidacion).getTime() < 120_000;
  const productos = catalogo.filter((e) => e.codigo).map((e) => ({ codigo: e.codigo!, nombre: e.nombre, iva: e.datos.iva }));
  const hoy = hoyISO();

  const lineasCop = lineasEnCop(f.lineas, f.moneda, f.trmReferencia ?? 1);
  const to = totalesOriginales(lineasCop);
  const tc = totalesCop(lineasCop);
  const fiscal = cliente ? fiscalSugerido(cliente) : undefined;
  const faltan = faltantesFiscales(cliente?.fiscal);
  const cuentaActiva = cuenta?.estado === "activa";
  const bloqueos = [
    ...(cuentaActiva ? [] : ["Conecta y verifica la cuenta de Finppi en Configuración → Facturación electrónica."]),
    ...bloqueosEmision({
      moneda: f.moneda,
      trmReferencia: f.trmReferencia,
      lineas: f.lineas,
      fiscal: cliente?.fiscal,
      metodoPago: f.metodoPago,
      tipoOperacion: f.tipoOperacion,
      tipoPago: f.tipoPago,
      fecha: hoy,
      hoy,
      vencimiento: f.vencimiento,
    }),
  ];
  const plazo = f.vencimiento ? Math.max(0, diasEntre(hoy, f.vencimiento)) : cliente?.acuerdo?.plazoPagoDias ?? 0;
  const modo = presentacionEfectiva(f, cuenta);
  /** Factura de prueba: el bot pulsó «Guardar» en Finppi (sin DIAN ni CUFE). */
  const prueba = !!f.simulada && !f.cufe;
  const trmTexto = f.trmReferencia?.toLocaleString("es-CO", { minimumFractionDigits: 2 });

  return (
    <>
      <RefrescoEnVivo activo={enProceso || esperandoEnvio} />
      <Encabezado
        antes={
          <Link href="/app/facturacion" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Facturación
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{f.numero ?? (prueba ? f.numeroEsperado ?? "Prueba" : `Prefactura PF-${f.id.slice(0, 6).toUpperCase()}`)}</span>
            <EstadoFacturaBadge estado={f.estado} />
            {f.simulada && <Insignia tono="alerta">{prueba ? "Prueba · borrador en Finppi" : "Simulación"}</Insignia>}
          </span>
        }
        descripcion={
          <>
            {cliente?.razonSocial} · NIT {cliente?.nit} · {f.moneda}
            {f.referencia ? ` · ref. ${f.referencia}` : ""} · DO{" "}
            {f.operaciones.map((oid, i) => {
              const o = operaciones.find((x) => x.id === oid);
              return (
                <span key={oid}>
                  {i > 0 && ", "}
                  <Link href={`/app/operaciones/${oid}`} className="font-mono text-brand-fg hover:underline">
                    {o?.consecutivo}
                  </Link>
                </span>
              );
            })}
          </>
        }
      />

      {f.error && (
        <div className="mb-6 flex gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 text-[13.5px] text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            {f.errorCodigo && <span className="mr-1.5 font-mono text-xs">{f.errorCodigo}</span>}
            {f.error}
          </p>
        </div>
      )}
      {(f.estado === "estado_desconocido" || f.estado === "revision") && (
        <div className="mb-6 flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-[13.5px] text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            {f.estado === "estado_desconocido"
              ? "El bot pulsó «Enviar» pero no alcanzó a confirmar el resultado. Está buscando la factura en Finppi por su referencia; nunca la vuelve a emitir."
              : "No se pudo confirmar la emisión. Revísala en Finppi antes de cualquier acción: no se reintentará automáticamente."}
          </p>
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Tarjeta className="overflow-hidden">
            <TarjetaEncabezado
              titulo="Conceptos"
              descripcion={f.moneda === "USD" ? "En dólares; la columna COP es lo que recibe Finppi con la TRM de referencia" : "Desde los conceptos de venta de los DO"}
            />
            <EditorPrefactura
              id={f.id}
              lineasIniciales={f.lineas}
              moneda={f.moneda}
              editable={editable}
              productosFinppi={productos}
              trmReferencia={f.trmReferencia}
            />
          </Tarjeta>

          {trabajos.length > 0 && (
            <Tarjeta>
              <TarjetaEncabezado
                titulo="Seguimiento del bot"
                descripcion="Cada paso que hace en Finppi, en vivo"
                accion={<EstadoBot latidoEl={bot.latidoEl} pausado={bot.pausado} demo={modoDemo} />}
              />
              <ul className="divide-y divide-border border-t border-border">
                {trabajos.map((j) => (
                  <Trabajo key={j.id} j={j} />
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>

        <aside className="order-first space-y-6 2xl:order-none">
          {f.estado === "emitida" ? (
            <Tarjeta className="overflow-hidden">
              <div className="bg-gradient-to-br from-[#0a0f1f] to-[#1a2550] p-5 text-white">
                <p className="text-[12px] text-white/60">
                  {prueba ? "Prueba: guardada en Finppi como borrador" : `Factura electrónica ${f.simulada ? "(simulada)" : "aceptada"}`}
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold">{f.numero ?? f.numeroEsperado}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular">{dinero(to.total, f.moneda)}</p>
                {f.moneda === "USD" && (
                  <p className="font-mono text-xs text-white/70">
                    = {pesosExactos(f.totalCop ?? tc.total)} · TRM {trmTexto}
                  </p>
                )}
                <p className="mt-3 text-xs text-white/60">{prueba ? "Guardada" : "Validada"} {fechaHora(f.fechaValidacion)}</p>
              </div>
              <div className="space-y-4 p-5">
                {f.cufe && (
                  <div>
                    <p className="text-xs text-subtle">CUFE</p>
                    <p className="mt-0.5 font-mono text-[11px] break-all">{f.cufe}</p>
                    {!f.simulada && (
                      <a href={urlDian(f.cufe)} target="_blank" rel="noopener" className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-brand-fg hover:underline">
                        Verificar en la DIAN <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                )}
                {f.moneda === "USD" && <SelectorPresentacion facturaId={f.id} valor={modo} editable={puedePresentar} />}
                <div className="grid grid-cols-1 gap-2">
                  <a href={`/app/facturacion/${f.id}/pdf`} target="_blank" className={clasesBoton({ variante: "secundario" })}>
                    <FileText /> PDF LOGIKS {f.moneda === "USD" ? `· ${PRESENTACIONES[modo].toLowerCase()}` : ""}
                  </a>
                  {f.pdfFinppiRuta && (
                    <a href={`/app/facturacion/${f.id}/original?tipo=pdf`} target="_blank" className={clasesBoton({ variante: "secundario" })}>
                      <FileText /> {prueba ? "PDF del borrador (Finppi)" : "PDF original DIAN (Finppi)"}
                    </a>
                  )}
                  {f.xmlRuta && (
                    <a href={`/app/facturacion/${f.id}/original?tipo=xml`} className={clasesBoton({ variante: "secundario" })}>
                      <FileCode2 /> XML
                    </a>
                  )}
                </div>
                {contable && !prueba && <BotonEnviarCliente facturaId={f.id} yaEnviada={!!f.enviadaClienteEl} />}
                {f.enviadaClienteEl && <p className="text-xs text-subtle">Enviada al cliente {fechaHora(f.enviadaClienteEl)}</p>}
                {prueba ? (
                  <>
                    <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">
                      Modo prueba: el bot hizo todo el proceso y pulsó «Guardar». No fue a la DIAN, no tiene CUFE y no se envió al cliente.
                      Revisa el borrador en Finppi y bórralo allá si no lo necesitas.
                    </p>
                    {contable && <BotonDescartarPrueba facturaId={f.id} />}
                  </>
                ) : (
                  f.simulada && (
                    <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">Emisión simulada del modo demo: el CUFE es ficticio y no existe en la DIAN.</p>
                  )
                )}
              </div>
            </Tarjeta>
          ) : enProceso ? (
            <Tarjeta className="p-5">
              <div className="flex items-start gap-3">
                <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-brand-fg" />
                <div className="text-[13.5px]">
                  <p className="font-medium">El bot está trabajando en Finppi</p>
                  <p className="mt-1 text-muted">
                    Esta página se actualiza sola. Cuando la DIAN la acepte verás el número, el CUFE y los PDF aquí.
                  </p>
                  <div className="mt-3">
                    <EstadoBot latidoEl={bot.latidoEl} pausado={bot.pausado} demo={modoDemo} />
                  </div>
                </div>
              </div>
            </Tarjeta>
          ) : (
            <Tarjeta>
              <TarjetaEncabezado titulo="Factura electrónica" descripcion="Revisa, confirma y el bot la emite en Finppi" />
              <div className="space-y-5 p-5 pt-0">
                {cliente && fiscal && (
                  <CompletarDatosFiscales terceroId={cliente.id} inicial={fiscal} faltantes={faltan} compacto />
                )}
                <CondicionesFe
                  facturaId={f.id}
                  moneda={f.moneda}
                  editable={editable}
                  trmOficial={trm}
                  inicial={{
                    trmReferencia: f.trmReferencia,
                    tipoPago: f.tipoPago ?? (plazo ? "Crédito" : "Contado"),
                    plazoDias: plazo,
                    metodoPago: f.metodoPago ?? "Acuerdo mutuo",
                    tipoOperacion: f.tipoOperacion ?? "Estándar",
                  }}
                />
                {f.moneda === "USD" && <SelectorPresentacion facturaId={f.id} valor={modo} editable={puedePresentar} />}
                <a href={`/app/facturacion/${f.id}/pdf`} target="_blank" className={cn(clasesBoton({ variante: "secundario" }), "w-full")}>
                  <FileText /> Vista previa del PDF
                </a>
                {contable ? (
                  <BotonEmitir
                    facturaId={f.id}
                    reintento={f.estado === "fallida"}
                    resumen={{
                      cliente: cliente?.razonSocial ?? "",
                      correo: cliente?.fiscal?.email ?? "",
                      moneda: f.moneda,
                      totalOriginal: dinero(to.total, f.moneda),
                      totalCop: f.trmReferencia || f.moneda === "COP" ? pesosExactos(tc.total) : "—",
                      trm: trmTexto,
                      proximo: cuenta?.instantanea.proximaFactura,
                      bloqueos,
                      simulacion: modoDemo,
                      modo: cuenta?.modoEmision === "real" ? "real" : "borrador",
                    }}
                  />
                ) : (
                  <p className="text-[13px] text-muted">Solo Contabilidad emite facturas.</p>
                )}
                {!cuentaActiva && (
                  <p className="text-xs text-muted">
                    Cuenta de Finppi: {cuenta ? ESTADOS_CUENTA_FE[cuenta.estado] : "sin conectar"} ·{" "}
                    <Link href="/app/configuracion/facturacion-electronica" className="text-brand-fg hover:underline">
                      configurar
                    </Link>
                  </p>
                )}
              </div>
            </Tarjeta>
          )}
          <div className="flex gap-2.5 rounded-xl border border-border bg-surface-2 p-3.5 text-xs text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <p>Verifica siempre que tus facturas estén aceptadas por la DIAN. Si ves algo raro, cambia tu contraseña de Finppi de inmediato: eso corta el acceso del bot.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
