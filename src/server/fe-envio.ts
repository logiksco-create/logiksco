import "server-only";
import type { Factura } from "@/domain/types";
import type { Repositorio } from "./datos/repositorio";
import { notificar } from "./notificaciones";
import { pdfFactura } from "./pdf/factura";
import { lineasEnCop, totalesOriginales, urlDian } from "@/domain/einvoice";
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
  const [cliente, operaciones, cuenta] = await Promise.all([repo.tercero(f.clienteId), repo.operaciones(), repo.cuentaFe()]);
  if (!cliente) throw new ErrorNegocio("El cliente no existe");
  const para = correosFacturacion(cliente);
  if (!para.length) throw new ErrorNegocio("El cliente no tiene correo de facturación");
  const pdf = await pdfFactura({ f, empresa: repo.empresa, cliente, operaciones, cuenta });
  const adjuntos: Adjunto[] = [{ nombre: `Factura ${f.numero} - ${repo.empresa.razonSocial}.pdf`, contenido: new Uint8Array(pdf) }];
  const original = await repo.descargarArchivoFe(f.id, "pdf").catch(() => null);
  if (original && "bytes" in original) adjuntos.push({ nombre: `Factura ${f.numero} - DIAN (original).pdf`, contenido: original.bytes });
  const xml = await repo.descargarArchivoFe(f.id, "xml").catch(() => null);
  if (xml && "bytes" in xml) adjuntos.push({ nombre: `Factura ${f.numero}.xml`, contenido: xml.bytes });

  const t = totalesOriginales(lineasEnCop(f.lineas, f.moneda, f.trmReferencia ?? f.trm)).total;
  const total = `${f.moneda === "USD" ? "US$" : "$"} ${t.toLocaleString(f.moneda === "USD" ? "en-US" : "es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const r = await notificar(repo, {
    entidad: "tercero",
    entidadId: cliente.id,
    para,
    asunto: `Factura ${f.numero} · ${repo.empresa.razonSocial}${f.simulada ? " (simulación)" : ""}`,
    titulo: `Tu factura ${f.numero}`,
    parrafos: [
      `Hola, adjuntamos la factura electrónica ${f.numero}${total ? ` por ${total}` : ""}.`,
      f.moneda === "USD"
        ? "El PDF de LOGIKS la muestra en dólares; ante la DIAN se emitió en pesos con la TRM de referencia indicada. También adjuntamos el documento original validado por la DIAN."
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
