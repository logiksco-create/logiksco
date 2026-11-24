import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { contexto } from "@/server/contexto";
import { cargarTodo, situacionCliente } from "@/server/consultas";
import { totalesCotizacion } from "@/domain/cotizacion";
import { Encabezado } from "@/components/app/encabezado";
import { Situacion170Badge } from "@/components/estados";
import { NuevoTercero } from "@/components/app/form-tercero";
import { Avatar, Insignia, Tabla, Tarjeta, Td, Th, Vacio } from "@/components/ui";
import { cn, dineroCorto } from "@/lib/formato";

export const metadata = { title: "Clientes" };

const TIPOS = { "": "Clientes y prospectos", proveedor: "Proveedores" } as const;

export default async function Clientes({ searchParams }: PageProps<"/app/clientes">) {
  const { tipo } = await searchParams;
  const vista = tipo === "proveedor" ? "proveedor" : "";
  const repo = await contexto();
  const { terceros, cotizaciones, operaciones, formularios, hoy } = await cargarTodo(repo);
  const lista = terceros.filter((t) => (vista ? t.tipo === "proveedor" : t.tipo !== "proveedor"));

  return (
    <>
      <Encabezado
        titulo="Clientes"
        descripcion="Hoja de vida, acuerdos comerciales y estado de la Circular 170 de cada cliente."
        acciones={<NuevoTercero />}
      />

      <nav className="mb-4 flex gap-1">
        {Object.entries(TIPOS).map(([v, l]) => (
          <Link
            key={v}
            href={v ? `/app/clientes?tipo=${v}` : "/app/clientes"}
            className={cn(
              "inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium transition-colors",
              vista === v ? "bg-surface text-fg shadow-card ring-1 ring-border" : "text-muted hover:text-fg",
            )}
          >
            {l}
          </Link>
        ))}
      </nav>

      <Tarjeta>
        {lista.length === 0 ? (
          <Vacio icono={<Building2 />} titulo="Aún no hay registros" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Razón social</Th>
                <Th className="hidden md:table-cell">Contacto</Th>
                {!vista && (
                  <>
                    <Th className="hidden lg:table-cell">Acuerdo</Th>
                    <Th className="text-right">Ventas</Th>
                    <Th className="hidden sm:table-cell">DO</Th>
                    <Th>Circular 170</Th>
                    <Th className="w-10" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => {
                const ventas = cotizaciones
                  .filter((q) => q.clienteId === t.id && q.estado === "aceptada")
                  .reduce((s, q) => s + totalesCotizacion({ ...q, monedaPresentacion: "COP" }).venta, 0);
                const dos = operaciones.filter((o) => o.clienteId === t.id).length;
                const k = t.contactos[0];
                return (
                  <tr key={t.id} className="transition-colors hover:bg-surface-2">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar nombre={t.razonSocial} className="rounded-lg" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            <span className="truncate">{t.razonSocial}</span>
                            {t.tipo === "prospecto" && <Insignia tono="info">Prospecto</Insignia>}
                          </p>
                          <p className="text-xs text-muted">
                            NIT {t.nit} · {t.ciudad}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="hidden text-[13px] md:table-cell">
                      {k ? (
                        <>
                          {k.nombre}
                          <span className="block text-xs text-muted">{k.correo || k.cargo}</span>
                        </>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </Td>
                    {!vista && (
                      <>
                        <Td className="hidden text-[13px] text-muted lg:table-cell">
                          {t.acuerdo
                            ? `Corte día ${t.acuerdo.diaCorte} · ${t.acuerdo.plazoPagoDias} días · ${t.acuerdo.moneda}`
                            : "—"}
                        </Td>
                        <Td className="text-right font-medium tabular">{ventas ? dineroCorto(ventas) : "—"}</Td>
                        <Td className="hidden tabular sm:table-cell">{dos || "—"}</Td>
                        <Td>
                          {t.tipo === "cliente" ? (
                            <Situacion170Badge s={situacionCliente(formularios, t.id, hoy)} />
                          ) : (
                            <span className="text-xs text-subtle">No aplica</span>
                          )}
                        </Td>
                        <Td>
                          <Link
                            href={`/app/cotizaciones/nueva?cliente=${t.id}`}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-subtle hover:bg-surface hover:text-brand-fg"
                            title="Cotizar a este cliente"
                          >
                            <Plus className="size-4" />
                          </Link>
                        </Td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
