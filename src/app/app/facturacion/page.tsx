import Link from "next/link";
import { Receipt, ReceiptText } from "lucide-react";
import { contexto, tieneRol } from "@/server/contexto";
import { cargarTodo } from "@/server/consultas";
import { pendientesPorCliente, totalesFactura } from "@/domain/facturacion";
import { utilidadOperacion } from "@/domain/operacion";
import { ESTADOS_DO } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import { GenerarPrefactura } from "@/components/app/facturacion";
import { EstadoFacturaBadge } from "@/components/estado-factura";
import { Tabla, Tarjeta, TarjetaEncabezado, Td, Th, Vacio } from "@/components/ui";
import { dinero, dineroCorto, fecha, fechaHora } from "@/lib/formato";

export const metadata = { title: "Facturación" };

export default async function Facturacion() {
  const repo = await contexto();
  const { operaciones, facturas, terceros, hoy } = await cargarTodo(repo);
  const contable = tieneRol(repo, "contabilidad");
  const cuentaFe = await repo.cuentaFe();
  const clientes = terceros.filter((t) => t.tipo === "cliente");
  const pendientes = pendientesPorCliente(operaciones, facturas, clientes, hoy);
  const nombre = (id: string) => terceros.find((t) => t.id === id)?.razonSocial ?? "—";

  return (
    <>
      <Encabezado
        titulo="Facturación"
        descripcion="Prefactura desde los DO y factura electrónica en USD o COP con un clic: el bot la emite en Finppi y llega a la DIAN."
      />

      {cuentaFe?.estado !== "activa" && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning-soft p-4 text-[13.5px] text-warning">
          La cuenta de Finppi no está activa. El Administrador la conecta en{" "}
          <Link href="/app/configuracion/facturacion-electronica" className="font-semibold underline">
            Configuración → Facturación electrónica
          </Link>
          .
        </div>
      )}

      <Tarjeta>
        <TarjetaEncabezado
          titulo="Por facturar"
          descripcion="DO en tránsito, en destino o entregados, abiertos hasta la fecha de corte de cada cliente"
        />
        {pendientes.length === 0 ? (
          <Vacio icono={<Receipt />} titulo="Nada pendiente por facturar" />
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {pendientes.map((p) => (
              <div key={p.cliente.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 bg-surface-2/60 px-5 py-2.5">
                  <p className="font-medium">{p.cliente.razonSocial}</p>
                  <p className="text-xs text-muted">
                    {p.corte ? `Corte ${fecha(p.corte)}` : "Sin día de corte"} · {p.cliente.acuerdo?.moneda ?? "COP"} · plazo{" "}
                    {p.cliente.acuerdo?.plazoPagoDias ?? 30} días
                  </p>
                </div>
                {contable ? (
                  <GenerarPrefactura
                    clienteId={p.cliente.id}
                    operaciones={p.operaciones.map((o) => ({
                      id: o.id,
                      consecutivo: o.consecutivo,
                      abiertoEl: o.abiertoEl,
                      estado: ESTADOS_DO[o.estado].toLowerCase(),
                      venta: dineroCorto(utilidadOperacion(o).cotizada.venta),
                    }))}
                  />
                ) : (
                  <p className="px-5 py-3 text-[13px] text-muted">
                    {p.operaciones.map((o) => o.consecutivo).join(", ")} · solo Contabilidad genera prefacturas.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Tarjeta>

      <Tarjeta className="mt-6">
        <TarjetaEncabezado titulo="Facturas" descripcion="Prefacturas y su estado de emisión" />
        {facturas.length === 0 ? (
          <Vacio icono={<ReceiptText />} titulo="Aún no hay facturas" />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Factura</Th>
                <Th>Cliente</Th>
                <Th className="hidden md:table-cell">DO</Th>
                <Th className="text-right">Total</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="transition-colors hover:bg-surface-2">
                  <Td>
                    <Link href={`/app/facturacion/${f.id}`} className="font-mono text-[13px] font-medium hover:text-brand-fg">
                      {f.numero ?? `PF-${f.id.slice(0, 6).toUpperCase()}`}
                    </Link>
                    <p className="text-xs text-subtle">{fechaHora(f.creadoEl)}</p>
                  </Td>
                  <Td className="font-medium">{nombre(f.clienteId)}</Td>
                  <Td className="hidden text-[13px] text-muted md:table-cell">
                    {f.operaciones.map((id) => operaciones.find((o) => o.id === id)?.consecutivo).join(", ")}
                  </Td>
                  <Td className="text-right font-medium tabular whitespace-nowrap">{dinero(totalesFactura(f.lineas).total, f.moneda)}</Td>
                  <Td>
                    <EstadoFacturaBadge estado={f.estado} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
