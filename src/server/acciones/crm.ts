"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod";
import { contexto, tieneRol } from "../contexto";
import { ErrorNegocio } from "../datos/errores";

type R = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

async function intentar(fn: () => Promise<string | void>, ruta: string): Promise<R> {
  try {
    const mensaje = await fn();
    revalidatePath(ruta);
    return { ok: true, mensaje: mensaje ?? "Guardado" };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error(e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}

const vacioAIndefinido = (v: unknown) => (v === "" || v === null ? undefined : v);

/** RF-42: día de corte, plazo, moneda y condiciones especiales. */
export async function guardarAcuerdo(terceroId: string, _: unknown, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "comercial", "contabilidad")) throw new ErrorNegocio("Tu rol no permite editar acuerdos");
    const a = z
      .object({
        diaCorte: z.coerce.number().int().min(1, "Día de corte entre 1 y 31").max(31, "Día de corte entre 1 y 31"),
        plazoPagoDias: z.coerce.number().int().min(0).max(365, "Plazo máximo 365 días"),
        moneda: z.enum(["COP", "USD"]),
        condiciones: z.preprocess(vacioAIndefinido, z.string().trim().max(1000).optional()),
      })
      .parse(Object.fromEntries(formData));
    await repo.guardarAcuerdo(terceroId, a);
    return "Acuerdo guardado";
  }, `/app/clientes/${terceroId}`);
}

/** RF-41: contactos con cargo, correo, teléfono y cumpleaños. */
export async function guardarContacto(terceroId: string, _: unknown, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "comercial", "operaciones")) throw new ErrorNegocio("Tu rol no permite editar contactos");
    const c = z
      .object({
        id: z.preprocess(vacioAIndefinido, z.string().optional()),
        nombre: z.string().trim().min(2, "Nombre requerido").max(120),
        cargo: z.string().trim().max(120),
        correo: z.preprocess(vacioAIndefinido, z.email("Correo inválido").optional()),
        telefono: z.preprocess(vacioAIndefinido, z.string().trim().max(40).optional()),
        cumpleanos: z.preprocess(vacioAIndefinido, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").optional()),
      })
      .parse(Object.fromEntries(formData));
    await repo.guardarContacto(terceroId, { ...c, correo: c.correo ?? "" });
    return c.id ? "Contacto actualizado" : "Contacto agregado";
  }, `/app/clientes/${terceroId}`);
}

export async function eliminarContacto(terceroId: string, contactoId: string): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "comercial")) throw new ErrorNegocio("Tu rol no permite eliminar contactos");
    await repo.eliminarContacto(terceroId, contactoId);
    return "Contacto eliminado";
  }, `/app/clientes/${terceroId}`);
}

/** RF-29: costo real total de un concepto del DO. Vacío lo borra. */
export async function registrarCostoReal(operacionId: string, conceptoId: string, valor: string): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "operaciones", "contabilidad")) throw new ErrorNegocio("Tu rol no permite registrar costos");
    const limpio = valor.replace(/\s/g, "");
    const total = limpio === "" ? null : z.coerce.number().min(0, "El costo no puede ser negativo").parse(limpio);
    await repo.registrarCostoReal(operacionId, conceptoId, total);
  }, `/app/operaciones/${operacionId}`);
}
