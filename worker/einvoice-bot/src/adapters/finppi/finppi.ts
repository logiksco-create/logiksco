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
  PRODUCT_FORM,
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
import { ErrorBot, esOpcionDeProducto, fechaComoCampo, normalizar, numeroDeFila } from "../../logica.ts";
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

/**
 * Campo de texto visible por su name (en orden) o, si no, por la etiqueta
 * que Finppi muestra encima. Espera un poco: algunos campos aparecen solo
 * después de elegir el tipo de persona.
 */
async function campoTexto(
  page: Page,
  o: { names: readonly string[]; etiquetas?: readonly string[]; que: string; obligatorio?: boolean; ms?: number },
): Promise<Locator | null> {
  const limite = Date.now() + (o.ms ?? T.corto);
  const libre = 'not(@type="hidden") and not(starts-with(@id,"react-select"))';
  do {
    for (const n of o.names) {
      const l = page.locator(`input[name="${n}"]:visible, textarea[name="${n}"]:visible`).first();
      if (await l.count()) return l;
    }
    for (const e of o.etiquetas ?? []) {
      const sel = LABEL_TAGS.flatMap((tag) => [`${tag}:text-is("${e}")`, `${tag}:text-is("${e}*")`, `${tag}:text-is("${e} *")`]).join(", ");
      const l = page.locator(sel).first().locator(`xpath=following::input[${libre}][1]`);
      if ((await l.count()) && (await l.isVisible().catch(() => false))) return l;
    }
    await page.waitForTimeout(300);
  } while (Date.now() < limite);
  if (o.obligatorio === false) return null;
  throw new ErrorBot("SELECTOR_NOT_FOUND", `No se encontró el campo «${o.que}» en Finppi`);
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

/**
 * Elige la opción cuyo texto es `texto`: primero idéntico; si no, sin tener
 * en cuenta tildes, mayúsculas ni espacios («Medellin» = «MEDELLÍN»). Exige
 * UNA sola coincidencia; si no la hay, el error dice qué ofrece Finppi.
 */
async function elegir(page: Page, control: Locator, texto: string, opts: { escribir?: string; coincide?: (t: string) => boolean } = {}) {
  // Si ya tiene ese valor (p. ej. País = Colombia por defecto), no se toca.
  if (!opts.coincide && normalizar(await control.innerText().catch(() => "")) === normalizar(texto)) return;
  await control.click();
  if (opts.escribir) await page.keyboard.type(opts.escribir, { delay: 40 });
  let ops = await opciones(page);
  let textos = (await ops.allInnerTexts()).map((t) => t.trim());
  const buscar = (f: (t: string) => boolean) => textos.map((t, i) => (f(t) ? i : -1)).filter((i) => i >= 0);
  const coincidencias = () => {
    let r = opts.coincide ? buscar(opts.coincide) : buscar((t) => t === texto);
    if (!opts.coincide && r.length === 0) r = buscar((t) => normalizar(t) === normalizar(texto));
    return r;
  };
  let indices = coincidencias();
  if (indices.length === 0 && opts.escribir) {
    // El filtro de Finppi puede no ignorar tildes: se borra lo escrito y se busca en la lista completa.
    for (let i = 0; i < opts.escribir.length; i++) await page.keyboard.press("Backspace");
    ops = await opciones(page);
    textos = (await ops.allInnerTexts()).map((t) => t.trim());
    indices = coincidencias();
  }
  if (indices.length !== 1) {
    await page.keyboard.press("Escape");
    const vistas = textos.filter(Boolean).slice(0, 12).map((t) => `«${t}»`).join(", ");
    throw new ErrorBot(
      "PLATFORM_VALIDATION_ERROR",
      indices.length
        ? `Hay varias opciones para «${texto}» en Finppi`
        : `Finppi no tiene la opción «${texto}»${vistas ? `. Opciones que muestra: ${vistas}` : " (no mostró opciones)"}`,
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

/** Nombre con el que Finppi muestra al cliente en el buscador de la factura. */
export function nombreEnFinppi(c: PayloadEmision["cliente"]): string {
  return c.tipoPersona === "Natural" && c.apellidos && normalizar(c.apellidos) !== normalizar(c.nombres)
    ? `${c.nombres} ${c.apellidos}`
    : c.nombres;
}

const soloDigitos = (t: string) => t.replace(/[^0-9A-Za-z]/g, "");

/**
 * ¿El documento ya existe en Finppi? Se consulta el listado de Clientes,
 * cuyo buscador SÍ filtra por identificación (el de la factura solo por nombre).
 * Devuelve el nombre con el que está registrado, o null.
 */
export async function buscarClienteEnListado(page: Page, documento: string): Promise<string | null> {
  await page.goto(CUSTOMERS_LIST.url, { waitUntil: "domcontentloaded", timeout: T.medio });
  const buscador = await existe(page.locator(CUSTOMERS_LIST.search), T.medio, "el buscador de Clientes");
  await buscador.fill(documento);
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle", { timeout: T.corto }).catch(() => undefined);
  for (const fila of await page.locator(CUSTOMERS_LIST.rows).all()) {
    const celdas = (await fila.locator("td").allInnerTexts()).map((t) => t.trim());
    if (celdas[2] && soloDigitos(celdas[2]).includes(documento)) return celdas[1] ?? "";
  }
  return null;
}

/**
 * Elige al cliente en la factura. El buscador de Finppi filtra por nombre:
 * se intenta por documento y luego por nombre, y siempre se confirma que la
 * identificación que Finppi autocompleta sea la del cliente.
 * Solo crea al cliente si NO existe en el listado de Finppi (nunca duplica).
 */
export async function elegirCliente(
  page: Page,
  c: PayloadEmision["cliente"],
  opts: { crear: boolean; nombreRegistrado: string | null },
): Promise<"existente" | "creado"> {
  const ctrl = await control(page, SELECT_NAMES.client, SELECT_LABELS.client);
  let elegido = "";
  const intentar = async (texto: string) => {
    await ctrl.click();
    await page.keyboard.press("ControlOrMeta+a").catch(() => undefined);
    await page.keyboard.press("Backspace").catch(() => undefined);
    await page.keyboard.type(texto, { delay: 40 });
    const ops = await opciones(page);
    const textos = (await ops.allInnerTexts()).map((t) => t.trim());
    let i = textos.findIndex((t) => soloDigitos(t).includes(c.numeroDocumento));
    if (i < 0) {
      const porNombre = textos.map((t, k) => (normalizar(t).includes(normalizar(texto)) ? k : -1)).filter((k) => k >= 0);
      const exactos = porNombre.filter((k) => normalizar(textos[k]) === normalizar(texto));
      const elegidos = exactos.length ? exactos : porNombre;
      if (elegidos.length > 1) {
        await page.keyboard.press("Escape");
        throw new ErrorBot("PLATFORM_VALIDATION_ERROR", `Hay ${elegidos.length} clientes llamados «${texto}» en Finppi: deja uno solo`);
      }
      i = elegidos[0] ?? -1;
    }
    if (i < 0) {
      await page.keyboard.press("Escape");
      return false;
    }
    elegido = textos[i];
    await ops.nth(i).click();
    return true;
  };
  const nombres = [...new Set([opts.nombreRegistrado, nombreEnFinppi(c), c.nombres].filter((x): x is string => !!x?.trim()))];
  const buscar = async () => {
    if (await intentar(c.numeroDocumento)) return true;
    for (const n of nombres) if (await intentar(n)) return true;
    return false;
  };

  let resultado: "existente" | "creado" = "existente";
  if (!(await buscar())) {
    if (opts.nombreRegistrado !== null) {
      throw new ErrorBot(
        "PLATFORM_VALIDATION_ERROR",
        `El cliente ya existe en Finppi como «${opts.nombreRegistrado}», pero no aparece en el buscador de la factura`,
      );
    }
    if (!opts.crear) throw new ErrorBot("PLATFORM_VALIDATION_ERROR", "El cliente no existe en Finppi y no se autorizó crearlo");
    await crearClienteEnPanel(page, c);
    resultado = "creado";
    let ok = false;
    for (const espera of [0, 2000, 5000]) {
      if (espera) await page.waitForTimeout(espera);
      if ((ok = await buscar())) break;
    }
    if (!ok) {
      throw new ErrorBot(
        "PLATFORM_VALIDATION_ERROR",
        `Se creó el cliente «${nombreEnFinppi(c)}» en Finppi, pero aún no aparece en el buscador de la factura. Al reintentar se usará, no se vuelve a crear.`,
      );
    }
  }
  // Finppi suele autocompletar la identificación; se le da tiempo.
  const campoId = page.locator(FORM.clientId);
  let id = "";
  for (let k = 0; k < 10 && !id; k++) {
    id = soloDigitos(await campoId.inputValue({ timeout: T.corto }).catch(() => ""));
    if (!id) await page.waitForTimeout(500);
  }
  if (id) {
    // Si la puso Finppi, debe ser la del cliente (nunca se sobrescribe).
    if (!id.includes(c.numeroDocumento)) {
      throw new ErrorBot("VALUES_MISMATCH", `La identificación del cliente elegido en Finppi (${id}) no coincide con ${c.numeroDocumento}`);
    }
    return resultado;
  }
  // Finppi no la autocompletó. Solo se sigue si el elegido es, sin duda, el cliente
  // que el listado de Clientes asocia a ese documento (o el que se acaba de crear).
  const seguro =
    soloDigitos(elegido).includes(c.numeroDocumento) ||
    (!!opts.nombreRegistrado && normalizar(elegido) === normalizar(opts.nombreRegistrado)) ||
    (resultado === "creado" && normalizar(elegido) === normalizar(nombreEnFinppi(c)));
  if (!seguro) {
    throw new ErrorBot("VALUES_MISMATCH", `Finppi no mostró la identificación del cliente elegido («${elegido}») y no se pudo confirmar que sea ${c.numeroDocumento}`);
  }
  // Se completan los campos vacíos con los datos del cliente (como los autocompletaría Finppi).
  await campoId.fill(c.numeroDocumento);
  const dir = page.locator(FORM.clientAddress);
  if (c.direccion && !(await dir.inputValue().catch(() => "")).trim()) await dir.fill(c.direccion);
  const tel = page.locator(FORM.clientPhone);
  const numero = (c.telefono || c.celular || "").replace(/[^0-9]/g, "");
  if (numero && !(await tel.inputValue().catch(() => "")).trim()) await tel.fill(numero);
  if (soloDigitos(await campoId.inputValue()) !== c.numeroDocumento) {
    throw new ErrorBot("VALUES_MISMATCH", "La identificación del cliente no quedó como se escribió");
  }
  return resultado;
}

async function crearClienteEnPanel(page: Page, c: PayloadEmision["cliente"]) {
  await (await existe(page.locator(FORM.newClientBtn), T.corto, "el botón «+» de cliente")).click();
  const panel = page.locator(CLIENT_PANEL.nationalId).first();
  await existe(panel, T.medio, "el panel «Crear cliente»");
  const L = CLIENT_PANEL.selectLabels;
  const N = CLIENT_PANEL.selectNames;
  await elegirPorNombre(page, N.personType, L.personType, c.tipoPersona);
  await elegirPorNombre(page, N.docType, L.docType, c.tipoDocumento);
  await page.locator(CLIENT_PANEL.nationalId).fill(c.numeroDocumento);
  const juridica = c.tipoPersona === "Juridica";
  const nombre = await campoTexto(page, {
    names: CLIENT_PANEL.nameAlternatives,
    etiquetas: CLIENT_PANEL.nameLabels,
    que: juridica ? "Razón social" : "Nombres",
  });
  await nombre!.fill(c.nombres);
  // Apellidos: solo personas naturales (en jurídica Finppi no lo pide).
  const apellido = await campoTexto(page, {
    names: ["lastname"],
    etiquetas: CLIENT_PANEL.lastnameLabels,
    que: "Apellidos",
    obligatorio: !juridica,
    ms: juridica ? 1_000 : undefined,
  });
  if (apellido && c.apellidos && c.apellidos !== c.nombres) await apellido.fill(c.apellidos);
  else if (apellido && !juridica) await apellido.fill(c.apellidos);
  await page.locator(CLIENT_PANEL.email).fill(c.email);
  await page.locator(CLIENT_PANEL.phone).fill(c.celular);
  await elegirPorNombre(page, N.regime, L.regime, c.regimen);
  await elegirPorNombre(page, N.fiscalResponsibility, L.fiscalResponsibility, c.responsabilidadFiscal);
  await page.locator(CLIENT_PANEL.locationName).fill("Oficina principal");
  // País y ciudad: se escribe para filtrar y se exige UNA coincidencia exacta.
  const pais = await control(page, N.country, L.country);
  await elegir(page, pais, c.pais, { escribir: c.pais });
  const ciudad = await control(page, N.city, L.city);
  await elegir(page, ciudad, c.ciudad, { escribir: c.ciudad.split(" / ")[0] });
  await page.locator(CLIENT_PANEL.address1).fill(c.direccion);
  const telUbicacion = page.locator(CLIENT_PANEL.locationPhone);
  if ((await telUbicacion.count()) && c.telefono) await telUbicacion.fill(c.telefono.replace(/[^0-9]/g, ""));
  // Lectura de vuelta antes de crear (§9C.2 paso 4).
  for (const [campo, valor] of [
    [page.locator(CLIENT_PANEL.nationalId), c.numeroDocumento],
    [nombre!, c.nombres],
    [page.locator(CLIENT_PANEL.email), c.email],
  ] as const) {
    if ((await campo.inputValue()).trim() !== valor.trim()) {
      throw new ErrorBot("VALUES_MISMATCH", "Los datos del cliente no quedaron como se escribieron");
    }
  }
  await page.locator(CLIENT_PANEL.submit).click();
  // Creado = aparece el aviso o se cierra el panel.
  await Promise.race([
    page.getByText(/cliente creado/i).first().waitFor({ timeout: T.medio }),
    page.locator(CLIENT_PANEL.nationalId).first().waitFor({ state: "hidden", timeout: T.medio }),
  ]).catch(() => undefined);
  if (await page.locator(CLIENT_PANEL.nationalId).first().isVisible().catch(() => false)) {
    // Sigue abierto: Finppi rechazó algún campo. Se reporta lo que dice.
    const textos = (await page.locator(CLIENT_PANEL.errors).allInnerTexts().catch(() => []))
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter((t) => t && t.length < 160);
    const avisos = [...new Set(textos)].slice(0, 6).join(" · ");
    if (avisos) throw new ErrorBot("PLATFORM_VALIDATION_ERROR", `Finppi no creó el cliente: ${avisos}`);
    // Sin mensajes de error: se cierra el panel; la búsqueda confirma si quedó creado.
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  await pausa();
}

/**
 * Lee (sin crear nada) las opciones del panel «Crear cliente»: lo abre desde
 * el formulario de factura, lee cada desplegable y sale sin guardar.
 */
export async function leerOpcionesCliente(page: Page) {
  await (await existe(page.locator(FORM.newClientBtn), T.corto, "el botón «+» de cliente")).click();
  await existe(page.locator(CLIENT_PANEL.nationalId).first(), T.medio, "el panel «Crear cliente»");
  const N = CLIENT_PANEL.selectNames;
  const L = CLIENT_PANEL.selectLabels;
  const leer = async (name: string, etiqueta: string) => {
    try {
      return await leerOpciones(page, await control(page, name, etiqueta));
    } catch {
      return [];
    }
  };
  return {
    tipoPersona: await leer(N.personType, L.personType),
    tipoDocumento: await leer(N.docType, L.docType),
    regimen: await leer(N.regime, L.regime),
    responsabilidadFiscal: await leer(N.fiscalResponsibility, L.fiscalResponsibility),
    ciudades: await leer(N.city, L.city),
  };
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
/**
 * Lee los totales como los ve una persona: para cada etiqueta visible, el
 * texto con forma de dinero que está en la MISMA FILA, a su derecha. No
 * depende de la estructura interna de la página. Script en texto plano (tsx
 * inyecta «__name» en las funciones y no existe en el navegador).
 */
const SCRIPT_TOTALES = (etiquetas: string[]) => `(() => {
  var etiquetas = ${JSON.stringify(etiquetas)};
  var visible = function (el) { var r = el.getBoundingClientRect(); var st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  var propio = function (el) { var t = ""; el.childNodes.forEach(function (n) { if (n.nodeType === 3) t += n.textContent; }); return t.replace(/\\s+/g, " ").trim(); };
  var todos = Array.prototype.slice.call(document.querySelectorAll("body *")).filter(visible);
  var dinero = todos.filter(function (el) { var t = (el.innerText || "").trim(); return el.children.length === 0 && /^[-$\\s]*(NaN|[\\d.,]+)$/.test(t) && /\\d|NaN/.test(t); });
  var r = {};
  etiquetas.forEach(function (et) {
    var labs = todos.filter(function (el) { return propio(el) === et || ((el.innerText || "").trim() === et && el.children.length === 0); });
    var lab = labs[labs.length - 1];
    if (!lab) return;
    var a = lab.getBoundingClientRect(), cy = a.top + a.height / 2, mejor = null, dist = 1e9;
    dinero.forEach(function (el) {
      var b = el.getBoundingClientRect();
      if (b.left < a.right - 2 || Math.abs(b.top + b.height / 2 - cy) > Math.max(8, a.height)) return;
      var d = b.left - a.right;
      if (d < dist) { dist = d; mejor = el; }
    });
    r[et] = mejor ? mejor.innerText.trim() : "";
  });
  return r;
})()`;

/** Último texto leído por etiqueta (para explicar un error de totales). */
export const ultimaLecturaTotales: Record<string, string> = {};

async function leerTotalesUnaVez(page: Page): Promise<Record<string, number>> {
  const textos = (await page.evaluate(SCRIPT_TOTALES(TOTALS_LABELS)).catch(() => ({}))) as Record<string, string>;
  const r: Record<string, number> = {};
  for (const [k, v] of Object.entries(textos)) {
    ultimaLecturaTotales[k] = v;
    r[k] = v ? leerValorFinppi(v) : NaN;
  }
  return r;
}

/**
 * Totales del formulario. Finppi los recalcula después de cada cambio y por un
 * instante puede mostrar «NaN»: se lee hasta que no haya NaN y dos lecturas
 * seguidas coincidan (máx. ~15 s). Si sigue en NaN, se devuelve NaN (aborta).
 */
export async function leerTotales(page: Page): Promise<Record<string, number>> {
  // Sacar el foco del último campo para que Finppi recalcule.
  await page.keyboard.press("Tab").catch(() => undefined);
  let anterior = "";
  let r: Record<string, number> = {};
  for (let k = 0; k < 20; k++) {
    await page.waitForTimeout(750);
    r = await leerTotalesUnaVez(page);
    const firma = JSON.stringify(r);
    // Los que se comparan con lo aprobado no pueden ser NaN.
    const sinNaN = ["Subtotal", "IVA (+)", "Total"].every((k) => !(k in r) || !Number.isNaN(r[k]));
    if ("Total" in r && sinNaN && firma === anterior) return r;
    anterior = firma;
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
  // Lo que respondió Finppi: avisos, errores de validación y la página a la que llevó.
  await page.waitForTimeout(3000);
  const mensajes = [
    ...new Set(
      (await page
        .locator('.Toastify__toast, [role="alert"], .swal2-popup, .alert, .notification, .form__form-group-error, .invalid-feedback')
        .allInnerTexts()
        .catch(() => [] as string[]))
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter((t) => t && t.length < 200),
    ),
  ].slice(0, 5);
  const errores = mensajes.filter((m) => /error|requerid|obligatori|inválid|invalid|falta|no se pudo/i.test(m));
  if (errores.length) throw new ErrorBot("PLATFORM_VALIDATION_ERROR", `Finppi no guardó la factura: ${errores.join(" · ")}`);
  return { url: new URL(page.url()).pathname, mensajes };
}

/** ¿La celda es este cliente? Acepta el nombre cortado: «Luis Miguel Ortiz R...». */
export function mismoCliente(celda: string, nombre: string): boolean {
  const c = normalizar(celda);
  const n = normalizar(nombre);
  if (!c || !n) return false;
  if (c.includes(n)) return true;
  const corto = c.replace(/(\.{2,}|…)$/, "").trim();
  return corto !== c && corto.length >= 6 && n.startsWith(corto);
}

/** Texto de las primeras filas del listado (para explicar si no se encontró algo). */
async function resumenListado(page: Page): Promise<string> {
  const filas = page.locator(LIST.rows);
  const n = Math.min(await filas.count().catch(() => 0), 5);
  const r: string[] = [];
  for (let i = 0; i < n; i++) r.push((await filas.nth(i).locator("td").allInnerTexts()).map((x) => x.trim()).filter(Boolean).join(" | "));
  return r.join(" ;; ") || "(sin filas)";
}

/**
 * Busca el documento guardado en el listado: por número, luego por
 * referencia y, si no, el borrador más reciente de ese cliente.
 * El estado se compara sin tildes ni mayúsculas.
 */
export async function esperarBorrador(
  page: Page,
  candidatos: string[],
  cliente?: { nombre: string; documento: string },
  ms = 60_000,
): Promise<FilaListado & { porRecencia?: boolean }> {
  const esBorrador = (t: string) => normalizar(t) === normalizar(LIST.statusDraft);
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    for (const c of candidatos.filter(Boolean)) {
      const f = await buscarEnListado(page, c).catch(() => null);
      if (f && esBorrador(f.estado)) return f;
    }
    await irAFacturas(page).catch(() => undefined);
    await page.locator(LIST.rows).first().waitFor({ timeout: T.corto }).catch(() => undefined);
    const filas = page.locator(LIST.rows);
    const n = await filas.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const celdas = (await filas.nth(i).locator("td").allInnerTexts()).map((x) => x.trim());
      const estado = celdas.find(esBorrador);
      if (!estado) continue;
      // Debe ser de este cliente (la columna muestra el nombre, a veces cortado con «...»).
      if (cliente && !celdas.some((x) => mismoCliente(x, cliente.nombre) || soloDigitos(x).includes(cliente.documento))) continue;
      return { fila: filas.nth(i), numero: numeroDeFila(celdas[1] ?? "", celdas[0] ?? ""), estado, porRecencia: true };
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new ErrorBot("TIMEOUT", `El borrador no apareció en el listado de Finppi. Primeras filas: ${await resumenListado(page)}`);
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

/**
 * Crea un producto o servicio en Finppi (/products/edit). Se llama solo si no
 * existe su código (se buscó antes). Lee de vuelta nombre y código antes de
 * «Crear» y verifica que aparezca en el listado.
 */
export async function crearProducto(page: Page, p: { codigo: string; nombre: string; iva: string }) {
  await page.goto(PRODUCTS_LIST.url, { waitUntil: "domcontentloaded", timeout: T.medio });
  await (await existe(page.locator(PRODUCTS_LIST.createBtn), T.medio, "el botón «Crear» de productos")).click();
  await (await existe(page.locator(PRODUCT_FORM.name), T.medio, "el formulario de producto")).fill(p.nombre);
  await page.locator(PRODUCT_FORM.code).fill(p.codigo);
  const L = PRODUCT_FORM.selectLabels;
  await elegirPorEtiqueta(page, L.type, "Servicio");
  await elegirPorEtiqueta(page, L.vat, p.iva);
  const precio = page.locator(PRODUCT_FORM.priceValue(0));
  if (await precio.count()) await precio.fill("0");
  // Lectura de vuelta antes del clic definitivo.
  if ((await page.locator(PRODUCT_FORM.name).inputValue()).trim() !== p.nombre.trim() || (await page.locator(PRODUCT_FORM.code).inputValue()).trim() !== p.codigo) {
    throw new ErrorBot("VALUES_MISMATCH", `Los datos del producto ${p.codigo} no quedaron como se escribieron`);
  }
  await page.locator(PRODUCT_FORM.submit).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/edit"), { timeout: T.medio }).catch(() => undefined);
  const lista = await leerProductos(page);
  if (!lista.some((x) => x.codigo === p.codigo)) {
    throw new ErrorBot("PLATFORM_VALIDATION_ERROR", `Finppi no muestra el producto ${p.codigo} después de crearlo`);
  }
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
