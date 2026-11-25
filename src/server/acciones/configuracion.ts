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

/* ---------------- Catálogos, hitos y términos (RF-54) ---------------- */

const TIPOS_SERV = ["aereo", "maritimo_fcl", "maritimo_lcl", "terrestre", "aduana", "seguro", "multimodal"] as const;

export async function agregarCatalogo(_: R, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    const d = z
      .object({
        tipo: z.enum(["puerto", "aeropuerto", "ciudad", "contenedor", "concepto"]),
        nombre: z.string().trim().min(2, "Nombre requerido").max(120),
        codigo: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(10).optional()),
        bloque: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["origen", "flete", "destino", "terrestre", "aduana", "seguro", "otros"]).optional()),
      })
      .parse(Object.fromEntries(formData));
    await repo.agregarCatalogo({
      tipo: d.tipo,
      nombre: d.nombre,
      codigo: d.codigo?.toUpperCase(),
      datos: d.tipo === "concepto" ? { bloque: d.bloque ?? "otros" } : {},
    });
    return `«${d.nombre}» agregado`;
  });
}

export async function eliminarCatalogo(id: string): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.eliminarCatalogo(z.string().min(1).parse(id));
    return "Eliminado del catálogo";
  });
}

export async function guardarHitos(_: R, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    const hitos: Partial<Record<(typeof TIPOS_SERV)[number], string[]>> = {};
    for (const t of TIPOS_SERV) {
      const lista = String(formData.get(t) ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      if (lista.length > 30) throw new ErrorNegocio("Máximo 30 hitos por tipo");
      if (lista.some((x) => x.length > 60)) throw new ErrorNegocio("Cada hito debe tener máximo 60 caracteres");
      if (lista.length) hitos[t] = lista;
    }
    await repo.actualizarEmpresa({ hitosPorTipo: hitos });
    return "Hitos guardados. Aplican a los DO que se abran desde ahora.";
  });
}

export async function guardarTerminos(_: R, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    const terminos = z.string().trim().max(4000, "Máximo 4.000 caracteres").parse(formData.get("terminos") ?? "");
    await repo.actualizarEmpresa({ terminos });
    return "Términos guardados";
  });
}

/* ---------------- Asistente de bienvenida ---------------- */

export async function guardarPasoBienvenida(paso: number, _: R, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (paso === 1) {
      const d = z
        .object({
          razonSocial: z.string().trim().min(3, "Razón social requerida").max(200),
          ciudad: z.string().trim().max(80),
          colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
        })
        .parse(Object.fromEntries(formData));
      await repo.actualizarEmpresa(d);
    } else if (paso === 2) {
      const d = z.object({ prefijoCotizacion: prefijo, prefijoDO: prefijo }).parse(Object.fromEntries(formData));
      await repo.actualizarEmpresa(d);
    } else if (paso === 3) {
      const servicios = z.array(z.enum(TIPOS_SERV)).min(1, "Elige al menos un servicio").parse(formData.getAll("servicios"));
      await repo.actualizarEmpresa({ servicios });
    } else {
      await repo.actualizarEmpresa({ configurada: true });
    }
    return "Guardado";
  });
}

/* ---------------- Logo de la empresa ---------------- */

const metaLogo = z.object({
  nombre: z.string().min(1).max(200),
  mime: z.string().max(60),
  tamano: z.number().int().positive(),
});

export async function prepararLogo(m: z.input<typeof metaLogo>) {
  try {
    const repo = await contexto();
    return { ok: true as const, datos: await repo.prepararSubidaLogo(metaLogo.parse(m)) };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false as const, error: e.message };
    if (e instanceof z.ZodError) return { ok: false as const, error: "Datos del logo inválidos" };
    console.error(e);
    return { ok: false as const, error: "No se pudo preparar la subida del logo" };
  }
}

export async function guardarLogo(m: z.input<typeof metaLogo> & { ruta: string }): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    const d = metaLogo.extend({ ruta: z.string().min(5).max(200) }).parse(m);
    await repo.guardarLogo(d);
    return "Logo actualizado";
  });
}

export async function subirLogoDemo(formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    const archivo = formData.get("logo");
    if (!(archivo instanceof File)) throw new ErrorNegocio("Selecciona una imagen");
    await repo.guardarLogo({ mime: archivo.type, tamano: archivo.size, bytes: new Uint8Array(await archivo.arrayBuffer()) });
    return "Logo actualizado";
  });
}

export async function quitarLogo(): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.quitarLogo();
    return "Logo eliminado";
  });
}
