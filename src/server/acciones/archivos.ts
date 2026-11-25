"use server";

import { revalidatePath } from "next/cache";
import { z } from "@/lib/zod";
import { contexto, repositorioPublico, tieneRol } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import type { SubidaFirmada } from "../datos/repositorio";

/**
 * Subida de archivos en dos pasos:
 *  1. preparar → URL firmada para que el navegador suba directo a Storage
 *     (sin pasar el archivo por el servidor ni por el límite de Vercel).
 *  2. registrar → guarda los metadatos tras verificar la ruta.
 * En modo demo (preparar devuelve null) el archivo va por `subir…Demo`.
 */

type R<T = undefined> = { ok: true; datos?: T } | { ok: false; error: string };

const meta = z.object({
  tipo: z.string().min(2).max(40),
  nombre: z.string().min(1).max(200),
  mime: z.string().min(3).max(120),
  tamano: z.number().int().positive(),
});
const conRuta = meta.extend({ ruta: z.string().min(10).max(400) });

async function intentar<T>(fn: () => Promise<T>): Promise<R<T>> {
  try {
    return { ok: true, datos: await fn() };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Datos del archivo inválidos" };
    console.error(e);
    return { ok: false, error: "No se pudo subir el archivo. Intenta de nuevo." };
  }
}

async function repoOperaciones() {
  const repo = await contexto();
  if (!tieneRol(repo, "operaciones")) throw new ErrorNegocio("Tu rol no permite subir documentos");
  return repo;
}

/* ---------------- Documentos del DO ---------------- */

export async function prepararDocumento(operacionId: string, m: z.input<typeof meta>) {
  return intentar<SubidaFirmada | null>(async () => (await repoOperaciones()).prepararSubidaDO(operacionId, meta.parse(m)));
}

export async function registrarDocumento(operacionId: string, m: z.input<typeof conRuta>) {
  const r = await intentar(async () => (await repoOperaciones()).registrarDocumentoDO(operacionId, conRuta.parse(m)));
  revalidatePath(`/app/operaciones/${operacionId}`);
  return r;
}

export async function subirDocumentoDemo(operacionId: string, formData: FormData) {
  const r = await intentar(async () => {
    const repo = await repoOperaciones();
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File)) throw new ErrorNegocio("Selecciona un archivo");
    await repo.registrarDocumentoDO(operacionId, {
      tipo: String(formData.get("tipo") ?? "otro"),
      nombre: archivo.name,
      mime: archivo.type,
      tamano: archivo.size,
      bytes: new Uint8Array(await archivo.arrayBuffer()),
    });
  });
  revalidatePath(`/app/operaciones/${operacionId}`);
  return r;
}

/* ---------------- Soportes de la 170 (enlace público) ---------------- */

const token = z.string().min(8).max(128);

export async function prepararSoporte(t: string, m: z.input<typeof meta>) {
  return intentar<SubidaFirmada | null>(() => repositorioPublico().prepararSoporte170(token.parse(t), meta.parse(m)));
}

export async function registrarSoporte(t: string, m: z.input<typeof conRuta>) {
  const r = await intentar(() => repositorioPublico().registrarSoporte170(token.parse(t), conRuta.parse(m)));
  revalidatePath(`/c/${t}`);
  return r;
}

export async function subirSoporteDemo(t: string, formData: FormData) {
  const r = await intentar(async () => {
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File)) throw new ErrorNegocio("Selecciona un archivo");
    await repositorioPublico().registrarSoporte170(token.parse(t), {
      tipo: String(formData.get("tipo") ?? "otro"),
      nombre: archivo.name,
      mime: archivo.type,
      tamano: archivo.size,
      bytes: new Uint8Array(await archivo.arrayBuffer()),
    });
  });
  revalidatePath(`/c/${t}`);
  return r;
}
