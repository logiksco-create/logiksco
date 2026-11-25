import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { contexto } from "@/server/contexto";
import { datosEditor } from "@/server/vistas-editor";
import { trmDelDia } from "@/server/trm";
import { Encabezado } from "@/components/app/encabezado";
import { EditorCotizacion } from "@/components/app/editor-cotizacion";

export const metadata = { title: "Nueva cotización" };

const TERMINOS =
  "Tarifas sujetas a disponibilidad de espacio y equipo. No incluye impuestos, almacenajes ni demoras. Valores en USD se liquidan a la TRM del día de facturación.";

export default async function NuevaCotizacion({ searchParams }: PageProps<"/app/cotizaciones/nueva">) {
  const { cliente } = await searchParams;
  const repo = await contexto();
  const [d, trm] = await Promise.all([datosEditor(repo), trmDelDia()]);
  const c = d.clientes.find((x) => x.id === cliente);

  return (
    <>
      <Encabezado
        antes={
          <Link href="/app/cotizaciones" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Cotizaciones
          </Link>
        }
        titulo="Nueva cotización"
        descripcion="La utilidad se calcula mientras escribes."
      />
      <EditorCotizacion
        hoy={d.hoy}
        trmDia={trm}
        lugares={d.lugares}
        conceptosCatalogo={d.conceptos}
        servicios={d.servicios}
        clientes={d.clientes}
        proveedores={d.proveedores}
        inicial={{
          clienteId: c?.id ?? "",
          contactoId: c?.contactos[0]?.id,
          tipoServicio: repo.empresa.servicios?.[0] ?? "maritimo_fcl",
          incoterm: "FOB",
          origen: "",
          destino: "",
          mercancia: { descripcion: "", piezas: 0, pesoKg: 0, volumenM3: 0 },
          conceptos: [
            { bloque: "flete", descripcion: "", moneda: "USD", unidad: "contenedor", cantidad: 1, costoUnitario: 0, ventaUnitaria: 0 },
          ],
          trm: trm.valor,
          monedaPresentacion: c?.acuerdo?.moneda ?? "COP",
          vigenteHasta: d.vigenciaPorDefecto,
          terminos: repo.empresa.terminos || TERMINOS,
        }}
      />
    </>
  );
}
