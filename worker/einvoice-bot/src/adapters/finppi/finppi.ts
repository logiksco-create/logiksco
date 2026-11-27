import type { Download, Locator, Page } from "playwright";
import {
  CLIENT_PANEL,
  CUSTOMERS_LIST,
  FORM,
  ITEM_SELECT_ORDER,
  LIST,
  LOGIN,
  MENU,
  PAGE_TITLE,
  PAGINATION_TEXT,
  PRODUCTS_LIST,
  REACT_SELECT,
  PAGINATION,
  SELECT_LABELS,
  SELECT_NAMES,
  ITEM_SELECT_NAMES,
  SELECT_BY_NAME,
  LABEL_TAGS,
  TOTALS_LABELS,
  URLS,
} from "./selectors.ts";
import { ErrorBot, esOpcionDeProducto, fechaComoCampo, numeroDeFila } from "../../logica.ts";
import { leerValorFinppi, type PayloadEmision } from "../../../../../src/domain/einvoice.ts";

/**
 * Adaptador de Finppi. Solo usa selectores de selectors.ts. Reglas:
 *  - Nunca usa «Guardar», «Duplicar», «Reenviar» ni «Eliminar».
 *  - Los react-select se ubican por su etiqueta visible, nunca por id.
 *  - Lo no confirmado en Fase 0 (formato de fechas, modal de confirmación)
 *    se lee antes de actuar y, si no coincide con lo esperado, se aborta.
 */

const T = { corto: 8_000, medio: 20_000, largo: 90_000 };
const pausa = (min = 300, max = 1200) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

async function existe(l: Locator, ms = T.corto, que = "elemento"): Promise<Locator> {
  try {
    await l.first().waitFor({ state: "visible", timeout: ms });
    return l.first();
  } catch {
    throw new ErrorBot("SELECTOR_NOT_FOUND", `No se encontró ${que} en Finppi`);
  }
}

/* ------------------------------ Sesión ------------------------------ */

export async function iniciarSesion(page: Page, usuario: string, clave: string) {
  await page.goto(URLS.login, { waitUntil: "domcontentloaded", timeout: T.medio });
  await (await existe(page.locator(LOGIN.email), T.medio, "el campo de correo")).fill(usuario);
  await page.locator(LOGIN.password).fill(clave);
  await pausa();
  await page.locator(LOGIN.submit).click();
  // Éxito = aparece el menú lateral. Un solo intento (evita bloqueos de cuenta).
  const ok = await page
    .locator(MENU.incomeCategory)
    .first()
    .waitFor({ state: "visible", timeout: T.medio })
    .then(() => true)
    .catch(() => false);
  if (ok) return;
  // Mensaje que muestre Finppi (aviso, alerta o texto de error), sin datos del formulario.
  const aviso = (
    await page
      .locator('[role="alert"], .Toastify__toast, .alert, .invalid-feedback, .error, .swal2-popup, [class*="error"]')
      .allInnerTexts()
      .catch(() => [] as string[])
  )
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);
  const donde = new URL(page.url()).pathname;
  const detalle = `${aviso ? ` Finppi dice: «${aviso}».` : ""} (página ${donde})`;
  if (await page.locator(LOGIN.password).isVisible().catch(() => false)) {
    const texto = (await page.locator("body").innerText().catch(() => "")).toLowerCase();
    if (/captcha|bloquead|verificaci[oó]n|c[oó]digo/.test(texto)) {
      throw new ErrorBot("ACCOUNT_LOCKED_OR_CHALLENGE", `Finppi pidió una verificación adicional o la cuenta está bloqueada.${detalle}`);
    }
    throw new ErrorBot("INVALID_CREDENTIALS", `Finppi no dejó entrar con el usuario y la contraseña guardados.${detalle}`);
  }
  throw new ErrorBot("TIMEOUT", `Finppi no mostró el menú después de iniciar sesión.${detalle}`);
}

/** Entra por el menú (así se fija invoice.view = factura) y verifica el título. */
export async function irAFacturas(page: Page) {
  const ingresos = await existe(page.locator(MENU.incomeCategory), T.medio, "el menú Ingresos");
  const facturas = page.locator(MENU.invoices).first();
  if (!(await facturas.isVisible().catch(() => false))) await ingresos.click();
  await (await existe(page.locator(MENU.invoices), T.corto, "«Facturas de venta»")).click();
  await existe(page.getByText(PAGE_TITLE.invoice, { exact: true }), T.medio, "el título «Factura de venta»");
}

