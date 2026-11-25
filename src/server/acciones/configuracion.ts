"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod";
import { contexto } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import type { Rol } from "@/domain/types";

type R = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

async function intentar(fn: () => Promise<string | void>): Promise<R> {
  try {
    const mensaje = await fn();
    revalidatePath("/app", "layout");
    return { ok: true, mensaje: mensaje ?? "Cambios guardados" };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error(e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}

const prefijo = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,6}$/, "El prefijo debe tener de 2 a 6 letras o números");

const esquemaEmpresa = z.object({
  razonSocial: z.string().trim().min(3, "Razón social requerida").max(200),
  ciudad: z.string().trim().max(80),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
  prefijoCotizacion: prefijo,
  prefijoDO: prefijo,
  vigencia170Meses: z.coerce.number().int().min(1, "Mínimo 1 mes").max(60, "Máximo 60 meses"),
  bloquearDOSin170: z.preprocess((v) => v === "on", z.boolean()),
});

export async function guardarEmpresa(_: R, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.actualizarEmpresa(esquemaEmpresa.parse(Object.fromEntries(formData)));
  });
}

const roles = z
  .array(z.enum(["admin", "comercial", "operaciones", "cumplimiento", "contabilidad"]))
  .min(1, "Asigna al menos un rol");

export async function invitarUsuario(_: R, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    const d = z
      .object({
        nombre: z.string().trim().min(3, "Nombre requerido").max(120),
        correo: z.email("Correo inválido"),
        roles,
      })
      .parse({ nombre: formData.get("nombre"), correo: formData.get("correo"), roles: formData.getAll("roles") });
    await repo.invitarUsuario(d);
    return `Invitación enviada a ${d.correo}`;
  });
}

export async function actualizarRoles(usuarioId: string, nuevos: Rol[]): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.cambiarRoles(z.string().min(1).parse(usuarioId), roles.parse(nuevos));
  });
}

export async function desactivarUsuario(usuarioId: string): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.desactivarUsuario(z.string().min(1).parse(usuarioId));
    return "Usuario desactivado";
  });
}
