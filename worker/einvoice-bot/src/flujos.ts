import { createHash, createHmac } from "node:crypto";
import type { Page } from "playwright";
import { config } from "./config.ts";
import * as db from "./db.ts";
import type { Job } from "./db.ts";
import { ErrorBot, desenlace, enmascarar, esperaReintento, mismoNit } from "./logica.ts";
import { contextoLimpio } from "./navegador.ts";
import { validarPdf } from "./pdf.ts";
import * as finppi from "./adapters/finppi/finppi.ts";
import { ADAPTER_VERSION } from "./adapters/finppi/selectors.ts";
import {
  partirConsecutivo,
  totalesCoinciden,
  verificarConsecutivo,
  type PayloadEmision,
} from "../../../src/domain/einvoice.ts";

/** Abre un contexto limpio, inicia sesión y garantiza el cierre. */
async function conSesion<T>(job: Job, fn: (page: Page, secretos: string[]) => Promise<T>): Promise<T> {
  const cred = await db.credenciales(job.empresa_id);
  if (!cred) throw new ErrorBot("INVALID_CREDENTIALS", "La empresa no tiene credenciales de Finppi");
  const secretos = [cred.clave, cred.usuario];
  const ctx = await contextoLimpio();
  const page = await ctx.newPage();
  // Salir del formulario sin guardar: se acepta «salir de la página»; todo lo demás se cancela.
  page.on("dialog", (d) => void (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  try {
    await db.log(job, "login", "Conectando con Finppi…");
    await finppi.iniciarSesion(page, cred.usuario, cred.clave);
    await db.actualizarCuenta(job.empresa_id, { ultimo_login_ok: new Date().toISOString() });
    return await fn(page, secretos);
  } catch (e) {
    if (e instanceof ErrorBot && ["SELECTOR_NOT_FOUND", "PLATFORM_VALIDATION_ERROR", "VALUES_MISMATCH"].includes(e.codigo)) {
      await guardarDiagnostico(job, page, secretos).catch((x) => console.error("[diagnóstico]", x instanceof Error ? x.message : x));
    }
    throw e;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/**
 * Cuando algo no se encuentra en Finppi, guarda la ESTRUCTURA de la página
 * (etiquetas, desplegables, nombres de campos y botones) y una captura, para
 * corregir selectors.ts sin adivinar. Nunca guarda valores de contraseñas.
 */
export const SCRIPT_DIAGNOSTICO = `(() => {
  var t = function (el, n) { return ((el && el.textContent) || "").replace(/\\s+/g, " ").trim().slice(0, n || 120); };
  var html = function (el, n) { return ((el && el.outerHTML) || "").replace(/value="[^"]*"/g, 'value="…"').replace(/\\s+/g, " ").slice(0, n || 700); };
  var arr = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  return {
    url: location.pathname,
    titulo: t(document.querySelector("h1, h2, h3, h4")),
    etiquetas: arr("label").map(function (l) { return t(l, 60); }).filter(Boolean).slice(0, 80),
    campos: arr("input, textarea, select").map(function (i) {
      return i.tagName.toLowerCase() + "[name=" + (i.getAttribute("name") || "") + "][id=" + i.id + "][type=" + (i.getAttribute("type") || "") + "][placeholder=" + (i.getAttribute("placeholder") || "") + "]";
    }).slice(0, 120),
    botones: arr("button").map(function (b) { return t(b, 40) + " [type=" + (b.getAttribute("type") || "") + "][id=" + b.id + "]"; }).slice(0, 60),
    desplegables: arr('[class*="-control"], [class*="select__control"], [class*="Select"]').slice(0, 25).map(function (c) {
      var p2 = c.parentElement && c.parentElement.parentElement;
      return { clase: (c.getAttribute("class") || "").slice(0, 100), texto: t(c, 60), contexto: t(p2 && p2.parentElement, 160), html: html(p2, 700) };
    })
  };
})()`;

async function guardarDiagnostico(job: Job, page: Page, secretos: string[]) {
  let captura: string | null = null;
  try {
    const png = await page.screenshot({ fullPage: true, type: "png" });
    captura = `${job.empresa_id}/fe/diagnostico/${job.id}.png`;
    await db.subirArchivo(captura, new Uint8Array(png), "image/png");
  } catch {
    captura = null;
  }
  // Script en texto plano: tsx/esbuild inyecta «__name» en las funciones y
  // ese ayudante no existe dentro del navegador.
  const estructura = await page.evaluate(SCRIPT_DIAGNOSTICO).catch((e: Error) => ({ error: e.message }));
  const limpio = JSON.parse(enmascarar(JSON.stringify(estructura), secretos));
  await db.actualizarJob(job.id, { resultado: { diagnostico: limpio, captura } });
  await db.log(job, "diagnostico", "Se guardó la estructura de la página de Finppi para corregir el selector", "aviso");
}

async function verificarEmpresa(job: Job, page: Page) {
  const emp = await db.empresa(job.empresa_id);
  const cabecera = await finppi.textoCabecera(page);
  if (!mismoNit(cabecera, emp.nit)) {
    await db.actualizarCuenta(job.empresa_id, { estado: "empresa_distinta" });
    const visto = cabecera.match(/NIT\D{0,6}([\d.\-\s]{6,20})/i)?.[1]?.trim();
    throw new ErrorBot(
      "WRONG_COMPANY",
      `La cuenta de Finppi no corresponde al NIT de la empresa en LOGIKS (${emp.nit})${visto ? `: Finppi muestra NIT ${visto}` : ""}`,
    );
  }
  await db.log(job, "empresa", `Empresa verificada: ${emp.razon_social}`);
  return emp;
}

/* =============================== Healthcheck =============================== */

export async function healthcheck(job: Job) {
  try {
    await healthcheckInterno(job);
  } catch (e) {
    // La tarjeta de conexión debe reflejar el problema (no quedarse «Verificando»).
    if (e instanceof ErrorBot) {
      const estado =
        e.codigo === "INVALID_CREDENTIALS" ? "credenciales_invalidas"
        : e.codigo === "ACCOUNT_LOCKED_OR_CHALLENGE" ? "bloqueada"
        : e.codigo === "WRONG_COMPANY" ? "empresa_distinta"
        : null;
      if (estado) await db.actualizarCuenta(job.empresa_id, { estado });
      await db.log(job, "error", e.message, "error");
    }
    throw e;
  }
}

async function healthcheckInterno(job: Job) {
  await conSesion(job, async (page) => {
    await finppi.irAFacturas(page);
    await finppi.abrirFormularioFactura(page);
    const emp = await verificarEmpresa(job, page);
    const proxima = await finppi.leerNumeroOfrecido(page);
    await db.log(job, "consecutivo", `Tu próxima factura será la ${proxima}`);
    // Se sale SIN guardar y se vuelve a modo factura por el menú.
    await finppi.irAFacturas(page);
    const conteos = await finppi.contarClientesYProductos(page).catch(() => ({ clientes: undefined, productos: undefined }));
    await db.actualizarCuenta(job.empresa_id, {
      estado: "activa",
      instantanea: {
        razonSocial: emp.razon_social,
        nit: emp.nit.replace(/[^0-9]/g, "").slice(0, 9),
        proximaFactura: proxima,
        leidoEl: new Date().toISOString(),
        ...conteos,
      },
    });
    // Vigilancia (§5A.4): ¿se emitió algo fuera de LOGIKS?
    const serie = partirConsecutivo(proxima);
    if (serie) {
      const ultimo = await db.ultimoConsecutivo(job.empresa_id, serie.prefijo);
      const v = verificarConsecutivo(proxima, ultimo);
      if (!v.ok) await db.log(job, "consecutivo", `${v.mensaje} ¿Se emitió algo directamente en Finppi?`, "aviso");
    }
  });
}

/* =========================== Productos (lectura) =========================== */

export async function sincronizarProductos(job: Job) {
  await conSesion(job, async (page) => {
    await db.log(job, "productos", "Leyendo el listado de productos y servicios de Finppi…");
    const productos = await finppi.leerProductos(page);
    if (!productos.length) throw new ErrorBot("SELECTOR_NOT_FOUND", "No se pudo leer ningún producto del listado de Finppi");
    const r = await db.cargarProductosFinppi(job.empresa_id, productos);
    await db.log(
      job,
      "productos",
      `${productos.length} productos leídos en Finppi: ${r.nuevos} nuevos en el catálogo de LOGIKS, ${r.existentes} ya estaban${r.omitidos ? `, ${r.omitidos} omitidos por nombre repetido` : ""}.`,
    );
    await db.actualizarJob(job.id, { resultado: { leidos: productos.length, ...r } });
  });
}

/* ================================= Emitir ================================= */

export async function emitir(job: Job) {
  if (!job.factura_id) throw new Error("Trabajo de emisión sin factura");
  const p = job.payload as unknown as PayloadEmision;
  // «borrador» (modo prueba) pulsa «Guardar»; «real» pulsa «Enviar» y además
  // exige FE_PERMITIR_EMISION=si en el servidor del bot.
  const modo = p.modo === "real" ? "real" : "borrador";
  const pruebaPorSeguridad = !job.dry_run && modo === "real" && !config.permitirEmision;
  const dryRun = job.dry_run || pruebaPorSeguridad;
  let despuesDeEnviar = false;

  if (!dryRun) await db.actualizarFactura(job.factura_id, { estado: "enviando", error: null, error_codigo: null });

  try {
    await conSesion(job, async (page) => {
      await finppi.irAFacturas(page);
      await finppi.abrirFormularioFactura(page);
      const emp = await verificarEmpresa(job, page);
      if (p.nitEmisor && !mismoNit(emp.nit, p.nitEmisor)) throw new ErrorBot("WRONG_COMPANY", "La factura es de otra empresa");

      // Cero saltos (§5A.2): el ofrecido debe ser el siguiente del libro.
      const ofrecido = await finppi.leerNumeroOfrecido(page);
      const serie = partirConsecutivo(ofrecido);
      const ultimo = serie ? await db.ultimoConsecutivo(job.empresa_id, serie.prefijo) : null;
      const v = verificarConsecutivo(ofrecido, ultimo);
      if (!v.ok && modo === "real") throw new ErrorBot("CONSECUTIVE_GAP", v.mensaje);
      if (!v.ok) await db.log(job, "consecutivo", `${v.mensaje} (modo prueba: se continúa)`, "aviso");
      else await db.log(job, "consecutivo", `Finppi ofrece ${ofrecido}: es el siguiente esperado`);
      await finppi.elegirNumero(page, ofrecido);

      const cliente = await finppi.elegirCliente(page, p.cliente, p.crearCliente);
      await db.log(job, "cliente", `${cliente === "creado" ? "Cliente creado en Finppi" : "Cliente encontrado"}: ${p.cliente.nombres}`);

      await finppi.llenarFactura(page, p);
      await db.log(job, "items", `${p.items.length} ítems cargados en COP${p.original.moneda === "USD" ? ` (TRM ${p.original.trmReferencia})` : ""}`);

      // Verificación de totales (§5.4): tolerancia $1; NaN = fallo.
      const t = await finppi.leerTotales(page);
      const comparar: [string, number, number | undefined][] = [
        ["Subtotal", p.totales.subtotal, t["Subtotal"]],
        ["IVA", p.totales.iva, t["IVA (+)"]],
        ["Total", p.totales.total, t["Total"]],
      ];
      for (const [nombre, aprobado, leido] of comparar) {
        if (leido === undefined) continue;
        if (!totalesCoinciden(aprobado, leido)) {
          throw new ErrorBot("VALUES_MISMATCH", `${nombre} en Finppi (${leido}) no coincide con el aprobado (${aprobado})`);
        }
      }
      await db.log(job, "totales", `Totales de Finppi = aprobados (${p.totales.total.toLocaleString("es-CO")} COP)`);

      if (dryRun) {
        // El dry run no toca «Enviar» y el número ofrecido debe seguir igual.
        const despues = await finppi.leerNumeroOfrecido(page).catch(() => ofrecido);
        if (despues !== ofrecido) await db.log(job, "dry_run", `¡Atención! El consecutivo cambió durante la prueba (${ofrecido} → ${despues})`, "aviso");
        await db.log(
          job,
          "dry_run",
          pruebaPorSeguridad
            ? "Emisión real deshabilitada en este bot (FE_PERMITIR_EMISION). Se detuvo antes de «Enviar»: nada se emitió."
            : "Prueba sin emitir: se detuvo antes de «Enviar». Nada se emitió.",
          pruebaPorSeguridad ? "aviso" : "info",
        );
        await finppi.irAFacturas(page);
        await db.actualizarJob(job.id, { resultado: { numeroOfrecido: ofrecido, totales: t, pruebaPorSeguridad } });
        if (pruebaPorSeguridad) {
          await db.actualizarFactura(job.factura_id!, {
            estado: "fallida",
            error_codigo: "EMISION_DESHABILITADA",
            error: "El bot está en modo prueba: llenó Finppi y se detuvo antes de emitir. Actívalo cuando termine la Fase 0.",
          });
        }
        return;
      }

      if (modo === "borrador") {
        await guardarComoBorrador(job, page, p, ofrecido, () => {
          despuesDeEnviar = true;
        });
        return;
      }

      // Punto de no retorno: se marca en BD y se espera la escritura ANTES del clic.
      await db.actualizarFactura(job.factura_id!, { numero_esperado: ofrecido });
      await finppi.enviar(page, { numero: ofrecido, total: p.totales.total }, async () => {
        await db.actualizarJob(job.id, { punto_no_retorno: true, adapter_version: ADAPTER_VERSION });
        if (serie) await db.registrarConsecutivo({ empresa_id: job.empresa_id, numero: ofrecido, prefijo: serie.prefijo, seq: serie.seq, estado: "en_vuelo", factura_id: job.factura_id! });
        despuesDeEnviar = true;
        await db.log(job, "enviar", "Punto de no retorno: «Enviar»");
      });

      const fila = await finppi.esperarAceptada(page, ofrecido);
      if (fila.numero !== ofrecido) throw new ErrorBot("VALUES_MISMATCH", `Finppi asignó ${fila.numero} en vez de ${ofrecido}`);
      await db.log(job, "resultado", `${ofrecido} aceptada por la DIAN`);
      await completarDescarga(job, page, fila, ofrecido, emp.nit);
    });
  } catch (e) {
    await manejarError(job, e, despuesDeEnviar);
  }
}

/**
 * MODO PRUEBA: mismo proceso que la emisión, pero se pulsa «Guardar». El
 * documento queda como borrador en Finppi (sin DIAN, sin CUFE) y en LOGIKS
 * como factura de prueba. Además responde una pregunta de la Fase 0: ¿un
 * borrador consume consecutivo?
 */
async function guardarComoBorrador(job: Job, page: Page, p: PayloadEmision, ofrecido: string, marcar: () => void) {
  await db.actualizarFactura(job.factura_id!, { numero_esperado: ofrecido });
  await db.actualizarJob(job.id, { punto_no_retorno: true, adapter_version: ADAPTER_VERSION });
  await db.log(job, "guardar", "Modo prueba: se pulsa «Guardar» (borrador). No va a la DIAN.");
  marcar();
  await finppi.guardarBorrador(page);

  const fila = await finppi.esperarBorrador(page, [ofrecido, p.referencia]);
  await db.log(job, "resultado", `Guardada en Finppi como borrador ${fila.numero || ""}${fila.porRecencia ? " (identificado como el borrador más reciente)" : ""}`, fila.porRecencia ? "aviso" : "info");

  let pdfRuta: string | null = null;
  let sha: string | null = null;
  try {
    const pdf = await finppi.descargar(page, fila.fila, "pdf");
    pdfRuta = `${job.empresa_id}/fe/${job.factura_id}/borrador.pdf`;
    await db.subirArchivo(pdfRuta, pdf, "application/pdf");
    sha = createHash("sha256").update(pdf).digest("hex");
    await db.log(job, "archivos", "PDF del borrador guardado");
  } catch {
    await db.log(job, "archivos", "Finppi no ofrece PDF para el borrador", "aviso");
  }

  // ¿Guardar consumió el consecutivo? (pregunta abierta de la Fase 0)
  let despues: string | null = null;
  try {
    await finppi.irAFacturas(page);
    await finppi.abrirFormularioFactura(page);
    despues = await finppi.leerNumeroOfrecido(page);
    await finppi.irAFacturas(page);
    await db.log(
      job,
      "consecutivo",
      despues === ofrecido
        ? `El borrador NO consumió consecutivo: Finppi sigue ofreciendo ${ofrecido}`
        : `El borrador SÍ consumió consecutivo: antes ${ofrecido}, ahora ${despues}`,
      despues === ofrecido ? "info" : "aviso",
    );
  } catch {
    await db.log(job, "consecutivo", "No se pudo releer el consecutivo después de guardar", "aviso");
  }

  await db.actualizarFactura(job.factura_id!, {
    estado: "emitida",
    simulada: true,
    numero_esperado: fila.numero || ofrecido,
    fecha_validacion: new Date().toISOString(),
    pdf_finppi_path: pdfRuta,
    pdf_finppi_sha256: sha,
    error: null,
    error_codigo: null,
  });
  await db.actualizarJob(job.id, { resultado: { borrador: true, numero: fila.numero || ofrecido, numeroDespues: despues } });
  await avisarLogiks(job.factura_id!);
}

/** Descarga PDF/XML originales, valida y deja la factura emitida. */
async function completarDescarga(job: Job, page: Page, fila: finppi.FilaListado, numero: string, nit: string) {
  const pdf = await finppi.descargar(page, fila.fila, "pdf");
  const { cufe, sha256 } = await validarPdf(pdf, { numero, nit: nit.replace(/[^0-9]/g, "").slice(0, 9) });
  const base = `${job.empresa_id}/fe/${job.factura_id}`;
  await db.subirArchivo(`${base}/original.pdf`, pdf, "application/pdf");
  let xmlRuta: string | null = null;
  try {
    const xml = await finppi.descargar(page, fila.fila, "xml");
    await db.subirArchivo(`${base}/original.xml`, xml, "application/xml");
    xmlRuta = `${base}/original.xml`;
  } catch {
    await db.log(job, "descarga", "No se pudo descargar el XML (el PDF sí quedó)", "aviso");
  }
  await db.actualizarFactura(job.factura_id!, {
    estado: "emitida",
    numero,
    cufe,
    fecha_validacion: new Date().toISOString(),
    pdf_finppi_path: `${base}/original.pdf`,
    pdf_finppi_sha256: sha256,
    xml_path: xmlRuta,
    error: null,
    error_codigo: null,
  });
  const serie = partirConsecutivo(numero);
  if (serie) await db.registrarConsecutivo({ empresa_id: job.empresa_id, numero, prefijo: serie.prefijo, seq: serie.seq, estado: "emitido", factura_id: job.factura_id!, cufe });
  await db.actualizarJob(job.id, { resultado: { numero, cufe } });
  await db.log(job, "archivos", `PDF original guardado (SHA-256 ${sha256.slice(0, 12)}…)`);
  await avisarLogiks(job.factura_id!);
}

/* =============================== Reconciliar =============================== */

/** Busca por número esperado o referencia. Nunca emite (§5.3). */
export async function reconciliar(job: Job) {
  const f = await db.factura(job.factura_id!);
  const buscar = f.numero_esperado ?? f.referencia;
  if (!buscar) {
    await db.actualizarFactura(f.id, { estado: "revision", error: "Sin número ni referencia para buscar en Finppi" });
    return;
  }
  try {
    await conSesion(job, async (page) => {
      const emp = await db.empresa(job.empresa_id);
      const fila = await finppi.buscarEnListado(page, buscar);
      if (fila && fila.estado === "Aceptada") {
        await db.log(job, "reconciliar", `Encontrada ${fila.numero} aceptada en Finppi`);
        await completarDescarga(job, page, fila, fila.numero, emp.nit);
        return;
      }
      await db.log(job, "reconciliar", `No aparece ${buscar} aceptada en Finppi`, "aviso");
      await db.actualizarFactura(f.id, {
        estado: "revision",
        error: `No se encontró ${buscar} aceptada en Finppi. Revisa en Finppi antes de volver a emitir.`,
      });
      await avisarLogiks(f.id);
    });
  } catch (e) {
    // Si no se pudo buscar, se reintenta luego. Nunca se emite.
    await db.log(job, "reconciliar", e instanceof Error ? e.message : "Error al buscar", "aviso");
    if (job.intentos < 6) {
      await db.actualizarJob(job.id, { estado: "en_cola", disponible_el: new Date(Date.now() + 10 * 60_000).toISOString() });
      throw new ReintentoProgramado();
    }
    await db.actualizarFactura(f.id, { estado: "revision", error: "No se pudo verificar la factura en Finppi" });
  }
}

export class ReintentoProgramado extends Error {}

/* ================================ Errores ================================ */

async function manejarError(job: Job, e: unknown, despuesDeEnviar: boolean) {
  if (process.env.DEPURAR_BOT && !(e instanceof ErrorBot)) console.error("[bot] error inesperado", e);
  const err = e instanceof ErrorBot ? e : new ErrorBot("TIMEOUT", e instanceof Error ? e.message : "Error desconocido");
  await db.log(job, "error", `${err.codigo}: ${err.message}`, "error");
  const d = desenlace(err.codigo, despuesDeEnviar);
  if (err.codigo === "INVALID_CREDENTIALS" || err.codigo === "ACCOUNT_LOCKED_OR_CHALLENGE") {
    await db.actualizarCuenta(job.empresa_id, { estado: err.codigo === "INVALID_CREDENTIALS" ? "credenciales_invalidas" : "bloqueada" });
  }
  if (!job.factura_id) throw err;
  if (job.dry_run) throw err; // la prueba no cambia la factura

  if (d.job === "fallido" && d.reintentar) {
    const espera = esperaReintento(job.intentos);
    if (espera !== null) {
      await db.actualizarFactura(job.factura_id, { estado: "en_cola", error: null });
      await db.actualizarJob(job.id, { estado: "en_cola", disponible_el: new Date(Date.now() + espera).toISOString(), error_codigo: err.codigo, error: err.message });
      throw new ReintentoProgramado();
    }
  }
  await db.actualizarFactura(job.factura_id, { estado: d.factura, error_codigo: err.codigo, error: err.message });
  if (d.job === "desconocido") {
    await db.db.from("fe_jobs").insert({ empresa_id: job.empresa_id, factura_id: job.factura_id, tipo: "reconciliar", prioridad: 2, disponible_el: new Date(Date.now() + 60_000).toISOString() });
  }
  await avisarLogiks(job.factura_id).catch(() => undefined);
  throw Object.assign(err, { estadoJob: d.job });
}

/* =========================== Aviso a LOGIKS =========================== */

export async function avisarLogiks(facturaId: string) {
  if (!config.secretoAvisos) return;
  const cuerpo = JSON.stringify({ facturaId });
  const firma = createHmac("sha256", config.secretoAvisos).update(cuerpo).digest("hex");
  await fetch(`${config.logiksUrl}/api/fe/notificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-logiks-firma": firma },
    body: cuerpo,
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => console.error("[aviso LOGIKS]", e instanceof Error ? e.message : e));
}