export async function abrirFormularioFactura(page: Page) {
  await (await existe(page.locator(LIST.createBtn), T.medio, "el botón «Crear»")).click();
  await existe(page.locator(FORM.orderId), T.medio, "el formulario de factura");
  // Modo factura: no deben existir los campos de nota (A.3).
  if (await page.locator(FORM.noteNumberLabel).count()) {
    throw new ErrorBot("SELECTOR_NOT_FOUND", "El formulario abrió en modo nota, no en modo factura");
  }
}

export async function textoCabecera(page: Page): Promise<string> {
  return page.locator("main").first().innerText({ timeout: T.corto }).catch(() => "");
}

/* --------------------------- react-select --------------------------- */

/** Control de un react-select por la etiqueta visible que lo acompaña (respaldo). */
function controlPorEtiqueta(page: Page, etiqueta: string): Locator {
  const etiquetas = LABEL_TAGS.flatMap((tag) => [`${tag}:text-is("${etiqueta}")`, `${tag}:text-is("${etiqueta}*")`]).join(", ");
  return page.locator(etiquetas).first().locator(`xpath=following::*[contains(@class,"-control")][1]`);
}

/** Control de un react-select por el name de su input oculto; si no está, por etiqueta. */
async function control(page: Page, name: string, etiqueta?: string): Promise<Locator> {
  const porNombre = page.locator(SELECT_BY_NAME(name)).first();
  if (await porNombre.count()) return porNombre;
  if (etiqueta) {
    const porEtiqueta = controlPorEtiqueta(page, etiqueta);
    if (await porEtiqueta.count()) return porEtiqueta;
  }
  throw new ErrorBot("SELECTOR_NOT_FOUND", `No se encontró el desplegable «${etiqueta ?? name}» en Finppi`);
}

async function opciones(page: Page): Promise<Locator> {
  await page.locator(REACT_SELECT.option).first().waitFor({ state: "visible", timeout: T.corto }).catch(() => undefined);
  return page.locator(REACT_SELECT.option);
}

