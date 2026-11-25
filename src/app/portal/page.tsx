import Link from "next/link";
import { ArrowRight, FileCode2, FileText, Receipt, ShieldCheck, Ship } from "lucide-react";
import { contextoPortal } from "@/server/contexto";
import { estadoEfectivo, totalesCotizacion } from "@/domain/cotizacion";
import { situacion170 } from "@/domain/cumplimiento";
import { avance, hitoActual } from "@/domain/operacion";
import { totalesFactura } from "@/domain/facturacion";
import { hoyISO } from "@/domain/fechas";
import { TIPOS_SERVICIO } from "@/domain/types";
import { EstadoCotizacionBadge, EstadoDOBadge, IconoServicio, Situacion170Badge } from "@/components/estados";
import { Progreso, Tarjeta, TarjetaEncabezado, Vacio, clasesBoton } from "@/components/ui";
import { dinero, fecha } from "@/lib/formato";

export default async function Portal() {
  const repo = await contextoPortal();
  const hoy = hoyISO();
  const [cotizaciones, operaciones, facturas, formularios] = await Promise.all([
    repo.cotizaciones(),
    repo.operaciones(),
    repo.facturas(),
    repo.formularios170(),
  ]);
  const sit = situacion170(formularios, hoy);
  const activas = operaciones.filter((o) => o.estado !== "cerrado");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {repo.usuario.nombre.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted">Todo lo que {repo.empresa.razonSocial} gestiona para {repo.cliente.razonSocial}.</p>
      </div>

      {(sit.tipo === "vencido" || sit.tipo === "por_vencer" || sit.tipo === "sin_formulario") && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] text-warning">
            {sit.tipo === "por_vencer"
              ? `Tu formulario de conocimiento del cliente (Circular 170) vence en ${sit.diasRestantes} días.`
              : "Necesitamos tu formulario de conocimiento del cliente (Circular 170) para operar tus cargas."}
          </p>
          <Link href="/portal/circular-170" className={clasesBoton({ tamano: "sm" })}>
            Actualizar ahora
          </Link>
        </div>
      )}

      <section id="operaciones">
        <Tarjeta>
          <TarjetaEncabezado titulo="Tus operaciones" descripcion="Sigue cada carga y sus novedades" />
          {activas.length === 0 ? (
            <Vacio icono={<Ship />} titulo="No tienes operaciones activas" />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {activas.map((o) => {
                const actual = hitoActual(o);
                return (
                  <li key={o.id}>
                    <Link href={`/portal/operaciones/${o.id}`} className="grid items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2 sm:grid-cols-[auto_1fr_200px_auto]">
                      <IconoServicio tipo={o.tipo} />
                      <div className="min-w-0">
                        <p className="font-mono text-[13px] font-medium">{o.consecutivo}</p>
                        <p className="truncate text-[13px] text-muted">
                          {o.origen} → {o.destino}
                        </p>
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between text-xs text-muted">
                          <span>{actual ? `Sigue: ${actual.nombre}` : "Completada"}</span>
                          <span className="tabular">{Math.round(avance(o) * 100)}%</span>
                        </div>
                        <Progreso valor={avance(o)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <EstadoDOBadge estado={o.estado} />
                        <ArrowRight className="size-4 text-subtle" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section id="cotizaciones">
          <Tarjeta className="h-full">
            <TarjetaEncabezado titulo="Cotizaciones" />
            {cotizaciones.length === 0 ? (
              <Vacio icono={<FileText />} titulo="Sin cotizaciones" />
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {cotizaciones.map((q) => (
                  <li key={q.id}>
                    <Link href={`/portal/cotizaciones/${q.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">
                          <span className="font-mono">{q.consecutivo}</span> · {TIPOS_SERVICIO[q.tipoServicio]}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {q.origen} → {q.destino} · {dinero(totalesCotizacion(q).venta, q.monedaPresentacion)}
                        </p>
                      </div>
                      <EstadoCotizacionBadge estado={estadoEfectivo(q, hoy)} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </section>

        <div className="space-y-6">
          <Tarjeta>
            <TarjetaEncabezado
              titulo="Circular 170"
              accion={
                <Link href="/portal/circular-170" className="text-[13px] font-medium text-brand-fg hover:underline">
                  Ver
                </Link>
              }
            />
            <div className="flex items-center gap-3 px-5 pb-5">
              <ShieldCheck className="size-5 text-subtle" />
              <Situacion170Badge s={sit} />
              {"formulario" in sit && sit.formulario.vigenteHasta && (
                <span className="text-[13px] text-muted">vigente hasta {fecha(sit.formulario.vigenteHasta)}</span>
              )}
            </div>
          </Tarjeta>

          <section id="facturas">
            <Tarjeta>
              <TarjetaEncabezado titulo="Facturas" />
              {facturas.length === 0 ? (
                <Vacio icono={<Receipt />} titulo="Aún no hay facturas emitidas" />
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {facturas.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                      <div className="flex-1">
                        <p className="font-mono font-medium">{f.numero}</p>
                        <p className="text-xs text-muted">{fecha(f.creadoEl)}</p>
                      </div>
                      <span className="font-medium tabular">{dinero(totalesFactura(f.lineas).total, f.moneda)}</span>
                      {f.pdfUrl && (
                        <a href={f.pdfUrl} target="_blank" rel="noopener" className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="PDF">
                          <FileText className="size-4" />
                        </a>
                      )}
                      {f.xmlUrl && (
                        <a href={f.xmlUrl} target="_blank" rel="noopener" className="rounded-md p-1.5 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="XML">
                          <FileCode2 className="size-4" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </section>
        </div>
      </div>
    </div>
  );
}
