import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCode2, FileText, TriangleAlert } from "lucide-react";
import { contexto, tieneRol } from "@/server/contexto";
import { modoDemo } from "@/lib/env";
import { Encabezado } from "@/components/app/encabezado";
import { BotonEnviarMegafoco, EditorPrefactura } from "@/components/app/facturacion";
import { EstadoFacturaBadge } from "@/components/estado-factura";
import { Tarjeta, TarjetaEncabezado, clasesBoton } from "@/components/ui";
import { fechaHora } from "@/lib/formato";

export default async function DetalleFactura({ params }: PageProps<"/app/facturacion/[id]">) {
  const { id } = await params;
  const repo = await contexto();
  const f = await repo.factura(id);
  if (!f) notFound();
  const [cliente, operaciones] = await Promise.all([repo.tercero(f.clienteId), repo.operaciones()]);
  const contable = tieneRol(repo, "contabilidad");
  const editable = contable && f.estado === "borrador";
  const enviable = contable && (f.estado === "borrador" || f.estado === "aprobada" || f.estado === "rechazada");

  return (
    <>
      <Encabezado
        antes={
          <Link href="/app/facturacion" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Facturación
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{f.numero ?? `Prefactura PF-${f.id.slice(0, 6).toUpperCase()}`}</span>
            <EstadoFacturaBadge estado={f.estado} />
          </span>
        }
        descripcion={
          <>
            {cliente?.razonSocial} · NIT {cliente?.nit} · {f.moneda} · creada {fechaHora(f.creadoEl)} · DO{" "}
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
          <p>{f.error}</p>
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[1fr_320px]">
        <Tarjeta className="overflow-hidden">
          <TarjetaEncabezado titulo="Conceptos" descripcion="Desde los conceptos de venta de los DO" />
          <EditorPrefactura id={f.id} lineasIniciales={f.lineas} moneda={f.moneda} editable={editable} />
        </Tarjeta>

        <aside className="space-y-6 2xl:order-none order-first">
          <Tarjeta className="p-5">
            {f.estado === "emitida" ? (
              <div className="space-y-3 text-[13px]">
                <p className="font-medium">Factura electrónica emitida</p>
                <p className="text-muted">
                  Número <span className="font-mono text-fg">{f.numero}</span>
                </p>
                {f.cufe && <p className="font-mono text-[11px] break-all text-subtle">CUFE {f.cufe}</p>}
                <div className="flex gap-2">
                  {f.pdfUrl && (
                    <a href={f.pdfUrl} target="_blank" rel="noopener" className={clasesBoton({ variante: "secundario", tamano: "sm" })}>
                      <FileText /> PDF
                    </a>
                  )}
                  {f.xmlUrl && (
                    <a href={f.xmlUrl} target="_blank" rel="noopener" className={clasesBoton({ variante: "secundario", tamano: "sm" })}>
                      <FileCode2 /> XML
                    </a>
                  )}
                </div>
                {modoDemo && <p className="text-xs text-subtle">Emisión simulada en el modo demo.</p>}
              </div>
            ) : f.estado === "en_cola" ? (
              <p className="text-[13px] text-muted">
                En cola en Megafoco. Su bot la emite en Finppi y el número, el CUFE y los archivos llegan aquí automáticamente.
              </p>
            ) : enviable ? (
              <div className="space-y-3">
                <p className="text-[13px] text-muted">
                  Al aprobar, se envía a Megafoco, que registra el asiento contable y emite la factura electrónica.
                </p>
                <BotonEnviarMegafoco id={f.id} texto={f.estado === "rechazada" || f.error ? "Reintentar envío" : "Aprobar y enviar a Megafoco"} />
              </div>
            ) : (
              <p className="text-[13px] text-muted">Solo Contabilidad aprueba y envía facturas.</p>
            )}
          </Tarjeta>
        </aside>
      </div>
    </>
  );
}