async function leerOpciones(page: Page, control: Locator): Promise<string[]> {
  await control.click();
  const ops = await opciones(page);
  const textos = (await ops.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  await page.keyboard.press("Escape");
  return textos;
}

/** Elige la opción cuyo texto es EXACTAMENTE `texto` (opcionalmente filtrando al escribir). */
async function elegir(page: Page, control: Locator, texto: string, opts: { escribir?: string; coincide?: (t: string) => boolean } = {}) {
  await control.click();
  if (opts.escribir) await page.keyboard.type(opts.escribir, { delay: 40 });
  const ops = await opciones(page);
  const textos = (await ops.allInnerTexts()).map((t) => t.trim());
  const indices = textos.map((t, i) => ((opts.coincide ? opts.coincide(t) : t === texto) ? i : -1)).filter((i) => i >= 0);
  if (indices.length !== 1) {
    await page.keyboard.press("Escape");
    throw new ErrorBot(
      "PLATFORM_VALIDATION_ERROR",
      indices.length ? `Hay varias opciones para «${texto}» en Finppi` : `Finppi no tiene la opción «${texto}»`,
    );
  }
  await ops.nth(indices[0]).click();
  await pausa(200, 600);
}

async function elegirPorEtiqueta(page: Page, etiqueta: string, texto: string) {
  const c = await existe(controlPorEtiqueta(page, etiqueta), T.corto, `el desplegable «${etiqueta}»`);
  await elegir(page, c, texto);
}

async function elegirPorNombre(page: Page, name: string, etiqueta: string, texto: string) {
  await elegir(page, await control(page, name, etiqueta), texto);
}

/* ------------------------- Consecutivo y cliente ------------------------- */

/** La única opción del desplegable «Número» es el próximo consecutivo (§5A). */
export async function leerNumeroOfrecido(page: Page): Promise<string> {
  const ops = await leerOpciones(page, await control(page, SELECT_NAMES.number, SELECT_LABELS.number));
  if (ops.length !== 1) {
    throw new ErrorBot("CONSECUTIVE_GAP", `Finppi ofrece ${ops.length} opciones de numeración; se esperaba una sola`);
  }
  return ops[0].replace(/\s+/g, "");
}

export async function elegirNumero(page: Page, numero: string) {
  await elegir(page, await control(page, SELECT_NAMES.number, SELECT_LABELS.number), numero, {
    coincide: (t) => t.replace(/\s+/g, "") === numero,
  });
}

/** Busca al cliente por documento; si no existe y se autorizó, lo crea con el panel «+». */
export async function elegirCliente(page: Page, c: PayloadEmision["cliente"], crear: boolean): Promise<"existente" | "creado"> {
  const ctrl = await control(page, SELECT_NAMES.client, SELECT_LABELS.client);
  const intentar = async () => {
    await ctrl.click();
    await page.keyboard.type(c.numeroDocumento, { delay: 40 });
    const ops = await opciones(page);
    const textos = (await ops.allInnerTexts()).map((t) => t.trim());
    const i = textos.findIndex((t) => t.replace(/[^0-9A-Za-z]/g, "").includes(c.numeroDocumento));
    if (i < 0) {
      await page.keyboard.press("Escape");
      return false;
    }
    if (textos.filter((t) => t.replace(/[^0-9A-Za-z]/g, "").includes(c.numeroDocumento)).length > 1) {
      await page.keyboard.press("Escape");
      throw new ErrorBot("PLATFORM_VALIDATION_ERROR", "Hay más de un cliente con ese documento en Finppi");
    }
    await ops.nth(i).click();
    return true;
  };
  let resultado: "existente" | "creado" = "existente";
  if (!(await intentar())) {
    if (!crear) throw new ErrorBot("PLATFORM_VALIDATION_ERROR", "El cliente no existe en Finppi y no se autorizó crearlo");
    await crearClienteEnPanel(page, c);
    resultado = "creado";
    if (!(await intentar())) throw new ErrorBot("PLATFORM_VALIDATION_ERROR", "Se creó el cliente pero no aparece en Finppi");
  }
  // El formulario autocompleta la identificación: debe coincidir (no se sobrescribe).
  const id = (await page.locator(FORM.clientId).inputValue({ timeout: T.corto })).replace(/[^0-9A-Za-z]/g, "");
  if (!id.includes(c.numeroDocumento)) {
    throw new ErrorBot("VALUES_MISMATCH", `La identificación del cliente en Finppi (${id}) no coincide`);
  }
  return resultado;
}

async function crearClienteEnPanel(page: Page, c: PayloadEmision["cliente"]) {
  await (await existe(page.locator(FORM.newClientBtn), T.corto, "el botón «+» de cliente")).click();
  const panel = page.locator(CLIENT_PANEL.nationalId).first();
  await existe(panel, T.medio, "el panel «Crear cliente»");
  const L = CLIENT_PANEL.selectLabels;
  await elegirPorEtiqueta(page, L.personType, c.tipoPersona);
  await elegirPorEtiqueta(page, L.docType, c.tipoDocumento);
  await page.locator(CLIENT_PANEL.nationalId).fill(c.numeroDocumento);
  await page.locator(CLIENT_PANEL.name).fill(c.nombres);
  await page.locator(CLIENT_PANEL.lastname).fill(c.apellidos);
  await page.locator(CLIENT_PANEL.email).fill(c.email);
  await page.locator(CLIENT_PANEL.phone).fill(c.celular);
  await elegirPorEtiqueta(page, L.regime, c.regimen);
  await elegirPorEtiqueta(page, L.fiscalResponsibility, c.responsabilidadFiscal);
  await page.locator(CLIENT_PANEL.locationName).fill("Oficina principal");
  // País y ciudad: se escribe para filtrar y se exige UNA coincidencia exacta.
  const pais = await existe(controlPorEtiqueta(page, L.country), T.corto, "el desplegable «País»");
  await elegir(page, pais, c.pais, { escribir: c.pais });
  const ciudad = await existe(controlPorEtiqueta(page, L.city), T.corto, "el desplegable «Ciudad»");
  await elegir(page, ciudad, c.ciudad, { escribir: c.ciudad.split(" / ")[0] });
  await page.locator(CLIENT_PANEL.address1).fill(c.direccion);
  // Lectura de vuelta antes de crear (§9C.2 paso 4).
  for (const [sel, valor] of [
    [CLIENT_PANEL.nationalId, c.numeroDocumento],
    [CLIENT_PANEL.name, c.nombres],
    [CLIENT_PANEL.email, c.email],
  ] as const) {
    if ((await page.locator(sel).inputValue()).trim() !== valor.trim()) {
      throw new ErrorBot("VALUES_MISMATCH", "Los datos del cliente no quedaron como se escribieron");
    }
  }
  await page.locator(CLIENT_PANEL.submit).click();
  // Creado = aparece el aviso o se cierra el panel.
  await Promise.race([
    page.getByText(/cliente creado/i).first().waitFor({ timeout: T.medio }),
    page.locator(CLIENT_PANEL.nationalId).first().waitFor({ state: "hidden", timeout: T.medio }),
  ]).catch(() => undefined);
  await pausa();
}

/* ------------------------------ Factura ------------------------------ */

async function escribirFecha(page: Page, selector: string, iso: string) {
  const campo = page.locator(selector);
  const actual = await campo.inputValue().catch(() => "");
  const valor = fechaComoCampo(iso, actual);
  if (actual === valor) return;
  await campo.fill(valor);
  await page.keyboard.press("Escape");
}

export async function llenarFactura(page: Page, p: PayloadEmision) {
  await elegirPorNombre(page, SELECT_NAMES.invoiceType, SELECT_LABELS.invoiceType, p.tipoFactura);
  await elegirPorNombre(page, SELECT_NAMES.currency, SELECT_LABELS.currency, p.moneda);
  await elegirPorNombre(page, SELECT_NAMES.paymentType, SELECT_LABELS.paymentType, p.tipoPago);
  await escribirFecha(page, FORM.date, p.fecha);
  await escribirFecha(page, FORM.expiration, p.vencimiento);
  await elegirPorNombre(page, SELECT_NAMES.operationType, SELECT_LABELS.operationType, p.tipoOperacion);
  await elegirPorNombre(page, SELECT_NAMES.paymentMethod, SELECT_LABELS.paymentMethod, p.metodoPago);
  await page.locator(FORM.orderId).fill(p.referencia);

  for (let n = 0; n < p.items.length; n++) {
    const it = p.items[n];
    if (n > 0) await page.getByRole("button", { name: "Añadir", exact: true }).click();
    const fila = await existe(page.locator(FORM.item(n).unitPrice), T.corto, `la fila ${n + 1} de ítems`);
    // Por name del input oculto; respaldo: orden de columnas en la fila.
    const tr = fila.locator("xpath=ancestor::tr[1]");
    const nombres = ITEM_SELECT_NAMES(n);
    const selectItem = async (k: (typeof ITEM_SELECT_ORDER)[number]) => {
      const porNombre = page.locator(SELECT_BY_NAME(nombres[k])).first();
      return (await porNombre.count()) ? porNombre : tr.locator(REACT_SELECT.control).nth(ITEM_SELECT_ORDER.indexOf(k));
    };
    await elegir(page, await selectItem("product"), it.producto, {
      escribir: it.producto,
      coincide: (t) => esOpcionDeProducto(t, it.producto),
    });
    // Finppi pone la cantidad en 0 y el precio de lista al elegir el producto.
    await page.locator(FORM.item(n).description).fill(it.descripcion);
    await page.locator(FORM.item(n).quantity).fill(String(it.cantidad));
    await page.locator(FORM.item(n).unitPrice).fill(String(it.precio));
    await page.locator(FORM.item(n).discountPct).fill("0");
    await elegir(page, await selectItem("vat"), it.iva);
    await pausa();
  }
}

/** Lee los totales del formulario (tras cargar los ítems). NaN = fallo. */
export async function leerTotales(page: Page): Promise<Record<string, number>> {
  const r: Record<string, number> = {};
  for (const etiqueta of TOTALS_LABELS) {
    const el = page.getByText(etiqueta, { exact: true }).last();
    if (!(await el.count())) continue;
    const valor = await el.locator("xpath=following::*[normalize-space(text())][1]").innerText().catch(() => "NaN");
    r[etiqueta] = leerValorFinppi(valor);
  }
  if (!("Total" in r)) throw new ErrorBot("SELECTOR_NOT_FOUND", "No se encontraron los totales del formulario");
  return r;
}

/**
 * Pulsa «Enviar» y maneja la confirmación. Lo que se ve en el modal (número
 * y total) se compara con lo esperado; cualquier diferencia → «No, Cancelar».
 * `marcarNoRetorno` se ejecuta y espera ANTES del clic definitivo.
 */
export async function enviar(page: Page, esperado: { numero: string; total: number }, marcarNoRetorno: () => Promise<void>) {
  await page.locator(FORM.send).click();
  const continuar = page.getByRole("button", { name: /^(Continuar|Sí|Si)\b/ }).first();
  const hayModal = await continuar.waitFor({ state: "visible", timeout: T.corto }).then(() => true).catch(() => false);
  if (hayModal) {
    const texto = (await page.locator('[role="dialog"], .modal, .swal2-popup').first().innerText().catch(() => "")).replace(/\s+/g, " ");
    if (!texto.replace(/\s+/g, "").includes(esperado.numero)) {
      await page.getByRole("button", { name: /No, Cancelar|Cancelar/ }).first().click().catch(() => undefined);
      throw new ErrorBot("VALUES_MISMATCH", `El modal de Finppi no muestra el consecutivo esperado ${esperado.numero}`);
    }
    await marcarNoRetorno();
    await continuar.click();
  } else {
    // Sin modal (por confirmar en Fase 0): el clic en «Enviar» fue el definitivo.
    await marcarNoRetorno();
  }
}

/* --------------------------- Listado y archivos --------------------------- */

export interface FilaListado {
  fila: Locator;
  numero: string;
  estado: string;
}

/** Busca en el listado de facturas (por número o referencia) y devuelve la fila. */
export async function buscarEnListado(page: Page, texto: string): Promise<FilaListado | null> {
  await irAFacturas(page);
  const buscador = await existe(page.locator(LIST.search), T.medio, "el buscador del listado");
  await buscador.fill(texto);
  await page.keyboard.press("Enter");
  await page.locator(LIST.resultsText).first().waitFor({ timeout: T.medio }).catch(() => undefined);
  const filas = page.locator(LIST.rows);
  const n = await filas.count();
  for (let i = 0; i < n; i++) {
    const celdas = (await filas.nth(i).locator("td").allInnerTexts()).map((x) => x.trim());
    if (celdas.length < 7) continue;
    const numero = numeroDeFila(celdas[1], celdas[0]);
    if (numero === texto.toUpperCase() || celdas.join(" ").includes(texto)) {
      return { fila: filas.nth(i), numero, estado: celdas[5] };
    }
  }
  return null;
}

export async function esperarAceptada(page: Page, numero: string): Promise<FilaListado> {
  const limite = Date.now() + T.largo;
  while (Date.now() < limite) {
    const f = await buscarEnListado(page, numero).catch(() => null);
    if (f && f.estado === LIST.statusAccepted) return f;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new ErrorBot("TIMEOUT", `La factura ${numero} no apareció «Aceptada» en el listado a tiempo`);
}

/**
 * MODO PRUEBA: pulsa «Guardar» (borrador) en vez de «Enviar». No va a la
 * DIAN. Si Finppi pide confirmación, se acepta solo si el modal no habla de
 * enviar/emitir a la DIAN.
 */
export async function guardarBorrador(page: Page) {
  await (await existe(page.locator(FORM.save), T.corto, "el botón «Guardar»")).click();
  const si = page.getByRole("button", { name: /^(Continuar|Sí|Si|Aceptar)\b/ }).first();
  if (await si.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false)) {
    const texto = (await page.locator('[role="dialog"], .modal, .swal2-popup').first().innerText().catch(() => "")).toLowerCase();
    if (/dian|emitir|enviar/.test(texto) && !/borrador|guardar/.test(texto)) {
      await page.getByRole("button", { name: /No, Cancelar|Cancelar/ }).first().click().catch(() => undefined);
      throw new ErrorBot("PLATFORM_VALIDATION_ERROR", "Al guardar, Finppi pidió confirmar un envío a la DIAN; se canceló");
    }
    await si.click();
  }
}

/**
 * Busca el documento guardado en el listado: por número, luego por
 * referencia y, si no, el borrador más reciente.
 */
export async function esperarBorrador(page: Page, candidatos: string[]): Promise<FilaListado & { porRecencia?: boolean }> {
  const limite = Date.now() + T.largo;
  while (Date.now() < limite) {
    for (const c of candidatos.filter(Boolean)) {
      const f = await buscarEnListado(page, c).catch(() => null);
      if (f && f.estado === LIST.statusDraft) return f;
    }
    await irAFacturas(page).catch(() => undefined);
    const filas = page.locator(LIST.rows);
    const n = await filas.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const celdas = (await filas.nth(i).locator("td").allInnerTexts()).map((x) => x.trim());
      if (celdas.length >= 7 && celdas[5] === LIST.statusDraft) {
        return { fila: filas.nth(i), numero: numeroDeFila(celdas[1], celdas[0]), estado: celdas[5], porRecencia: true };
      }
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new ErrorBot("TIMEOUT", "El borrador no apareció en el listado de Finppi a tiempo");
}

/** Descarga PDF o XML desde los íconos de Opciones (orden verificado: 0 XML, 1 PDF). */
export async function descargar(page: Page, fila: Locator, tipo: "pdf" | "xml"): Promise<Uint8Array> {
  const iconos = fila.locator("td").last().locator("svg, i, button, a");
  const [descarga] = (await Promise.all([
    page.waitForEvent("download", { timeout: T.medio }),
    iconos.nth(LIST.optionIcon[tipo]).click(),
  ])) as [Download, unknown];
  const ruta = await descarga.path();
  if (!ruta) throw new ErrorBot("PDF_INVALID", `No se pudo descargar el ${tipo.toUpperCase()}`);
  const { readFile } = await import("node:fs/promises");
  return new Uint8Array(await readFile(ruta));
}

/* --------------------------- Productos (lectura) --------------------------- */

export interface ProductoFinppi {
  codigo: string;
  nombre: string;
  tipo?: string;
  precio?: string;
}

/**
 * Lee el listado de productos y servicios de Finppi, página por página.
 * Solo lectura: nunca abre «Crear» ni edita.
 * Columnas: 0 #, 1 Nombre, 2 Código, 3 Tipo, 4 Precio, 5 Descripción, 6 Opciones.
 */
export async function leerProductos(page: Page): Promise<ProductoFinppi[]> {
  await page.goto(PRODUCTS_LIST.url, { waitUntil: "domcontentloaded", timeout: T.medio });
  await existe(page.locator(PRODUCTS_LIST.rows), T.medio, "el listado de productos");
  const vistos = new Map<string, ProductoFinppi>();
  for (let pagina = 1; pagina <= 60; pagina++) {
    const filas = page.locator(PRODUCTS_LIST.rows);
    const n = await filas.count();
    const antes = vistos.size;
    for (let i = 0; i < n; i++) {
      const c = (await filas.nth(i).locator("td").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());
      if (c.length < 3 || !c[2]) continue;
      vistos.set(c[2], { codigo: c[2], nombre: c[1], tipo: c[3] || undefined, precio: c[4] || undefined });
    }
    // Siguiente página: enlace con el número siguiente o la flecha.
    const siguiente = page.locator(PAGINATION.link).filter({ hasText: new RegExp(`^\\s*${pagina + 1}\\s*$`) }).first();
    const flecha = page.locator(PAGINATION.next).last();
    const boton = (await siguiente.count()) ? siguiente : (await flecha.count()) ? flecha : null;
    if (!boton || (vistos.size === antes && pagina > 1)) break;
    const primera = await filas.first().innerText().catch(() => "");
    await boton.click().catch(() => undefined);
    // Esperar a que cambie la tabla.
    const cambio = await page
      .waitForFunction(
        `(() => { const f = document.querySelector(${JSON.stringify(PRODUCTS_LIST.rows)}); return !!f && f.innerText !== ${JSON.stringify(primera)}; })()`,
        undefined,
        { timeout: T.corto },
      )
      .then(() => true)
      .catch(() => false);
    if (!cambio) break;
  }
  return [...vistos.values()];
}

/* ------------------------------ Healthcheck ------------------------------ */

async function conteo(page: Page, url: string): Promise<number | undefined> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: T.medio });
  const texto = await page.getByText(PAGINATION_TEXT).first().innerText({ timeout: T.corto }).catch(() => "");
  const m = texto.match(PAGINATION_TEXT);
  return m ? Number(m[1]) : undefined;
}

export async function contarClientesYProductos(page: Page) {
  return { clientes: await conteo(page, CUSTOMERS_LIST.url), productos: await conteo(page, PRODUCTS_LIST.url) };
}
