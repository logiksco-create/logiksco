import "server-only";
import type { Repositorio } from "./datos/repositorio";
import { hoyISO, sumarDias } from "@/domain/fechas";

/** Datos de apoyo del editor de cotizaciones (clientes, proveedores). */
export async function datosEditor(repo: Repositorio) {
  const terceros = await repo.terceros();
  return {
    hoy: hoyISO(),
    clientes: terceros.filter((t) => t.tipo !== "proveedor"),
    proveedores: terceros
      .filter((t) => t.tipo === "proveedor")
      .map((t) => ({ id: t.id, nombre: t.razonSocial })),
    vigenciaPorDefecto: sumarDias(hoyISO(), 15),
  };
}
