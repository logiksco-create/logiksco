"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod";
import { modoDemo } from "@/lib/env";
import { COOKIE_PORTAL, contexto, contextoPortal, tieneRol } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import { parsearFormulario170 } from "../validacion170";

type R = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

function fallo(e: unknown): R {
  if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  console.error(e);
  return { ok: false, error: "No se pudo completar. Intenta de nuevo." };
}

/** El cliente actualiza su Circular 170 desde el portal (RF-18, RF-36). */
export async function enviar170Portal(_: unknown, formData: FormData): Promise<R> {
  try {
    const repo = await contextoPortal();
    await repo.enviarFormulario170(parsearFormulario170(formData));
    revalidatePath("/portal", "layout");
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Comercial invita a un contacto del cliente al portal (RF-35). */
export async function invitarAlPortal(terceroId: string, _: unknown, formData: FormData): Promise<R> {
  try {
    const repo = await contexto();
    if (!tieneRol(repo, "comercial")) throw new ErrorNegocio("Solo Comercial puede invitar clientes al portal");
    const d = z
      .object({ nombre: z.string().trim().min(3, "Nombre requerido").max(120), correo: z.email("Correo inválido") })
      .parse({ nombre: formData.get("nombre"), correo: formData.get("correo") });
    await repo.invitarAlPortal(terceroId, d);
    revalidatePath(`/app/clientes/${terceroId}`);
    return { ok: true, mensaje: modoDemo ? `Acceso creado para ${d.correo} (demo)` : `Invitación enviada a ${d.correo}` };
  } catch (e) {
    return fallo(e);
  }
}

export async function verPortalComo(formData: FormData) {
  if (!modoDemo) return;
  const id = z.string().max(60).parse(formData.get("acceso"));
  (await cookies()).set(COOKIE_PORTAL, id, { path: "/", sameSite: "lax", httpOnly: true });
  revalidatePath("/portal", "layout");
}
