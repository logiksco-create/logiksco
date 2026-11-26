import "server-only";
import type { Factura } from "@/domain/types";
import type { Repositorio } from "./datos/repositorio";
import type { DatosPdfFactura } from "./pdf/factura";

/** Reúne lo que imprime la factura: cliente, DO, carga, ejecutivo y textos. */
export async function datosPdfFactura(repo: Repositorio, f: Factura): Promise<DatosPdfFactura | null> {
  const [cliente, operaciones, cuenta, usuarios] = await Promise.all([
    repo.tercero(f.clienteId),
    repo.operaciones(),
    repo.cuentaFe(),
    repo.usuarios().catch(() => []),
  ]);
  if (!cliente) return null;
  const ops = f.operaciones.map((id) => operaciones.find((o) => o.id === id)).filter((o) => !!o);
  const cotizacion = ops[0] ? await repo.cotizacion(ops[0].cotizacionId) : null;
  const comercial = usuarios.find((u) => u.id === cotizacion?.comercialId)?.nombre;
  return { f, empresa: repo.empresa, cliente, operaciones: ops, cotizacion, comercial, cuenta };
}
