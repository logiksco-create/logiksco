"use server";

import { z } from "@/lib/zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BLOQUES, INCOTERMS, TIPOS_SERVICIO, UNIDADES } from "@/domain/types";
import { modoDemo, env } from "@/lib/env";
import { COOKIE_USUARIO_DEMO, contexto, tieneRol } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import { reiniciarDemo } from "../datos/demo/repositorio-demo";
import { notificar } from "../notificaciones";
import { pdfCotizacion } from "../pdf/cotizacion";
import { fecha } from "@/lib/formato";
import { buzonCompleto } from "../buzon";
import { correo } from "../correo";
import { plantillaCorreo } from "../correo/plantilla";

/**
 * Server Actions de la aplicación autenticada. Cada acción:
 *  1. resuelve el contexto (usuario + empresa) — nunca confía en el cliente,
 *  2. valida la entrada con Zod,
 *  3. verifica el rol,
 *  4. delega en el repositorio (RLS aplica en Supabase).
 */

export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { datos: T }))
  | { ok: false; error: string };

async function ejecutar<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    const datos = await fn();
    return { ok: true, datos } as Resultado<T>;
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    }
    // Las redirecciones de Next se propagan.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
}

function exigirRol(ok: boolean) {
  if (!ok) throw new ErrorNegocio("Tu rol no permite esta acción");
}

/* ------------------------------------------------------------------ */
/* Modo demo                                                            */
/* ------------------------------------------------------------------ */

export async function cambiarUsuarioDemo(formData: FormData) {
  if (!modoDemo) return;
  const id = z.string().max(40).parse(formData.get("usuario"));
  (await cookies()).set(COOKIE_USUARIO_DEMO, id, { path: "/", sameSite: "lax", httpOnly: true });
  revalidatePath("/app", "layout");
}

export async function restablecerDemo() {
  if (!modoDemo) return;
  reiniciarDemo();
  revalidatePath("/app", "layout");
}

/* ------------------------------------------------------------------ */
/* Cotizaciones                                                         */
/* ------------------------------------------------------------------ */

const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const claves = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

const esquemaConcepto = z.object({
  bloque: z.enum(claves(BLOQUES)),
  descripcion: z.string().trim().min(1, "Cada concepto necesita descripción").max(200),
  proveedorId: z.string().optional(),
  proveedorNombre: z.string().optional(),
  moneda: z.enum(["COP", "USD"]),
  unidad: z.enum(claves(UNIDADES)),
  cantidad: z.number().positive("La cantidad debe ser mayor que cero"),
  costoUnitario: z.number().min(0, "El costo no puede ser negativo"),
  ventaUnitaria: z.number().min(0, "La venta no puede ser negativa"),
  vigenciaTarifa: fechaISO.optional(),
  paraTerceros: z.boolean().optional(),
  productoFinppi: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(30).optional()),
  ivaFinppi: z.enum(["Ninguno", "IVA-0", "IVA-5", "IVA-19"]).optional(),
});

const esquemaFacturacion = z.object({
  monedaFactura: z.enum(["COP", "USD"]),
  tipoPago: z.enum(["Contado", "Crédito"]),
  plazoDias: z.number().int().min(0).max(365),
  metodoPago: z.string().trim().min(2).max(80),
  tipoOperacion: z.string().trim().min(2).max(40),
});

const esquemaCotizacion = z.object({
  clienteId: z.string().min(1, "Selecciona un cliente"),
  contactoId: z.string().optional(),
  tipoServicio: z.enum(claves(TIPOS_SERVICIO)),
  incoterm: z.enum(INCOTERMS),
  origen: z.string().trim().min(2, "Indica el origen").max(120),
  destino: z.string().trim().min(2, "Indica el destino").max(120),
  mercancia: z.object({
    descripcion: z.string().trim().min(2, "Describe la mercancía").max(300),
    piezas: z.number().int().min(0),
    pesoKg: z.number().min(0),
    volumenM3: z.number().min(0),
    contenedores: z.array(z.object({ tipo: z.string(), cantidad: z.number().int().positive() })).optional(),
  }),
  conceptos: z.array(esquemaConcepto).min(1, "Agrega al menos un concepto").max(100),
  trm: z.number().positive("La TRM debe ser mayor que cero"),
  monedaPresentacion: z.enum(["COP", "USD"]),
  vigenteHasta: fechaISO,
  terminos: z.string().max(4000),
  facturacion: esquemaFacturacion.optional(),
});

