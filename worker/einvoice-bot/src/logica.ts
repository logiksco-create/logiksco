/**
 * Reglas puras del bot (sin navegador ni base de datos), probadas en
 * test/logica.test.ts. Aquí viven las decisiones que no pueden fallar:
 * qué hacer con un error según el punto de no retorno, cuándo pausar todo,
 * cómo comparar NIT y cómo escribir fechas en el formato que use Finppi.
 */

export const CODIGOS = [
  "INVALID_CREDENTIALS",
  "ACCOUNT_LOCKED_OR_CHALLENGE",
  "WRONG_COMPANY",
  "PLATFORM_VALIDATION_ERROR",
  "SELECTOR_NOT_FOUND",
  "VALUES_MISMATCH",
  "CONSECUTIVE_GAP",
  "TIMEOUT",
  "PDF_INVALID",
  "UNKNOWN_AFTER_SUBMIT",
] as const;
export type CodigoError = (typeof CODIGOS)[number];

export class ErrorBot extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export type Desenlace =
  /** Antes del punto de no retorno: nada se emitió; se puede reintentar. */
  | { job: "fallido"; factura: "fallida"; reintentar: boolean }
  /** Después: puede haberse emitido. Nunca reintentar; buscar por referencia. */
  | { job: "desconocido"; factura: "estado_desconocido"; reconciliar: true }
  /** Bloqueo que necesita una persona (salto de consecutivo, PDF inválido). */
  | { job: "revision"; factura: "revision" };

/** §5: qué hacer con un error de emisión. */
export function desenlace(codigo: CodigoError, despuesDeEnviar: boolean): Desenlace {
  if (despuesDeEnviar) {
    if (codigo === "PDF_INVALID") return { job: "revision", factura: "revision" };
    return { job: "desconocido", factura: "estado_desconocido", reconciliar: true };
  }
  if (codigo === "CONSECUTIVE_GAP") return { job: "revision", factura: "revision" };
  // Reintentos automáticos solo por red/tiempo y solo antes de «Enviar».
  return { job: "fallido", factura: "fallida", reintentar: codigo === "TIMEOUT" };
}

/** Esperas entre reintentos (1, 5 y 30 minutos). */
export function esperaReintento(intento: number): number | null {
  const minutos = [1, 5, 30][intento - 1];
  return minutos === undefined ? null : minutos * 60_000;
}

/** Circuit breaker (§7): 2 SELECTOR_NOT_FOUND seguidos pausan todo. */
export function debePausar(ultimosCodigos: (CodigoError | null)[]): boolean {
  const [a, b] = ultimosCodigos.slice(-2);
  return a === "SELECTOR_NOT_FOUND" && b === "SELECTOR_NOT_FOUND";
}

/** ¿El texto de la cabecera de Finppi contiene el NIT de la empresa? */
export function mismoNit(textoCabecera: string, nit: string): boolean {
  const limpio = nit.replace(/[^0-9]/g, "").slice(0, 9);
  if (limpio.length < 6) return false;
  return textoCabecera.replace(/[^0-9]/g, "").includes(limpio);
}

/**
 * Escribe una fecha ISO (yyyy-mm-dd) en el mismo formato que muestra el
 * campo de Finppi (se lee antes de escribir). Formato por confirmar en Fase 0.
 */
export function fechaComoCampo(iso: string, valorActual: string): string {
  const [y, m, d] = iso.split("-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(valorActual)) return iso;
  if (/^\d{2}-\d{2}-\d{4}$/.test(valorActual)) return `${d}-${m}-${y}`;
  return `${d}/${m}/${y}`;
}

/** Quita lo que nunca debe quedar en un log (correos y claves). */
export function enmascarar(texto: string, secretos: string[] = []): string {
  let t = texto;
  for (const s of secretos.filter((x) => x && x.length >= 3)) t = t.split(s).join("••••");
  return t.replace(/([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*@/g, "$1***@");
}

/** Prefijo+número de una fila del listado: «ATFE» + «65» → «ATFE65». */
export function numeroDeFila(prefijo: string, numero: string): string {
  return `${prefijo.trim()}${numero.trim()}`.replace(/\s+/g, "").toUpperCase();
}

/** Opción del desplegable de producto: «CC5 - Chorizo…» → coincide con el código exacto. */
export function esOpcionDeProducto(textoOpcion: string, codigo: string): boolean {
  return textoOpcion.trim().startsWith(`${codigo} - `) || textoOpcion.trim() === codigo;
}

/** Para comparar textos de Finppi: sin tildes, sin mayúsculas, espacios simples, sin «*» final. */
export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
