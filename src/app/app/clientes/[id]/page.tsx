import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { contexto, tieneRol } from "@/server/contexto";
import { cargarFlujo, cargarTodo, situacionCliente } from "@/server/consultas";
import { TarjetaPaso } from "@/components/app/flujo";
import { estadoEfectivo, totalesCotizacion } from "@/domain/cotizacion";
import { esPrueba, totalesFactura } from "@/domain/facturacion";
import { Encabezado } from "@/components/app/encabezado";
import { InvitarPortal } from "@/components/app/invitar-portal";
import { CompletarDatosFiscales } from "@/components/app/factura-electronica";
import { faltantesFiscales, fiscalSugerido } from "@/domain/einvoice";
import { Contactos, FormAcuerdo } from "@/components/app/crm";
import { EstadoCotizacionBadge, EstadoDOBadge, Situacion170Badge } from "@/components/estados";
import { EstadoFacturaBadge } from "@/components/estado-factura";
import { BotonLink, Insignia, Tarjeta, TarjetaEncabezado } from "@/components/ui";
import { dinero, dineroCorto, fecha } from "@/lib/formato";

/** Hoja de vida del cliente (RF-41) y acceso al portal (RF-35). */
export default async function Cliente({ params }: PageProps<"/app/clientes/[id]">) {
  const { id } = await params;
  const repo = await contexto();
  const t = await repo.tercero(id);
  if (!t) notFound();
  const [{ cotizaciones, operaciones, facturas, formularios, hoy, usuarios }, accesos, flujo] = await Promise.all([
    cargarTodo(repo),
    t.tipo === "proveedor" ? Promise.resolve([]) : repo.accesosPortal(t.id),
    cargarFlujo(repo),
  ]);
  const opcionesFinppi = (await repo.cuentaFe().catch(() => null))?.instantanea.opcionesCliente;
  const negocios = flujo.filter((p) => p.clienteId === t.id);
  const qs = cotizaciones.filter((q) => q.clienteId === t.id);
  const ops = operaciones.filter((o) => o.clienteId === t.id);
  const fs = facturas.filter((f) => f.clienteId === t.id);
  const comercial = tieneRol(repo, "comercial");

  return (
    <>
      <Encabezado
        antes={
          <Link href="/app/clientes" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Clientes
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {t.razonSocial}
            {t.tipo !== "cliente" && <Insignia tono="info">{t.tipo === "prospecto" ? "Prospecto" : "Proveedor"}</Insignia>}
          </span>
        }
        descripcion={`NIT ${t.nit} · ${t.ciudad}`}
        acciones={
          t.tipo !== "proveedor" && (
            <BotonLink href={`/app/cotizaciones/nueva?cliente=${t.id}`} tamano="sm">
              <Plus /> Cotizar
            </BotonLink>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {negocios.length > 0 && (
            <Tarjeta>
              <TarjetaEncabezado
                titulo="Negocios en curso"
                descripcion="En qué etapa va cada uno, qué sigue y quién lo hace."
                accion={
                  <Link href="/app/flujo?ver=todos" className="text-[13px] font-medium text-brand-fg hover:underline">
                    Ver flujo
                  </Link>
                }
              />
              <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
                {negocios.map((p) => (
                  <TarjetaPaso key={p.id} p={p} usuarios={usuarios} mostrarEtapa />
                ))}
              </div>
            </Tarjeta>
          )}
          <Tarjeta>
            <TarjetaEncabezado titulo="Cotizaciones" descripcion={`${qs.length} en total`} />
            <ul className="divide-y divide-border border-t border-border">
              {qs.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">Sin cotizaciones.</li>}
              {qs.slice(0, 10).map((q) => (
                <li key={q.id}>
                  <Link href={`/app/cotizaciones/${q.id}`} className="flex items-center gap-3 px-5 py-3 text-[13px] hover:bg-surface-2">
                    <span className="font-mono font-medium">{q.consecutivo}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">
                      {q.origen} → {q.destino} · {fecha(q.fechaEmision)}
                    </span>
                    <span className="tabular">{dineroCorto(totalesCotizacion(q).venta, q.monedaPresentacion)}</span>
                    <EstadoCotizacionBadge estado={estadoEfectivo(q, hoy)} />
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
          <div className="grid gap-6 lg:grid-cols-2">
            <Tarjeta>
              <TarjetaEncabezado titulo="Operaciones" />
              <ul className="divide-y divide-border border-t border-border">
                {ops.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">Sin operaciones.</li>}
                {ops.map((o) => (
                  <li key={o.id}>
                    <Link href={`/app/operaciones/${o.id}`} className="flex items-center gap-3 px-5 py-3 text-[13px] hover:bg-surface-2">
                      <span className="font-mono font-medium">{o.consecutivo}</span>
                      <span className="flex-1 text-muted">{fecha(o.abiertoEl)}</span>
                      <EstadoDOBadge estado={o.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Tarjeta>
            <Tarjeta>
              <TarjetaEncabezado titulo="Facturas" />
              <ul className="divide-y divide-border border-t border-border">
                {fs.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">Sin facturas.</li>}
                {fs.map((f) => (
                  <li key={f.id}>
                    <Link href={`/app/facturacion/${f.id}`} className="flex items-center gap-3 px-5 py-3 text-[13px] hover:bg-surface-2">
                      <span className="font-mono font-medium">{f.numero ?? (esPrueba(f) ? f.numeroEsperado ?? "Prueba" : "Prefactura")}</span>
                      <span className="flex-1 tabular">{dinero(totalesFactura(f.lineas).total, f.moneda)}</span>
                      <EstadoFacturaBadge estado={f.estado} prueba={esPrueba(f)} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          </div>
        </div>

        <aside className="space-y-6">
          <Tarjeta>
            <TarjetaEncabezado titulo="Contactos" />
            <Contactos terceroId={t.id} contactos={t.contactos} editable={tieneRol(repo, "comercial", "operaciones")} />
          </Tarjeta>
          {t.tipo !== "proveedor" && (
            <Tarjeta>
              <TarjetaEncabezado titulo="Facturación electrónica" descripcion="Datos que exige Finppi y la DIAN" />
              <div className="p-5 pt-0">
                {tieneRol(repo, "comercial", "contabilidad", "cumplimiento") ? (
                  <CompletarDatosFiscales terceroId={t.id} inicial={fiscalSugerido(t)} faltantes={faltantesFiscales(t.fiscal, opcionesFinppi)} opciones={opcionesFinppi} />
                ) : (
                  <p className="text-[13px] text-muted">{faltantesFiscales(t.fiscal, opcionesFinppi).length ? "Datos fiscales incompletos" : "Datos fiscales completos"}</p>
                )}
              </div>
            </Tarjeta>
          )}
          {t.tipo !== "proveedor" && (
            <Tarjeta>
              <TarjetaEncabezado titulo="Acuerdo comercial" descripcion="Corte de facturación, plazo y moneda" />
              <FormAcuerdo terceroId={t.id} acuerdo={t.acuerdo} editable={tieneRol(repo, "comercial", "contabilidad")} />
            </Tarjeta>
          )}
          {t.tipo === "cliente" && (
            <Tarjeta>
              <TarjetaEncabezado titulo="Circular 170" />
              <div className="px-5 pb-5">
                <Situacion170Badge s={situacionCliente(formularios, t.id, hoy)} />
              </div>
            </Tarjeta>
          )}
          {t.tipo !== "proveedor" && (
            <Tarjeta>
              <TarjetaEncabezado titulo="Portal del cliente" descripcion="Ve sus cotizaciones, DO, documentos y facturas" />
              <div className="space-y-4 px-5 pb-5">
                {accesos.length > 0 && (
                  <ul className="space-y-1.5 text-[13px]">
                    {accesos.map((a) => (
                      <li key={a.usuarioId} className="flex justify-between gap-2">
                        <span className="font-medium">{a.nombre}</span>
                        <span className="truncate text-muted">{a.correo}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {comercial && (
                  <InvitarPortal
                    terceroId={t.id}
                    contactos={t.contactos.filter((k) => k.correo && !accesos.some((a) => a.correo === k.correo))}
                  />
                )}
              </div>
            </Tarjeta>
          )}
        </aside>
      </div>
    </>
  );
}
