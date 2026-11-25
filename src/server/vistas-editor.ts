import "server-only";
import type { Repositorio } from "./datos/repositorio";
import { hoyISO, sumarDias } from "@/domain/fechas";
import { etiquetaLugar } from "@/domain/catalogo";

/** Datos de apoyo del editor de cotizaciones (clientes, proveedores). */
export async function datosEditor(repo: Repositorio) {
  const [terceros, catalogo] = await Promise.all([repo.terceros(), repo.catalogo()]);
  return {
    lugares: [...new Set(catalogo.filter((e) => e.tipo !== "concepto" && e.tipo !== "contenedor").map(etiquetaLugar))],
    conceptos: catalogo
      .filter((e) => e.tipo === "concepto")
      .map((e) => ({ nombre: e.nombre, ...e.datos })),
    servicios: repo.empresa.servicios ?? [],
    hoy: hoyISO(),
    clientes: terceros.filter((t) => t.tipo !== "proveedor"),
    proveedores: terceros
      .filter((t) => t.tipo === "proveedor")
      .map((t) => ({ id: t.id, nombre: t.razonSocial })),
    vigenciaPorDefecto: sumarDias(hoyISO(), 15),
  };
}
