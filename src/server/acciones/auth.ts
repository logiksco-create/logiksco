"use server";

import { z } from "@/lib/zod";
import { redirect } from "next/navigation";
import { modoDemo, env } from "@/lib/env";
import { clienteUsuario } from "../supabase/clientes";

type R = { ok: false; error: string } | { ok: true; mensaje: string } | null;

const correo = z.email("Correo inválido");
const clave = z.string().min(10, "La contraseña debe tener al menos 10 caracteres").max(72);

/** Solo rutas internas: evita redirecciones abiertas. */
function destinoSeguro(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/app") && !s.startsWith("//") ? s : "/app";
}

export async function ingresar(_: R, formData: FormData): Promise<R> {
  if (modoDemo) redirect("/app");
  const datos = z.object({ correo, clave: z.string().min(1, "Escribe tu contraseña") }).safeParse({
    correo: formData.get("correo"),
    clave: formData.get("clave"),
  });
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };

  const db = await clienteUsuario();
  const { error } = await db.auth.signInWithPassword({ email: datos.data.correo, password: datos.data.clave });
  // Mensaje genérico: no revela si el correo existe.
  if (error) return { ok: false, error: "Correo o contraseña incorrectos" };
  redirect(destinoSeguro(formData.get("siguiente")));
}

const esquemaRegistro = z.object({
  nit: z.string().trim().regex(/^[0-9.\-]{6,15}$/, "NIT inválido"),
  razonSocial: z.string().trim().min(3, "Razón social requerida").max(200),
  nombre: z.string().trim().min(3, "Tu nombre es requerido").max(120),
  correo,
  clave,
});

export async function registrar(_: R, formData: FormData): Promise<R> {
  if (modoDemo) redirect("/app");
  const r = esquemaRegistro.safeParse(Object.fromEntries(formData));
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const d = r.data;

  const db = await clienteUsuario();
  const { data, error } = await db.auth.signUp({
    email: d.correo,
    password: d.clave,
    options: {
      emailRedirectTo: `${env.appUrl}/auth/confirmar`,
      data: { nombre: d.nombre, nit: d.nit, razon_social: d.razonSocial },
    },
  });
  if (error) return { ok: false, error: "No pudimos crear la cuenta. Revisa los datos o intenta más tarde." };

  // Con verificación de correo activa no hay sesión todavía: la empresa se crea
  // al confirmar (primer ingreso). Si ya hay sesión, se crea de inmediato.
  if (data.session) {
    const { error: e2 } = await db.rpc("registrar_empresa", {
      p_nit: d.nit,
      p_razon_social: d.razonSocial,
      p_nombre: d.nombre,
    });
    if (e2) return { ok: false, error: "Ya existe una empresa registrada con ese NIT." };
    redirect("/app");
  }
  return { ok: true, mensaje: `Te enviamos un correo a ${d.correo} para verificar tu cuenta.` };
}

export async function salir() {
  if (!modoDemo) await (await clienteUsuario()).auth.signOut();
  redirect("/login");
}
