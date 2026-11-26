/**
 * Facturación electrónica vía Finppi (PRD «EINVOICE_BOT», adaptado a LOGIKS).
 *
 * El operador logístico factura en USD, pero Finppi y la DIAN reciben pesos:
 * el operador escribe una TRM de referencia y LOGIKS convierte cada precio
 * unitario a COP. El bot solo transcribe estos valores («valores aprobados»)
 * y compara los totales de Finppi con los de aquí (tolerancia $1).
 *
 * Este módulo es puro (sin dependencias de ejecución) para que lo use tanto
 * la aplicación como el worker del bot.
 */
import type { DatosFiscales, IvaFinppi, LineaFactura, Moneda } from "./types";

/* ------------------------------------------------------------------ */
/* Catálogos exactos de Finppi (Anexo A.7 y A.8). El bot elige por texto. */
/* ------------------------------------------------------------------ */

export const FINPPI = {
  tipoFactura: ["Factura de venta nacional", "Factura de exportación"],
  monedaCop: "COP - Peso colombiano",
  tipoPago: ["Contado", "Crédito"] as const,
  tipoOperacion: ["Estándar", "Mandatos", "Servicios AIU", "Cambiario", "Transporte"],
  /** Los más usados; el catálogo completo (78) se sincroniza desde Finppi. */
  metodoPago: [
    "Acuerdo mutuo",
    "Transferencia Crédito Bancario",
    "Transferencia Débito Bancaria",
    "Consignación bancaria",
    "Efectivo",
    "Tarjeta Crédito",
    "Tarjeta Débito",
    "Cheque",
    "Crédito ACH",
    "Débito ACH",
    "Instrumento no definido",
  ],
  iva: ["Ninguno", "IVA-0", "IVA-5", "IVA-19"] as const satisfies readonly IvaFinppi[],
  inc: "No aplica",
  tipoPersona: ["Juridica", "Natural"] as const,
  tipoDocumento: [
    "Nit",
    "Cédula de ciudadanía",
    "Cédula de extranjería",
    "Pasaporte",
    "Tarjeta de identidad",
    "Tarjeta de extranjería",
    "Nuip",
    "Registro civil",
    "Permiso especial de permanencia",
    "Documento de identificación extranjero",
    "Nit de otro pais / sin identificación del exterior (43 medios magneticos)",
  ],
  regimen: ["Responsable de iva", "No responsable de iva"],
  responsabilidadFiscal: [
    "No aplica (ninguna de las anteriores)",
    "Agente de retención de iva",
    "Autoretenedor",
    "Gran contribuyente",
    "Régimen simple de tributación",
  ],
} as const;

/** Versión del texto de autorización que acepta la empresa (§9B.2). */
export const VERSION_CONSENTIMIENTO = "1.0";

export const TEXTO_CONSENTIMIENTO = [
  "Autorizo a LOGIKS.CO a ingresar a mi cuenta de Finppi con el usuario y la contraseña que registro aquí, únicamente para crear y emitir las facturas electrónicas que yo apruebe en LOGIKS.CO, crear los clientes que yo autorice y descargar sus PDF y XML. Autorizo el tratamiento de estas credenciales conforme a la Ley 1581 de 2012; se guardan cifradas y no se vuelven a mostrar.",
  "Siempre debo verificar que cada factura haya sido ACEPTADA por la DIAN (con el enlace «Verificar en la DIAN» o directamente en Finppi). LOGIKS.CO transcribe mis datos a Finppi, pero la emisión, la validez ante la DIAN y el contenido de los documentos son responsabilidad exclusiva mía.",
  "La TRM de referencia con la que se convierten los valores en dólares a pesos la escribo yo en cada factura y soy responsable de ella.",
  "Si encuentro cualquier inconsistencia (documentos que no emití, valores distintos a los aprobados, duplicados o comportamientos extraños), debo cambiar de inmediato mi contraseña en Finppi. Al hacerlo, LOGIKS.CO pierde el acceso y la conexión queda cancelada.",
  "Puedo desconectar mi cuenta en cualquier momento desde esta pantalla, lo que elimina mis credenciales de LOGIKS.CO.",
  "LOGIKS.CO guarda sin modificaciones el PDF y el XML que entrega Finppi. El PDF de LOGIKS.CO en dólares es una representación comercial adicional; el documento válido ante la DIAN es el emitido por Finppi.",
];

/* ------------------------------------------------------------------ */
/* Datos fiscales del cliente                                          */
/* ------------------------------------------------------------------ */

