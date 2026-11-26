import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { contexto } from "@/server/contexto";
import { datosEditor } from "@/server/vistas-editor";
import { trmDelDia } from "@/server/trm";
import { Encabezado } from "@/components/app/encabezado";
import { EditorCotizacion } from "@/components/app/editor-cotizacion";
import { EstadoCotizacionBadge } from "@/components/estados";

export const metadata = { title: "Editar cotización" };

export default async function EditarCotizacion({ params, searchParams }: PageProps<"/app/cotizaciones/[id]/editar">) {
  const { id } = await params;
  const sp = await searchParams;
  const repo = await contexto();
  const [q, d, trm] = await Promise.all([repo.cotizacion(id), datosEditor(repo), trmDelDia()]);
  if (!q) notFound();
  if (q.estado === "aceptada") redirect(`/app/cotizaciones/${id}`);
  const origen = q.origenId ? await repo.cotizacion(q.origenId) : null;

  return (
    <>
      <Encabezado
        antes={
          <Link href={`/app/cotizaciones/${id}`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> {q.consecutivo}
          </Link>
        }
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            Editar {q.consecutivo} <EstadoCotizacionBadge estado={q.estado} />
          </span>
        }
        descripcion={q.estado === "borrador" ? "Borrador" : `Al guardar se creará la versión ${q.version + 1}.`}
      />
      <EditorCotizacion
        id={q.id}
        hoy={d.hoy}
        trmDia={trm}
        lugares={d.lugares}
        conceptosCatalogo={d.conceptos}
        productosFinppi={d.productosFinppi}
        servicios={d.servicios}
        clientes={d.clientes}
        proveedores={d.proveedores}
        aviso={
          sp.duplicada
            ? { duplicada: true, vencidas: Number(sp.vencidas ?? 0), origen: origen?.consecutivo }
            : undefined
        }
        inicial={{
          clienteId: q.clienteId,
          contactoId: q.contactoId,
          tipoServicio: q.tipoServicio,
          incoterm: q.incoterm,
          origen: q.origen,
          destino: q.destino,
          mercancia: q.mercancia,
          conceptos: q.conceptos.map(({ id: _id, ...c }) => c),
          trm: q.trm,
          monedaPresentacion: q.monedaPresentacion,
          vigenteHasta: q.vigenteHasta,
          terminos: q.terminos,
          facturacion: q.facturacion,
        }}
      />
    </>
  );
}
