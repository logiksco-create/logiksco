import "server-only";
import type { Factura } from "@/domain/types";
import type { Repositorio } from "./datos/repositorio";
import { notificar } from "./notificaciones";
import { pdfFactura } from "./pdf/factura";
import { datosPdfFactura } from "./fe-datos-pdf";
import { lineasEnCop, presentacionEfectiva, totalesCop, totalesOriginales, urlDian } from "@/domain/einvoice";
import type { Adjunto } from "./correo";
import { ErrorNegocio } from "./datos/errores";

/** Correos de facturación del cliente: los fiscales; si no hay, sus contactos. */
export function correosFacturacion(cliente: { fiscal?: { email?: string }; contactos: { correo?: string }[] }): string[] {
  const fiscales = (cliente.fiscal?.email ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (fiscales.length) return fiscales;
  return cliente.contactos.map((c) => c.correo ?? "").filter(Boolean).slice(0, 2);
}

/**
 * Envía al cliente la factura de LOGIKS (USD) y, si existe, el PDF original
 * de Finppi sin modificar. Queda en la trazabilidad del cliente.
 */
export async function enviarFacturaAlCliente(repo: Repositorio, f: Factura) {
  const datos = await datosPdfFactura(repo, f);
  if (!datos) throw new ErrorNegocio("El cliente no existe");
  const { cliente } = datos;
  const para = correosFacturacion(cliente);
  if (!para.length) throw new ErrorNegocio("El cliente no tiene correo de facturación");
  const pdf = await pdfFactura(datos);
  const adjuntos: Adjunto[] = [{ nombre: `Factura ${f.numero} - ${repo.empresa.razonSocial}.pdf`, contenido: new Uint8Array(pdf) }];
  // En «solo dólares» no se adjunta el PDF de la DIAN (está en pesos); el XML sí.
  const modo = presentacionEfectiva(f, datos.cuenta);
  const soloDolares = f.moneda === "USD" && modo === "usd";
  const original = soloDolares ? null : await repo.descargarArchivoFe(f.id, "pdf").catch(() => null);
  if (original && "bytes" in original) adjuntos.push({ nombre: `Factura ${f.numero} - DIAN (original).pdf`, contenido: original.bytes });
  const xml = await repo.descargarArchivoFe(f.id, "xml").catch(() => null);
  if (xml && "bytes" in xml) adjuntos.push({ nombre: `Factura ${f.numero}.xml`, contenido: xml.bytes });

  const cop = lineasEnCop(f.lineas, f.moneda, f.trmReferencia ?? f.trm);
  const enPesos = f.moneda === "COP" || modo === "cop";
  const t = enPesos ? totalesCop(cop).total : totalesOriginales(cop).total;
  const total = `${enPesos ? "$" : "US$"} ${t.toLocaleString(enPesos ? "es-CO" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const r = await notificar(repo, {
    entidad: "tercero",
    entidadId: cliente.id,
    para,
    asunto: `Factura ${f.numero} · ${repo.empresa.razonSocial}${f.simulada ? " (simulación)" : ""}`,
    titulo: `Tu factura ${f.numero}`,
    parrafos: [
      `Hola, adjuntamos la factura electrónica ${f.numero}${total ? ` por ${total}` : ""}.`,
      soloDolares
        ? "Adjuntamos la factura en dólares y su archivo electrónico (XML) validado por la DIAN."
        : f.moneda === "USD" && modo === "ambas"
          ? "El PDF de LOGIKS la muestra en dólares con su equivalente en pesos; también adjuntamos el documento original validado por la DIAN."
          : "También adjuntamos el documento original validado por la DIAN.",
      ...(f.simulada ? ["Esta es una emisión simulada del modo demo: no tiene validez ante la DIAN."] : []),
    ],
    boton: f.cufe && !f.simulada ? { texto: "Verificar en la DIAN", url: urlDian(f.cufe) } : undefined,
    adjuntos,
    resumen: `Factura ${f.numero} enviada al cliente con ${adjuntos.length} adjunto${adjuntos.length > 1 ? "s" : ""}.`,
  });
  await repo.marcarFacturaEnviada(f.id);
  return { enviado: r.enviado, para };
}