export const CAMPOS_FISCALES: Record<keyof DatosFiscales, string> = {
  tipoPersona: "Tipo de persona",
  tipoDocumento: "Tipo de documento",
  numeroDocumento: "Número de documento",
  nombres: "Nombres o razón social",
  apellidos: "Apellidos",
  email: "Correo de facturación",
  celular: "Celular",
  regimen: "Régimen",
  responsabilidadFiscal: "Responsabilidad fiscal",
  pais: "País",
  ciudad: "Ciudad",
  direccion: "Dirección principal",
  telefono: "Teléfono",
};

const CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** NIT sin dígito de verificación, puntos ni espacios: «900.123.456-7» → «900123456». */
export function documentoLimpio(nit: string): string {
  const sinDv = nit.trim().replace(/-\s*\d\s*$/, "");
  return sinDv.replace(/[^0-9A-Za-z]/g, "");
}

/** Propuesta inicial de datos fiscales con lo que LOGIKS ya sabe del cliente. */
export function fiscalSugerido(c: {
  nit: string;
  razonSocial: string;
  ciudad?: string;
  direccion?: string;
  contactos?: { correo?: string; telefono?: string }[];
  fiscal?: Partial<DatosFiscales>;
}): DatosFiscales {
  const contacto = c.contactos?.find((x) => x.correo) ?? c.contactos?.[0];
  const juridica = (c.fiscal?.tipoPersona ?? "Juridica") === "Juridica";
  return {
    tipoPersona: juridica ? "Juridica" : "Natural",
    tipoDocumento: juridica ? "Nit" : "Cédula de ciudadanía",
    numeroDocumento: documentoLimpio(c.nit),
    nombres: c.razonSocial,
    apellidos: juridica ? c.razonSocial : "",
    email: contacto?.correo ?? "",
    celular: contacto?.telefono ?? "",
    regimen: "Responsable de iva",
    responsabilidadFiscal: "No aplica (ninguna de las anteriores)",
    pais: "Colombia",
    ciudad: c.ciudad ?? "",
    direccion: c.direccion ?? "",
    telefono: contacto?.telefono ?? "",
    ...Object.fromEntries(Object.entries(c.fiscal ?? {}).filter(([, v]) => v !== undefined && v !== "")),
  };
}

/** Campos que faltan o están mal para crear al cliente en Finppi (§9A.2). */
export function faltantesFiscales(f: Partial<DatosFiscales> | undefined): string[] {
  const d = f ?? {};
  const faltan: string[] = [];
  for (const [k, etiqueta] of Object.entries(CAMPOS_FISCALES) as [keyof DatosFiscales, string][]) {
    if (!String(d[k] ?? "").trim()) faltan.push(etiqueta);
  }
  if (d.email && d.email.split(",").some((x) => !CORREO.test(x.trim()))) faltan.push("Correo de facturación válido");
  if (d.tipoDocumento && !(FINPPI.tipoDocumento as readonly string[]).includes(d.tipoDocumento)) faltan.push("Tipo de documento de Finppi");
  if (d.regimen && !(FINPPI.regimen as readonly string[]).includes(d.regimen)) faltan.push("Régimen de Finppi");
  if (d.responsabilidadFiscal && !(FINPPI.responsabilidadFiscal as readonly string[]).includes(d.responsabilidadFiscal)) {
    faltan.push("Responsabilidad fiscal de Finppi");
  }
  if (d.ciudad && !/^.+ \/ .+$/.test(d.ciudad)) faltan.push("Ciudad con formato «MUNICIPIO / Departamento»");
  if (d.numeroDocumento && /[^0-9A-Za-z]/.test(d.numeroDocumento)) faltan.push("Documento sin puntos ni dígito de verificación");
  return faltan;
}

/* ------------------------------------------------------------------ */
/* IVA                                                                 */
/* ------------------------------------------------------------------ */

const PCT: Record<IvaFinppi, number> = { Ninguno: 0, "IVA-0": 0, "IVA-5": 5, "IVA-19": 19 };

export function pctIva(iva: IvaFinppi): number {
  return PCT[iva];
}

/** IVA de Finppi por defecto: ingresos para terceros no causan IVA. */
export function ivaPorDefecto(linea: { tipo: "propio" | "terceros"; ivaPct?: number }): IvaFinppi {
  if (linea.tipo === "terceros") return "Ninguno";
  if (linea.ivaPct === 0) return "IVA-0";
  if (linea.ivaPct === 5) return "IVA-5";
  return "IVA-19";
}