export type EntradaCotizacion = z.input<typeof esquemaCotizacion>;

export async function guardarCotizacion(entrada: EntradaCotizacion, id?: string) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "comercial"));
    const datos = esquemaCotizacion.parse(entrada);
    const q = await repo.guardarCotizacion(datos, id);
    revalidatePath("/app/cotizaciones");
    return { id: q.id };
  });
}

export async function duplicarCotizacion(id: string, clienteId?: string) {
  const r = await ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "comercial"));
    const { cotizacion, advertencias } = await repo.duplicarCotizacion(id, clienteId || undefined);
    return { id: cotizacion.id, vencidas: advertencias.length };
  });
  if (!r.ok) return r;
  revalidatePath("/app/cotizaciones");
  redirect(`/app/cotizaciones/${r.datos.id}/editar?duplicada=1&vencidas=${r.datos.vencidas}`);
}

export async function enviarCotizacion(id: string) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "comercial"));
    const q = await repo.cotizacion(id);
    if (!q) throw new ErrorNegocio("La cotización no existe");
    const cliente = await repo.tercero(q.clienteId);
    const contacto = cliente?.contactos.find((c) => c.id === q.contactoId) ?? cliente?.contactos[0];
    if (!contacto?.correo) throw new ErrorNegocio("El cliente no tiene un contacto con correo");

    const token = await repo.emitirEnlace(id);
    const enlace = `${env.appUrl}/c/${token}`;
    await repo.cambiarEstadoCotizacion(id, "enviada", `Enviada a ${contacto.correo}`);
    const pdf = await pdfCotizacion({ q, empresa: repo.empresa, cliente: cliente!, enlace });
    const { enviado } = await notificar(repo, {
      entidad: "cotizacion",
      entidadId: id,
      para: [contacto.correo],
      asunto: `Cotización ${q.consecutivo} · ${q.mercancia.descripcion}`,
      titulo: `Tu cotización ${q.origen} – ${q.destino}`,
      parrafos: [
        `Hola ${contacto.nombre.split(" ")[0]},`,
        `Te compartimos la cotización ${q.consecutivo} para ${q.mercancia.descripcion}. Es válida hasta el ${fecha(q.vigenteHasta)}.`,
        "Puedes revisarla y aceptarla en línea desde el botón. También va adjunta en PDF.",
      ],
      boton: { texto: "Ver y aceptar cotización", url: enlace },
      adjuntos: [{ nombre: `${q.consecutivo}-v${q.version}.pdf`, contenido: pdf }],
      resumen: `Envío de cotización con PDF y enlace seguro de aceptación: ${enlace}`,
    });
    revalidatePath(`/app/cotizaciones/${id}`);
    return { enlace, enviado };
  });
}

export async function aceptarManual(id: string, evidencia: string) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "comercial"));
    const nota = z.string().trim().min(5, "Describe la evidencia (correo, fecha)").max(500).parse(evidencia);
    await repo.cambiarEstadoCotizacion(id, "aceptada", `Aceptación manual registrada: ${nota}`);
    revalidatePath(`/app/cotizaciones/${id}`);
  });
}

/* ------------------------------------------------------------------ */
/* Operaciones (DO)                                                     */
/* ------------------------------------------------------------------ */

