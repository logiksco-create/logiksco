"use server";

import { z } from "@/lib/zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { repositorioPublico } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import { hoyISO } from "@/domain/fechas";
import { requiereFormulario, situacion170 } from "@/domain/cumplimiento";

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

const esquema170 = z.object({
  razonSocial: z.string().trim().min(3, "Razón social requerida").max(200),
  nit: z.string().trim().min(5, "NIT requerido").max(20),
  domicilio: z.string().trim().min(5, "Dirección requerida").max(200),
  ciudad: z.string().trim().min(2, "Ciudad requerida").max(80),
  actividadEconomica: z.string().trim().min(3, "Actividad económica requerida").max(200),
  capitalSocial: z.coerce.number().min(0, "Capital inválido"),
  origenRecursos: z.string().trim().min(3, "Indica el origen de los recursos").max(300),
  formaPago: z.string().trim().min(3, "Indica la forma de pago").max(120),
  entidadFinanciera: z.string().trim().min(3, "Indica la entidad financiera y ciudad").max(200),
  rlNombre: z.string().trim().min(3, "Nombre del representante legal").max(120),
  rlDocumento: z.string().trim().min(5, "Documento del representante legal").max(40),
  beneficiarios: z.string().trim().min(3, "Indica los beneficiarios").max(500),
  esPEP: z.enum(["si", "no"], { message: "Indica si es PEP" }),
  autorizaDatos: z.literal("on", { message: "Debes autorizar el tratamiento de datos (Ley 1581 de 2012)" }),
  firma: z.string().trim().min(3, "Escribe tu nombre como firma"),
});

export async function enviarFormulario170(t: string, _: unknown, formData: FormData): Promise<R> {
  try {
    const tk = token.parse(t);
    const d = esquema170.parse(Object.fromEntries(formData));
    await repositorioPublico().enviarFormulario170(tk, {
      razonSocial: d.razonSocial,
      nit: d.nit,
      domicilio: d.domicilio,
      ciudad: d.ciudad,
      actividadEconomica: d.actividadEconomica,
      capitalSocial: d.capitalSocial,
      origenRecursos: d.origenRecursos,
      formaPago: d.formaPago,
      entidadFinanciera: d.entidadFinanciera,
      representantes: [{ nombre: d.rlNombre, documento: d.rlDocumento, cargo: "Representante legal" }],
      beneficiarios: d.beneficiarios,
      esPEP: d.esPEP === "si",
      autorizaDatos: true,
    });
    revalidatePath(`/c/${tk}`);
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