/* ------------------------------------------------------------------ */
/* Conversión USD → COP y totales con la fórmula de Finppi             */
/* ------------------------------------------------------------------ */

/** Decimales del precio unitario en COP que se escriben en Finppi. */
export const DECIMALES_COP = 2;
export const TOLERANCIA_TOTALES = 1;

/** Redondeo decimal «mitad hacia arriba» sin errores de coma flotante (1.005 → 1.01). */
export function redondear(n: number, decimales = 2): number {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return 0;
  const limpio = Number(n.toPrecision(15));
  return Number(`${Math.round(Number(`${limpio}e${decimales}`))}e-${decimales}`);
}
const r2 = (n: number) => redondear(n, 2);
const redondearCop = (n: number) => redondear(n, DECIMALES_COP);

export interface LineaCop {
  descripcion: string;
  productoFinppi?: string;
  iva: IvaFinppi;
  cantidad: number;
  /** Precio unitario en la moneda de la factura (USD o COP). */
  precioOriginal: number;
  /** Precio unitario que se escribe en Finppi, en pesos. */
  precioCop: number;
  subtotalCop: number;
  ivaCop: number;
  subtotalOriginal: number;
  ivaOriginal: number;
  tipo: "propio" | "terceros";
}

/**
 * Convierte las líneas a pesos con la TRM de referencia del operador.
 * En facturas en COP la TRM no aplica (vale 1).
 */
export function lineasEnCop(lineas: LineaFactura[], moneda: Moneda, trmReferencia: number): LineaCop[] {
  const tasa = moneda === "USD" ? trmReferencia : 1;
  return lineas.map((l) => {
    const iva = l.ivaFinppi ?? ivaPorDefecto(l);
    const pct = pctIva(iva);
    const precioCop = redondearCop(l.valorUnitario * tasa);
    const subtotalCop = r2(precioCop * l.cantidad);
    const subtotalOriginal = r2(l.valorUnitario * l.cantidad);
    return {
      descripcion: l.descripcion,
      productoFinppi: l.productoFinppi,
      iva,
      cantidad: l.cantidad,
      precioOriginal: l.valorUnitario,
      precioCop,
      subtotalCop,
      ivaCop: r2((subtotalCop * pct) / 100),
      subtotalOriginal,
      ivaOriginal: r2((subtotalOriginal * pct) / 100),
      tipo: l.tipo,
    };
  });
}

export interface TotalesFe {
  subtotal: number;
  iva: number;
  total: number;
  /** Ingresos recibidos para terceros (sin IVA), informativo. */
  terceros: number;
}

/** Totales en COP como los calcula Finppi (subtotal + IVA por ítem; sin retenciones). */
export function totalesCop(lineas: LineaCop[]): TotalesFe {
  const subtotal = r2(lineas.reduce((s, l) => s + l.subtotalCop, 0));
  const iva = r2(lineas.reduce((s, l) => s + l.ivaCop, 0));
  const terceros = r2(lineas.filter((l) => l.tipo === "terceros").reduce((s, l) => s + l.subtotalCop, 0));
  return { subtotal, iva, total: r2(subtotal + iva), terceros };
}

/** Totales en la moneda de la factura (lo que ve el cliente en el PDF de LOGIKS). */
export function totalesOriginales(lineas: LineaCop[]): TotalesFe {
  const subtotal = r2(lineas.reduce((s, l) => s + l.subtotalOriginal, 0));
  const iva = r2(lineas.reduce((s, l) => s + l.ivaOriginal, 0));
  const terceros = r2(lineas.filter((l) => l.tipo === "terceros").reduce((s, l) => s + l.subtotalOriginal, 0));
  return { subtotal, iva, total: r2(subtotal + iva), terceros };
}

/** ¿Coinciden los totales de Finppi con los aprobados? (§5.4) */
export function totalesCoinciden(aprobado: number, leido: number): boolean {
  return Number.isFinite(leido) && Math.abs(aprobado - leido) <= TOLERANCIA_TOTALES;
}

/** «$ 1.234.567,89» o «1,234,567.89» → número. NaN si no se puede leer. */
export function leerValorFinppi(texto: string): number {
  if (/nan/i.test(texto)) return NaN;
  const limpio = texto.replace(/[^\d.,-]/g, "");
  if (!limpio) return NaN;
  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  let normal: string;
  if (ultimaComa > ultimoPunto) normal = limpio.replace(/\./g, "").replace(",", ".");
  else if (ultimoPunto > ultimaComa && limpio.length - ultimoPunto - 1 !== 3) normal = limpio.replace(/,/g, "");
  else normal = limpio.replace(/[.,]/g, "");
  return Number(normal);
}

