import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { ErrorBot } from "./logica.ts";
import { extraerCufe } from "../../../src/domain/einvoice.ts";

/**
 * Solo LEE el PDF original de Finppi (nunca lo reescribe) para validar que
 * trae CUFE, número y NIT del emisor (§5.5). El hash se calcula sobre los
 * bytes originales, que se guardan tal cual.
 */
export async function validarPdf(bytes: Uint8Array, esperado: { numero: string; nit: string }) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let text: string;
  try {
    // Copia: pdf.js puede transferir el búfer que recibe.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    text = (await extractText(pdf, { mergePages: true })).text;
  } catch {
    throw new ErrorBot("PDF_INVALID", "El archivo descargado de Finppi no es un PDF legible");
  }
  const cufe = extraerCufe(text);
  const plano = text.replace(/\s+/g, "");
  if (!cufe) throw new ErrorBot("PDF_INVALID", "El PDF de Finppi no trae un CUFE legible");
  if (!plano.toUpperCase().includes(esperado.numero.toUpperCase())) {
    throw new ErrorBot("PDF_INVALID", `El PDF no muestra el número ${esperado.numero}`);
  }
  if (!plano.replace(/[.\-]/g, "").includes(esperado.nit)) throw new ErrorBot("PDF_INVALID", "El PDF no muestra el NIT del emisor");
  return { cufe, sha256 };
}