export async function abrirDO(cotizacionId: string) {
  const r = await ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "comercial", "operaciones"));
    const op = await repo.abrirOperacion(cotizacionId);
    // RF-24: correo automático de bienvenida al cliente con su número de DO.
    const cliente = await repo.tercero(op.clienteId);
    const responsable = (await repo.usuarios()).find((u) => u.id === op.responsableId);
    await notificar(repo, {
      entidad: "operacion",
      entidadId: op.id,
      para: cliente?.contactos.map((c) => c.correo) ?? [],
      asunto: `Bienvenido a su operación ${op.consecutivo}`,
      titulo: `Tu operación ${op.consecutivo} está en marcha`,
      parrafos: [
        `Abrimos tu operación ${op.consecutivo} (${op.origen} – ${op.destino}).`,
        `${responsable ? `${responsable.nombre} es tu responsable operativo` : "Nuestro equipo de operaciones te acompañará"} y te avisará cada novedad por este medio.`,
        "Usa este número de operación en tus comunicaciones con nosotros.",
      ],
      resumen: "Correo automático de bienvenida con número de DO y responsable operativo.",
    });
    // RF-24: el responsable operativo recibe el traspaso (correo interno).
    if (responsable?.correo && responsable.id !== repo.usuario.id && correo().activo) {
      await correo()
        .enviar({
          para: [responsable.correo],
          asunto: `Nuevo DO asignado: ${op.consecutivo}`,
          nombreRemitente: "LOGIKS.CO",
          html: plantillaCorreo({
            empresa: repo.empresa.razonSocial,
            color: repo.empresa.colorPrimario,
            logoUrl: repo.empresa.logoUrl,
            titulo: `Te asignaron el DO ${op.consecutivo}`,
            parrafos: [
              `${repo.usuario.nombre} abrió el DO ${op.consecutivo} para ${cliente?.razonSocial ?? "el cliente"} (${op.origen} – ${op.destino}).`,
              "Revisa los hitos y las vigencias de las tarifas.",
            ],
            boton: { texto: "Abrir el DO", url: `${env.appUrl}/app/operaciones/${op.id}` },
          }),
        })
        .catch((e) => console.error("[correo] aviso al responsable:", e instanceof Error ? e.message : e));
    }
    return op.id;
  });
  if (!r.ok) return r;
  revalidatePath("/app", "layout");
  redirect(`/app/operaciones/${r.datos}`);
}

export async function actualizarHito(
  operacionId: string,
  hito: { id: string; estimada?: string; real?: string; nota?: string },
) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "operaciones"));
    const h = z
      .object({
        id: z.string(),
        estimada: fechaISO.optional().or(z.literal("").transform(() => undefined)),
        real: fechaISO.optional().or(z.literal("").transform(() => undefined)),
        nota: z.string().max(500).optional(),
      })
      .parse(hito);
    await repo.actualizarHito(operacionId, h);
    revalidatePath(`/app/operaciones/${operacionId}`);
  });
}

export async function notificarCliente(operacionId: string, asunto: string, mensaje: string) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "operaciones", "comercial"));
    const datos = z
      .object({ asunto: z.string().trim().min(3).max(200), mensaje: z.string().trim().min(5, "Escribe la novedad").max(5000) })
      .parse({ asunto, mensaje });
    const op = await repo.operacion(operacionId);
    if (!op) throw new ErrorNegocio("El DO no existe");
    const cliente = await repo.tercero(op.clienteId);
    await notificar(repo, {
      entidad: "operacion",
      entidadId: operacionId,
      para: cliente?.contactos.map((c) => c.correo) ?? [],
      asunto: datos.asunto,
      titulo: `Novedad de tu operación ${op.consecutivo}`,
      parrafos: [datos.mensaje],
      resumen: datos.mensaje,
    });
    revalidatePath(`/app/operaciones/${operacionId}`);
  });
}

/* ------------------------------------------------------------------ */
/* Cumplimiento                                                         */
/* ------------------------------------------------------------------ */