/* ------------------------------------------------------------------ */
/* Fechas y referencia                                                 */
/* ------------------------------------------------------------------ */

export function vencimiento(fecha: string, tipoPago: "Contado" | "Crédito", plazoDias: number): string {
  if (tipoPago === "Contado" || !plazoDias) return fecha;
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plazoDias);
  return d.toISOString().slice(0, 10);
}

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Referencia única que va en «Número de orden» de Finppi (anti-duplicados). */
export function referenciaFactura(aleatorio: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALFABETO[aleatorio(ALFABETO.length)];
  return `LG-${s}`;
}

/* ------------------------------------------------------------------ */
/* DIAN: CUFE, QR, número                                              */
/* ------------------------------------------------------------------ */

/**
 * CUFE: SHA-384 en hexadecimal (96 caracteres). En los PDF suele venir
 * partido en varias líneas, así que si no aparece entero se busca después
 * de la palabra «CUFE» uniendo los fragmentos.
 */
export function extraerCufe(texto: string): string | null {
  const directo = texto.match(/\b[a-f0-9]{96}\b/i);
  if (directo) return directo[0].toLowerCase();
  // Fragmentos hexadecimales separados por espacios o saltos de línea.
  for (const m of texto.matchAll(/(?:\b[a-f0-9]{8,}\b[\s]+){1,11}\b[a-f0-9]{8,}\b/gi)) {
    const unido = m[0].replace(/\s+/g, "");
    if (unido.length === 96) return unido.toLowerCase();
  }
  // Partido en varias líneas solo hexadecimales: se unen las consecutivas.
  const lineas = texto.split(/\r?\n/).map((l) => l.trim().replace(/^CUFE:?\s*/i, ""));
  for (let i = 0; i < lineas.length; i++) {
    let unido = "";
    for (let j = i; j < lineas.length && /^[a-f0-9]+$/i.test(lineas[j]) && unido.length < 96; j++) unido += lineas[j];
    if (unido.length === 96) return unido.toLowerCase();
  }
  return null;
}

export function esCufe(s: string | undefined | null): s is string {
  return !!s && /^[a-f0-9]{96}$/i.test(s);
}

/** Enlace de consulta pública de la DIAN (es el contenido del QR de la factura). */
export function urlDian(cufe: string): string {
  return `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`;
}

/* ------------------------------------------------------------------ */
/* Consecutivos (cero saltos, §5A)                                     */
/* ------------------------------------------------------------------ */

export function partirConsecutivo(numero: string): { prefijo: string; seq: number } | null {
  const m = numero.trim().match(/^([A-Za-z]*)\s*-?\s*(\d+)$/);
  return m ? { prefijo: m[1].toUpperCase(), seq: Number(m[2]) } : null;
}

export type VerificacionConsecutivo =
  | { ok: true }
  | { ok: false; motivo: "salto"; faltantes: string[]; mensaje: string }
  | { ok: false; motivo: "retroceso" | "ilegible" | "otra_serie"; mensaje: string };

/**
 * Regla 5A.2: Finppi debe ofrecer exactamente el siguiente del último
 * emitido conocido. Sin historial (primera emisión) se acepta lo ofrecido.
 */
export function verificarConsecutivo(ofrecido: string, ultimoConocido: string | null): VerificacionConsecutivo {
  const o = partirConsecutivo(ofrecido);
  if (!o) return { ok: false, motivo: "ilegible", mensaje: `No se pudo leer el consecutivo «${ofrecido}».` };
  if (!ultimoConocido) return { ok: true };
  const u = partirConsecutivo(ultimoConocido);
  if (!u) return { ok: true };
  if (u.prefijo !== o.prefijo) {
    return { ok: false, motivo: "otra_serie", mensaje: `Finppi ofrece la serie ${o.prefijo} pero la última conocida es ${u.prefijo}.` };
  }
  const esperado = u.seq + 1;
  if (o.seq === esperado) return { ok: true };
  if (o.seq > esperado) {
    const faltantes = Array.from({ length: Math.min(o.seq - esperado, 50) }, (_, i) => `${o.prefijo}${esperado + i}`);
    return {
      ok: false,
      motivo: "salto",
      faltantes,
      mensaje: `Finppi ofrece ${o.prefijo}${o.seq} pero el último conocido es ${u.prefijo}${u.seq}. Falta ${faltantes.join(", ")}.`,
    };
  }
  return { ok: false, motivo: "retroceso", mensaje: `Finppi ofrece ${o.prefijo}${o.seq}, anterior al último conocido ${u.prefijo}${u.seq}.` };
}

