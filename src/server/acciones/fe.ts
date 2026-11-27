"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { CIUDADES_FINPPI } from "@/domain/finppi-listas";
import { z } from "@/lib/zod";
import { contexto, tieneRol } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import {
  FINPPI,
  VERSION_CONSENTIMIENTO,
  bloqueosEmision,
  ajustarAFinppi,
  ciudadFinppi,
  fiscalSugerido,
  payloadEmision,
  referenciaFactura,
  vencimiento as calcularVencimiento,
} from "@/domain/einvoice";
import { hoyISO } from "@/domain/fechas";
import type { DatosFiscales } from "@/domain/types";
import { enviarFacturaAlCliente } from "../fe-envio";
import { despertarBot } from "../bot-github";
import { modoDemo } from "@/lib/env";

/**
 * Facturación electrónica con Finppi: datos fiscales, conexión de la cuenta
 * y emisión «con un clic» (el bot transcribe los valores aprobados).
 */

type R = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

async function intentar(fn: () => Promise<string | void>): Promise<R> {
  try {
    const mensaje = await fn();
    revalidatePath("/app", "layout");
    return { ok: true, mensaje: mensaje ?? "Guardado" };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error(e);
    return { ok: false, error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
}

const texto = (max: number, msj: string) => z.string().trim().min(1, msj).max(max);

const esquemaFiscal = z.object({
  tipoPersona: z.enum(FINPPI.tipoPersona),
  tipoDocumento: z.enum(FINPPI.tipoDocumento as unknown as [string, ...string[]], "Elige el tipo de documento"),
  numeroDocumento: z
    .string()
    .trim()
    .transform((v) => v.replace(/[.\s]/g, ""))
    .pipe(z.string().regex(/^[0-9A-Za-z]{3,20}$/, "Documento sin puntos, guiones ni dígito de verificación")),
  nombres: texto(200, "Escribe los nombres o la razón social"),
  apellidos: texto(200, "Escribe los apellidos (en empresas, repite la razón social)"),
  email: z
    .string()
    .trim()
    .min(3, "Escribe el correo de facturación")
    .max(300)
    .refine((v) => v.split(",").every((x) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(x.trim())), "Correo de facturación inválido"),
  celular: z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, "Celular inválido"),
  regimen: z.enum(FINPPI.regimen as unknown as [string, ...string[]]),
  responsabilidadFiscal: z.enum(FINPPI.responsabilidadFiscal as unknown as [string, ...string[]]),
  pais: texto(60, "Escribe el país"),
  ciudad: z
    .string()
    .trim()
    .transform((v) => ciudadFinppi(v) ?? v)
    .refine((v) => CIUDADES_FINPPI.includes(v), "Elige la ciudad de la lista de Finppi"),
  direccion: texto(200, "Escribe la dirección principal"),
  telefono: z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, "Teléfono inválido"),
});

/** Datos fiscales del cliente para Finppi (§9A.2). */
export async function guardarDatosFiscales(terceroId: string, _: unknown, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "comercial", "contabilidad", "cumplimiento")) throw new ErrorNegocio("Tu rol no permite editar clientes");
    const d = esquemaFiscal.parse(Object.fromEntries(formData)) as DatosFiscales;
    d.celular = d.celular.replace(/\s/g, "");
    d.telefono = d.telefono.replace(/\s/g, "");
    await repo.guardarDatosFiscales(z.string().min(1).parse(terceroId), d);
    return "Datos de facturación electrónica guardados";
  });
}

/* ------------------------------ Conexión ------------------------------ */

export async function conectarFinppi(_: unknown, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!repo.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador conecta Finppi");
    const d = z
      .object({
        usuario: z.email("Escribe el correo con el que entras a Finppi"),
        clave: z.string().min(4, "Escribe la contraseña de Finppi").max(200),
        acepto: z.literal("si", "Debes aceptar la autorización para conectar"),
      })
      .parse(Object.fromEntries(formData));
    await repo.guardarCredencialesFe(d.usuario, d.clave, VERSION_CONSENTIMIENTO);
    if (!modoDemo) await despertarBot("conexion");
    return "Credenciales guardadas y cifradas. El bot está probando la conexión…";
  });
}

export async function probarConexionFinppi(): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.probarConexionFe();
    if (!modoDemo) await despertarBot("conexion");
    return "Probando la conexión con Finppi…";
  });
}

/** El bot lee (solo lectura) los productos de Finppi y carga al catálogo los que falten. */
export async function traerProductosFinppi(): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "contabilidad")) throw new ErrorNegocio("Solo Contabilidad o el Administrador");
    await repo.sincronizarProductosFe();
    if (!modoDemo) {
      await despertarBot("productos");
      return "El bot está leyendo tus productos de Finppi; aparecerán aquí en un par de minutos.";
    }
    return "Productos de Finppi traídos al catálogo (simulación del demo)";
  });
}

export async function desconectarFinppi(): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.desconectarFe();
    return "Finppi desconectado. Las credenciales se borraron.";
  });
}