export async function revisarFormulario(
  id: string,
  decision: "aprobado" | "devuelto" | "rechazado",
  observaciones?: string,
) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "cumplimiento"));
    if (decision !== "aprobado" && !observaciones?.trim()) {
      throw new ErrorNegocio("Indica las observaciones para el cliente");
    }
    await repo.revisarFormulario170(id, decision, observaciones?.trim());
    // RF-17: el cliente recibe el resultado (y las observaciones si se devuelve).
    const f = (await repo.formularios170()).find((x) => x.id === id);
    const cliente = f && (await repo.tercero(f.terceroId));
    if (cliente) {
      const textos = {
        aprobado: ["Tu formulario de conocimiento del cliente (Circular 170) fue aprobado. Ya podemos operar tus cargas."],
        devuelto: ["Revisamos tu formulario de conocimiento del cliente (Circular 170) y necesitamos algunos ajustes:", (observaciones ?? "").trim(), "Tu comercial te enviará el enlace para corregirlo en línea."],
        rechazado: ["Tu formulario de conocimiento del cliente (Circular 170) no fue aprobado.", (observaciones ?? "").trim()],
      }[decision];
      await notificar(repo, {
        entidad: "tercero",
        entidadId: cliente.id,
        para: cliente.contactos.map((c) => c.correo),
        asunto: `Circular 170: formulario ${decision}`,
        titulo: `Formulario 170 ${decision}`,
        parrafos: textos,
        resumen: textos.join(" "),
      });
    }
    revalidatePath("/app", "layout");
  });
}

/* ------------------------------------------------------------------ */
/* Clientes                                                             */
/* ------------------------------------------------------------------ */

const esquemaTercero = z.object({
  tipo: z.enum(["cliente", "prospecto", "proveedor"]),
  nit: z.string().trim().regex(/^[0-9A-Za-z.\-]{5,20}$/, "NIT inválido"),
  razonSocial: z.string().trim().min(3, "Razón social requerida").max(200),
  ciudad: z.string().trim().max(80),
  contactoNombre: z.string().trim().max(120).optional(),
  contactoCargo: z.string().trim().max(120).optional(),
  contactoCorreo: z.email("Correo inválido").optional().or(z.literal("")),
});

export async function crearTercero(_: unknown, formData: FormData) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "comercial", "operaciones"));
    const d = esquemaTercero.parse(Object.fromEntries(formData));
    const t = await repo.crearTercero({
      tipo: d.tipo,
      nit: d.nit,
      razonSocial: d.razonSocial,
      ciudad: d.ciudad,
      contacto: d.contactoNombre
        ? { nombre: d.contactoNombre, cargo: d.contactoCargo ?? "", correo: d.contactoCorreo ?? "" }
        : undefined,
    });
    revalidatePath("/app/clientes");
    return { id: t.id };
  });
}

/* ------------------------------------------------------------------ */
/* Solicitudes a proveedores (RF-25)                                    */
/* ------------------------------------------------------------------ */

export async function solicitarAProveedor(
  operacionId: string,
  datos: { correo: string; asunto: string; mensaje: string },
) {
  return ejecutar(async () => {
    const repo = await contexto();
    exigirRol(tieneRol(repo, "operaciones", "comercial"));
    const d = z
      .object({
        correo: z.email("Correo del proveedor inválido"),
        asunto: z.string().trim().min(3, "Escribe el asunto").max(200),
        mensaje: z.string().trim().min(5, "Escribe el mensaje").max(5000),
      })
      .parse(datos);
    const op = await repo.operacion(operacionId);
    if (!op) throw new ErrorNegocio("El DO no existe");
    const { enviado } = await notificar(repo, {
      entidad: "operacion",
      entidadId: operacionId,
      para: [d.correo],
      asunto: d.asunto,
      titulo: d.asunto,
      parrafos: [d.mensaje, `Por favor responde a este correo o copia a ${buzonCompleto(op)} para que quede en el expediente.`],
      resumen: d.mensaje,
    });
    revalidatePath(`/app/operaciones/${operacionId}`);
    return { enviado };
  });
}