/* ------------------------------------------------------------------ */
/* Lo que el bot recibe: valores aprobados                             */
/* ------------------------------------------------------------------ */

export interface PayloadEmision {
  referencia: string;
  /** NIT de la empresa emisora: el bot verifica que sea la cuenta correcta. */
  nitEmisor: string;
  tipoFactura: string;
  moneda: string;
  fecha: string; // yyyy-mm-dd
  vencimiento: string;
  tipoPago: "Contado" | "Crédito";
  tipoOperacion: string;
  metodoPago: string;
  cliente: DatosFiscales;
  /** Si el cliente no existe en Finppi, ¿se autorizó crearlo? */
  crearCliente: boolean;
  items: { producto: string; descripcion: string; precio: number; cantidad: number; iva: IvaFinppi }[];
  totales: TotalesFe;
  /** Informativo, para el PDF de LOGIKS (no se escribe en Finppi). */
  original: { moneda: Moneda; trmReferencia: number; totales: TotalesFe };
}

export function payloadEmision(d: {
  referencia: string;
  nitEmisor: string;
  fecha: string;
  vencimiento: string;
  tipoPago: "Contado" | "Crédito";
  tipoOperacion: string;
  metodoPago: string;
  cliente: DatosFiscales;
  crearCliente: boolean;
  lineas: LineaFactura[];
  moneda: Moneda;
  trmReferencia: number;
}): PayloadEmision {
  const cop = lineasEnCop(d.lineas, d.moneda, d.trmReferencia);
  return {
    referencia: d.referencia,
    nitEmisor: documentoLimpio(d.nitEmisor),
    tipoFactura: FINPPI.tipoFactura[0],
    moneda: FINPPI.monedaCop,
    fecha: d.fecha,
    vencimiento: d.vencimiento,
    tipoPago: d.tipoPago,
    tipoOperacion: d.tipoOperacion,
    metodoPago: d.metodoPago,
    cliente: d.cliente,
    crearCliente: d.crearCliente,
    items: cop.map((l) => ({
      producto: l.productoFinppi ?? "",
      descripcion: l.descripcion.slice(0, 250),
      precio: l.precioCop,
      cantidad: l.cantidad,
      iva: l.iva,
    })),
    totales: totalesCop(cop),
    original: { moneda: d.moneda, trmReferencia: d.moneda === "USD" ? d.trmReferencia : 1, totales: totalesOriginales(cop) },
  };
}

/** Validaciones bloqueantes antes de encolar (§9A.6). */
export function bloqueosEmision(d: {
  moneda: Moneda;
  trmReferencia?: number;
  lineas: LineaFactura[];
  fiscal?: Partial<DatosFiscales>;
  metodoPago?: string;
  tipoOperacion?: string;
  tipoPago?: string;
  fecha: string;
  hoy: string;
  vencimiento?: string;
}): string[] {
  const b: string[] = [];
  if (d.moneda === "USD" && !(d.trmReferencia && d.trmReferencia > 1000 && d.trmReferencia < 20000)) {
    b.push("Escribe la TRM de referencia para convertir los dólares a pesos.");
  }
  if (!d.lineas.length) b.push("La factura no tiene conceptos.");
  if (d.lineas.some((l) => !l.productoFinppi)) b.push("Cada concepto necesita su producto o servicio de Finppi.");
  if (d.lineas.some((l) => !(l.cantidad > 0) || !(l.valorUnitario > 0))) b.push("Cantidades y precios deben ser mayores que cero.");
  const faltan = faltantesFiscales(d.fiscal);
  if (faltan.length) b.push(`Faltan datos fiscales del cliente: ${faltan.join(", ")}.`);
  if (!d.metodoPago) b.push("Elige el método de pago.");
  if (!d.tipoOperacion) b.push("Elige el tipo de operación.");
  if (!d.tipoPago) b.push("Elige el tipo de pago.");
  if (d.fecha > d.hoy) b.push("La fecha de la factura no puede ser futura.");
  if (d.vencimiento && d.vencimiento < d.fecha) b.push("El vencimiento no puede ser anterior a la fecha.");
  return b;
}