export async function guardarResolucion(_: unknown, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    await repo.guardarTextosFe({
      resolucion: z.string().trim().max(1000, "Máximo 1.000 caracteres").parse(formData.get("resolucion") ?? ""),
      condiciones: z.string().trim().max(1500, "Máximo 1.500 caracteres").parse(formData.get("condiciones") ?? ""),
    });
    return "Textos de la factura guardados";
  });
}

/* ------------------------------ Factura ------------------------------ */

async function repoContable() {
  const repo = await contexto();
  if (!tieneRol(repo, "contabilidad")) throw new ErrorNegocio("Solo Contabilidad gestiona facturas");
  return repo;
}

/** «4.012,37», «4012,37», «4012.37» o «4,012.37» → 4012.37 */
function leerNumero(t: string): number {
  const s = t.trim().replace(/\s|\$/g, "");
  if (s.includes(",") && s.includes(".")) {
    return s.lastIndexOf(",") > s.lastIndexOf(".") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  }
  if (s.includes(",")) return Number(s.replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}

/** Condiciones de la factura electrónica: TRM de referencia, pago y operación. */
export async function guardarCondicionesFe(facturaId: string, _: unknown, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await repoContable();
    const f = await repo.factura(facturaId);
    if (!f) throw new ErrorNegocio("La factura no existe");
    if (!["borrador", "aprobada", "fallida", "rechazada"].includes(f.estado)) {
      throw new ErrorNegocio("La factura ya está en proceso o emitida");
    }
    const d = z
      .object({
        trmReferencia: z.preprocess(
          (v) => (v === "" || v == null ? undefined : leerNumero(String(v))),
          z.number().min(1000, "TRM de referencia inválida").max(20000, "TRM de referencia inválida").optional(),
        ),
        tipoPago: z.enum(FINPPI.tipoPago),
        plazoDias: z.coerce.number().int().min(0).max(365),
        metodoPago: z.string().trim().min(2).max(80),
        tipoOperacion: z.enum(FINPPI.tipoOperacion as unknown as [string, ...string[]]),
      })
      .parse(Object.fromEntries(formData));
    if (f.moneda === "USD" && !d.trmReferencia) throw new ErrorNegocio("Escribe la TRM de referencia");
    await repo.actualizarFactura(facturaId, {
      trmReferencia: d.trmReferencia,
      tipoPago: d.tipoPago,
      metodoPago: d.metodoPago,
      tipoOperacion: d.tipoOperacion,
      vencimiento: calcularVencimiento(hoyISO(), d.tipoPago, d.plazoDias),
      ...(f.estado === "fallida" ? { estado: "borrador" as const } : {}),
    });
    return "Condiciones guardadas";
  });
}

/**
 * El «clic»: congela los valores aprobados y los envía a la cola del bot.
 * Con `dryRun` el bot llena Finppi y se detiene antes de «Enviar».
 */
export async function emitirFacturaElectronica(
  facturaId: string,
  opciones: { dryRun: boolean; enviarAlEmitir: boolean; crearCliente: boolean; confirmo: boolean },
): Promise<R> {
  return intentar(async () => {
    const repo = await repoContable();
    const o = z
      .object({ dryRun: z.boolean(), enviarAlEmitir: z.boolean(), crearCliente: z.boolean(), confirmo: z.boolean() })
      .parse(opciones);
    if (!o.dryRun && !o.confirmo) throw new ErrorNegocio("Confirma que verificarás la aceptación ante la DIAN");
    const f = await repo.factura(facturaId);
    if (!f) throw new ErrorNegocio("La factura no existe");
    const cliente = await repo.tercero(f.clienteId);
    if (!cliente) throw new ErrorNegocio("El cliente no existe");
    const hoy = hoyISO();
    const cuenta = await repo.cuentaFe();
    const opcionesFinppi = cuenta?.instantanea.opcionesCliente;
    // Valores al texto exacto de Finppi (tildes y mayúsculas de su lista).
    const fiscal = cliente.fiscal ? ajustarAFinppi(cliente.fiscal, opcionesFinppi) : undefined;
    const bloqueos = bloqueosEmision({
      opcionesFinppi,
      moneda: f.moneda,
      trmReferencia: f.trmReferencia,
      lineas: f.lineas,
      fiscal,
      metodoPago: f.metodoPago,
      tipoOperacion: f.tipoOperacion,
      tipoPago: f.tipoPago,
      fecha: hoy,
      hoy,
      vencimiento: f.vencimiento,
    });
    if (bloqueos.length) throw new ErrorNegocio(bloqueos[0]);
    const venc = f.vencimiento && f.vencimiento >= hoy ? f.vencimiento : hoy;
    const modo = cuenta?.modoEmision === "real" ? "real" : "borrador";
    const payload = payloadEmision({
      referencia: f.referencia ?? referenciaFactura((n) => randomInt(n)),
      nitEmisor: repo.empresa.nit,
      fecha: hoy,
      vencimiento: f.tipoPago === "Contado" ? hoy : venc,
      tipoPago: f.tipoPago!,
      tipoOperacion: f.tipoOperacion!,
      metodoPago: f.metodoPago!,
      cliente: fiscalSugerido({ ...cliente, fiscal }),
      crearCliente: o.crearCliente,
      lineas: f.lineas,
      moneda: f.moneda,
      trmReferencia: f.trmReferencia ?? 1,
    });
    payload.modo = modo;
    // Productos creados en LOGIKS que aún no están en Finppi: el bot los crea primero.
    const catalogo = await repo.catalogo("producto_finppi");
    const usados = new Set(f.lineas.map((l) => l.productoFinppi));
    payload.productosNuevos = catalogo
      .filter((e) => e.codigo && usados.has(e.codigo) && e.datos.enFinppi === false)
      .map((e) => ({ codigo: e.codigo!, nombre: e.nombre, iva: e.datos.iva ?? "IVA-19" }));
    await repo.encolarEmision(facturaId, { payload, dryRun: o.dryRun, enviarAlEmitir: o.enviarAlEmitir });
    if (!modoDemo) await despertarBot(o.dryRun ? "prueba" : modo === "borrador" ? "guardar" : "emitir");

    // En el demo la emisión simulada termina al instante.
    const despues = await repo.factura(facturaId);
    if (despues?.estado === "emitida" && despues.simulada && !despues.cufe) {
      return `Guardada en Finppi como borrador ${despues.numeroEsperado ?? ""} (modo prueba: no fue a la DIAN)`;
    }
    if (despues?.estado === "emitida" && despues.simulada && o.enviarAlEmitir) {
      await enviarFacturaAlCliente(repo, despues);
      return `Emitida ${despues.numero} (simulación) y enviada al cliente`;
    }
    if (o.dryRun) return "Prueba enviada al bot: llenará Finppi y se detendrá antes de emitir.";
    if (modo === "borrador") return "Enviada al bot en modo prueba: llenará Finppi y pulsará «Guardar» (no va a la DIAN).";
    return despues?.estado === "emitida" ? `Emitida ${despues.numero}` : "Enviada al bot. La verás emitida en unos segundos.";
  });
}

