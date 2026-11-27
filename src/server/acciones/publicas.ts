"use server";

import { z } from "@/lib/zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { repositorioPublico } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import { hoyISO } from "@/domain/fechas";
import { requiereFormulario, situacion170 } from "@/domain/cumplimiento";
import { parsearFormulario170 } from "../validacion170";

/**
 * Acciones del enlace público de aceptación. No hay sesión: la autorización
 * es la posesión del token (aleatorio, de un solo propósito y con vencimiento).
 */

type R = { ok: true; requiere170?: boolean } | { ok: false; error: string };

const token = z.string().min(8).max(128);

async function evidencia() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? undefined,
  };
}

function fallo(e: unknown): R {
  if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
  console.error(e);
  return { ok: false, error: "No pudimos registrar tu respuesta. Intenta de nuevo." };
}

const esquemaDecision = z.object({
  decision: z.enum(["aceptada", "rechazada"]),
  nombre: z.string().trim().min(3, "Escribe tu nombre completo").max(120),
  cargo: z.string().trim().min(2, "Escribe tu cargo").max(120),
  correo: z.email("Correo inválido"),
  documento: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(5, "Documento inválido").max(30).optional()),
  motivo: z.string().trim().max(1000).optional(),
  acepto: z.literal("on", { message: "Debes confirmar que aceptas los términos" }).optional(),
});

export async function responderCotizacion(t: string, _: unknown, formData: FormData): Promise<R> {
  try {
    const tk = token.parse(t);
    const d = esquemaDecision.parse(Object.fromEntries(formData));
    if (d.decision === "aceptada" && !d.acepto) {
      throw new ErrorNegocio("Debes confirmar que aceptas los términos");
    }
    if (d.decision === "aceptada" && !d.documento) {
      throw new ErrorNegocio("Escribe tu número de documento");
    }
    if (d.decision === "rechazada" && !d.motivo) {
      throw new ErrorNegocio("Cuéntanos el motivo del rechazo");
    }
    const repo = repositorioPublico();
    await repo.registrarDecision(tk, { ...d, ...(await evidencia()) });
    revalidatePath(`/c/${tk}`);
    revalidatePath("/app", "layout");

    // RF-14: al aceptar, verificar la Circular 170 del cliente por NIT.
    const vista = await repo.cotizacionPorToken(tk);
    const requiere = vista ? requiereFormulario(situacion170(vista.formularios, hoyISO())) : false;
    return { ok: true, requiere170: d.decision === "aceptada" && requiere };
  } catch (e) {
    return fallo(e);
  }
}

export async function enviarFormulario170(t: string, _: unknown, formData: FormData): Promise<R> {
  try {
    const tk = token.parse(t);
    await repositorioPublico().enviarFormulario170(tk, parsearFormulario170(formData));
    revalidatePath(`/c/${tk}`);
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
