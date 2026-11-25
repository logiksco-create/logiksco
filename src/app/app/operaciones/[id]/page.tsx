import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AtSign, Mail, TriangleAlert } from "lucide-react";
import { contexto, tieneRol } from "@/server/contexto";
import { avance, hitoActual, utilidadOperacion } from "@/domain/operacion";
import { fechaSalida } from "@/domain/alertas";
import { tarifasVencidas } from "@/domain/cotizacion";
import { hoyISO } from "@/domain/fechas";
import { TIPOS_DOCUMENTO_DO, TIPOS_SERVICIO } from "@/domain/types";
import { Subidor } from "@/components/app/subidor";
import { ListaArchivos } from "@/components/app/lista-archivos";
import { Encabezado } from "@/components/app/encabezado";
import { EstadoDOBadge, IconoServicio } from "@/components/estados";
import { FilaHito, NotificarCliente } from "@/components/app/acciones-operacion";
import { Comunicaciones } from "@/components/app/linea-tiempo";
import { Avatar, Insignia, Progreso, Tarjeta, TarjetaEncabezado } from "@/components/ui";
import { dinero, fecha, fechaLegibleCorta, porcentaje } from "@/lib/formato";

export default async function DetalleOperacion({ params }: PageProps<"/app/operaciones/[id]">) {
  const { id } = await params;
  const repo = await contexto();
  const op = await repo.operacion(id);
  if (!op) notFound();

  const hoy = hoyISO();
  const [cliente, cotizacion, comunicaciones, usuarios, documentos] = await Promise.all([
    repo.tercero(op.clienteId),
    repo.cotizacion(op.cotizacionId),
    repo.comunicaciones("operacion", op.id),
    repo.usuarios(),
    repo.documentosDO(op.id),
  ]);
  const responsable = usuarios.find((u) => u.id === op.responsableId);
  const actual = hitoActual(op);
  const salida = fechaSalida(op);
  const vencidas = salida ? tarifasVencidas(op.conceptos, salida) : [];
  const { cotizada, real } = utilidadOperacion(op);
  const editable = tieneRol(repo, "operaciones");
  const buzon = `do-${op.consecutivo.split("-").pop()}@${repo.empresa.razonSocial.split(" ")[0].toLowerCase()}.logiks.co`;

  const eta = op.hitos.find((h) => h.nombre === "ETA");
  const plantillas = [
    {
      etiqueta: "Carga lista",
      texto: `Su proveedor indica carga lista${actual?.estimada ? ` el ${fechaLegibleCorta(actual.estimada)}` : ""}; ${salida ? `booking para el ${fechaLegibleCorta(salida)}` : "estamos confirmando el booking"}.`,
    },
    {
      etiqueta: "Zarpe / despegue",
      texto: `Su carga salió de ${op.origen}.${eta?.estimada ? ` Llegada estimada a destino el ${fechaLegibleCorta(eta.estimada)}.` : ""}`,
    },
    { etiqueta: "Arribo", texto: `Su carga llegó a ${op.destino}. Iniciamos el proceso de nacionalización.` },
    { etiqueta: "Entrega", texto: "Su carga fue entregada. Gracias por confiar en nosotros." },
  ];

  return (
    <>
      <Encabezado
        antes={
          <Link href="/app/operaciones" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Operaciones
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{op.consecutivo}</span>
            <EstadoDOBadge estado={op.estado} />
          </span>
        }
        descripcion={
          <>
            {cliente?.razonSocial} · abierto el {fecha(op.abiertoEl)} · desde{" "}
            {cotizacion && (
              <Link href={`/app/cotizaciones/${cotizacion.id}`} className="font-mono text-brand-fg hover:underline">
                {cotizacion.consecutivo}
              </Link>
            )}
          </>
        }
      />

      {vencidas.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 text-[13.5px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3 text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">La carga sale después de la vigencia de la tarifa</p>
              <p className="opacity-85">
                {vencidas.map((c) => `${c.descripcion} (vence ${fecha(c.vigenciaTarifa)})`).join(", ")} · salida {fecha(salida)}.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Insignia tono="peligro">Pedir actualización al proveedor</Insignia>
            <Insignia tono="peligro">Re-cotizar</Insignia>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Tarjeta className="overflow-hidden">
            <div className="relative bg-gradient-to-br from-[#0a0f1f] via-[#121a3a] to-[#0d2d3a] p-6 text-white">
              <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
              <div className="relative flex flex-wrap items-center gap-4">
                <IconoServicio tipo={op.tipo} className="bg-white/10 text-white" />
                <p className="text-sm text-white/60">{TIPOS_SERVICIO[op.tipo]}</p>
              </div>
              <div className="relative mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div>
                  <p className="text-xs text-white/50">Origen</p>
                  <p className="text-lg font-semibold">{op.origen}</p>
                </div>
                <div className="flex w-24 items-center sm:w-40">
                  <span className="size-2 rounded-full bg-white" />
                  <span className="relative h-px flex-1 bg-gradient-to-r from-white/70 to-[#14c8b4]">
                    <span
                      className="absolute -top-1 size-2 -translate-x-1/2 rounded-full bg-[#14c8b4] shadow-[0_0_12px_#14c8b4]"
                      style={{ left: `${Math.round(avance(op) * 100)}%` }}
                    />
                  </span>
                  <span className="size-2 rounded-full border border-[#14c8b4]" />
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/50">Destino</p>
                  <p className="text-lg font-semibold">{op.destino}</p>
                </div>
              </div>
              <div className="relative mt-5">
                <div className="mb-1.5 flex justify-between text-xs text-white/60">
                  <span>{actual ? `Siguiente: ${actual.nombre}` : "Operación completada"}</span>
                  <span className="tabular">{Math.round(avance(op) * 100)}%</span>
                </div>
                <Progreso valor={avance(op)} className="bg-white/10 ring-white/10" />
              </div>
            </div>
          </Tarjeta>

          <div className="grid gap-6 lg:grid-cols-2">
            <Tarjeta>
              <TarjetaEncabezado titulo="Hitos" descripcion="Fecha estimada y real de cada etapa" />
              <ol className="relative px-5 pb-5 before:absolute before:top-2 before:bottom-8 before:left-[30px] before:w-px before:bg-border">
                {op.hitos.map((h) => (
                  <FilaHito
                    key={h.id}
                    operacionId={op.id}
                    hito={h}
                    hoy={hoy}
                    esActual={actual?.id === h.id}
                    editable={editable}
                  />
                ))}
              </ol>
            </Tarjeta>

            <div className="space-y-6">
              <Tarjeta>
                <TarjetaEncabezado titulo="Utilidad" descripcion="Cotizada vs. real, en COP" />
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl border-t border-border bg-border">
                  <div className="bg-surface p-4">
                    <dt className="text-xs text-subtle">Venta</dt>
                    <dd className="mt-1 font-semibold tabular">{dinero(cotizada.venta)}</dd>
                  </div>
                  <div className="bg-surface p-4">
                    <dt className="text-xs text-subtle">Costo real</dt>
                    <dd className="mt-1 font-semibold tabular">{dinero(real.costo)}</dd>
                  </div>
                  <div className="bg-surface p-4">
                    <dt className="text-xs text-subtle">Utilidad cotizada</dt>
                    <dd className="mt-1 font-semibold tabular">
                      {dinero(cotizada.utilidad)} <span className="text-xs font-normal text-muted">{porcentaje(cotizada.margen)}</span>
                    </dd>
                  </div>
                  <div className="bg-surface p-4">
                    <dt className="text-xs text-subtle">Utilidad real</dt>
                    <dd className={`mt-1 font-semibold tabular ${real.utilidad < cotizada.utilidad ? "text-warning" : "text-success"}`}>
                      {dinero(real.utilidad)} <span className="text-xs font-normal text-muted">{porcentaje(real.margen)}</span>
                    </dd>
                  </div>
                </dl>
              </Tarjeta>

              <Tarjeta>
                <TarjetaEncabezado titulo="Documentos" descripcion="Almacenamiento privado; descarga con enlace temporal" />
                <div className="space-y-4 px-5 pb-5">
                  {editable && <Subidor destino={{ clase: "do", operacionId: op.id }} tipos={TIPOS_DOCUMENTO_DO} compacto />}
                  <ListaArchivos archivos={documentos} clase="do" tipos={TIPOS_DOCUMENTO_DO} />
                </div>
              </Tarjeta>
            </div>
          </div>

          <Tarjeta>
            <TarjetaEncabezado
              titulo="Trazabilidad de comunicaciones"
              descripcion="Línea de tiempo inmutable; se exporta como evidencia ante un reclamo."
            />
            <div className="px-5 pb-5">
              <Comunicaciones items={comunicaciones} />
            </div>
          </Tarjeta>
        </div>

        <aside className="space-y-6">
          <Tarjeta>
            <TarjetaEncabezado titulo="Notificar al cliente" descripcion="Una novedad con un clic" />
            <div className="px-5 pb-5">
              <NotificarCliente operacionId={op.id} consecutivo={op.consecutivo} plantillas={plantillas} />
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado titulo="Detalles" />
            <dl className="space-y-3 px-5 pb-5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Responsable</dt>
                <dd className="flex items-center gap-2">
                  {responsable && <Avatar nombre={responsable.nombre} className="size-6 text-[9px]" />}
                  {responsable?.nombre ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Cliente</dt>
                <dd className="text-right">{cliente?.razonSocial}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Contacto</dt>
                <dd className="text-right">{cliente?.contactos[0]?.correo ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">TRM</dt>
                <dd className="tabular">{dinero(op.trm)}</dd>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <dt className="flex items-center gap-1.5 text-xs text-subtle">
                  <AtSign className="size-3.5" /> Buzón del DO
                </dt>
                <dd className="mt-1 font-mono text-xs break-all">{buzon}</dd>
                <p className="mt-1.5 flex gap-1.5 text-xs text-subtle">
                  <Mail className="mt-px size-3.5 shrink-0" /> Copia este correo en tus mensajes con proveedores y quedarán en la trazabilidad.
                </p>
              </div>
            </dl>
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}
