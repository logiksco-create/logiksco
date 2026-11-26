/**
 * Valor en letras para la factura («Son: …»), en español de Colombia.
 * 2515.21 USD → «DOS MIL QUINIENTOS QUINCE DÓLARES CON VEINTIÚN CENTAVOS»
 * 20037580.3 COP → «VEINTE MILLONES TREINTA Y SIETE MIL QUINIENTOS OCHENTA PESOS CON TREINTA CENTAVOS M/CTE»
 */
import type { Moneda } from "./types";

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menorQueMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let t = "";
  if (r < 30) t = UNIDADES[r];
  else t = DECENAS[Math.floor(r / 10)] + (r % 10 ? ` Y ${UNIDADES[r % 10]}` : "");
  return [CENTENAS[c], t].filter(Boolean).join(" ");
}

/** «UNO» se apocopa delante de un sustantivo: VEINTIÚN DÓLARES, UN MILLÓN. */
function apocopar(t: string): string {
  return t.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/UNO$/, "UN");
}

export function numeroEnLetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "CERO";
  const partes: string[] = [];
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (millones) partes.push(millones === 1 ? "UN MILLÓN" : `${apocopar(numeroEnLetras(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? "MIL" : `${apocopar(menorQueMil(miles))} MIL`);
  if (resto) partes.push(menorQueMil(resto));
  return partes.join(" ");
}

export function enLetras(valor: number, moneda: Moneda): string {
  const centavos = Math.round(Math.abs(valor) * 100);
  const entero = Math.floor(centavos / 100);
  const cent = centavos % 100;
  const [singular, plural] = moneda === "USD" ? ["DÓLAR", "DÓLARES"] : ["PESO", "PESOS"];
  const redondo = entero % 1_000_000 === 0 && entero > 0;
  const base = entero === 1 ? `UN ${singular}` : `${apocopar(numeroEnLetras(entero))}${redondo ? " DE" : ""} ${plural}`;
  const conCent = cent ? ` CON ${apocopar(numeroEnLetras(cent))} ${cent === 1 ? "CENTAVO" : "CENTAVOS"}` : "";
  return `${base}${conCent}${moneda === "COP" ? " M/CTE" : ""}`;
}