export async function enviarFacturaCliente(facturaId: string): Promise<R> {
  return intentar(async () => {
    const repo = await repoContable();
    const f = await repo.factura(facturaId);
    if (!f || f.estado !== "emitida") throw new ErrorNegocio("Solo se envían facturas emitidas");
    const r = await enviarFacturaAlCliente(repo, f);
    return r.enviado ? `Enviada a ${r.para.join(", ")}` : `Registrada para ${r.para.join(", ")} (el correo aún no está configurado)`;
  });
}

const presentacion = z.enum(["usd", "ambas", "cop"], "Elige cómo se muestra la factura");

/** Monedas que ve el cliente en el PDF de esta factura (no cambia lo que va a la DIAN). */
export async function cambiarPresentacionFactura(facturaId: string, valor: string): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "contabilidad", "comercial")) throw new ErrorNegocio("Tu rol no permite cambiar la factura");
    await repo.actualizarFactura(z.string().min(1).parse(facturaId), { presentacion: presentacion.parse(valor) });
    return "Presentación actualizada";
  });
}

/** Valor por defecto de la empresa para las facturas en USD. */
export async function cambiarPresentacionEmpresa(valor: string): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!tieneRol(repo, "contabilidad")) throw new ErrorNegocio("Solo Contabilidad o el Administrador cambian esto");
    await repo.guardarPresentacionFe(presentacion.parse(valor));
    return "Guardado para las próximas facturas";
  });
}

export async function cambiarModoEmision(valor: string): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    if (!repo.usuario.roles.includes("admin")) throw new ErrorNegocio("Solo el Administrador cambia el modo de emisión");
    const m = z.enum(["borrador", "real"]).parse(valor);
    await repo.guardarModoEmisionFe(m);
    return m === "real" ? "Modo real: las facturas irán a la DIAN" : "Modo prueba: el bot solo guardará borradores en Finppi";
  });
}

/** Una factura de prueba vuelve a prefactura para emitirla de verdad. */
export async function descartarPrueba(facturaId: string): Promise<R> {
  return intentar(async () => {
    const repo = await repoContable();
    await repo.descartarPruebaFe(z.string().min(1).parse(facturaId));
    return "La prueba se descartó: la factura volvió a prefactura";
  });
}

/** Detiene un envío que sigue en cola (el bot aún no lo tomó) para corregir y reenviar. */
export async function detenerEnvio(facturaId: string): Promise<R> {
  return intentar(async () => {
    const repo = await repoContable();
    await repo.detenerEnvioFe(z.string().min(1).parse(facturaId));
    return "Envío detenido: la factura volvió a prefactura. Corrige lo que necesites y vuelve a enviarla.";
  });
}

/** Modo prueba: la factura cuyo «Guardar» no se confirmó vuelve a prefactura. */
export async function reabrirPrueba(facturaId: string): Promise<R> {
  return intentar(async () => {
    const repo = await repoContable();
    await repo.reabrirPruebaFe(z.string().min(1).parse(facturaId));
    return "La factura volvió a prefactura. Revisa en Finppi si quedó un borrador y bórralo allá antes de reintentar.";
  });
}
