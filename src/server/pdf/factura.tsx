import "server-only";
import { Document, Page, Svg, Path, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CuentaFe, Empresa, Factura, Operacion, Tercero } from "@/domain/types";
import { esCufe, lineasEnCop, totalesCop, totalesOriginales, urlDian } from "@/domain/einvoice";
import { fecha, fechaHora } from "@/lib/formato";
import { logoParaPdf } from "./logo";
import { Dato, Encabezado, Marco, Oscura, QR, Seccion, T, e, marca, registrarFuentes } from "./sistema";

/**
 * Factura de LOGIKS.CO en el sistema «Manifiesto»: el cliente la lee en la
 * moneda en que se negoció (USD) y abajo están los valores fiscales en COP
 * con la TRM de referencia, el número, la fecha de validación, el CUFE y el
 * QR de la DIAN. Es la representación comercial; el documento válido ante
 * la DIAN es el que emite Finppi (que LOGIKS guarda sin modificar).
 */

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trmFmt = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cant = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

function Flecha({ color }: { color: string }) {
  return (
    <Svg width={22} height={12} viewBox="0 0 22 12">
      <Path d="M1 6h18M14 1.5L19.5 6 14 10.5" stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export async function pdfFactura(d: {
  f: Factura;
  empresa: Empresa;
  cliente: Tercero;
  operaciones: Operacion[];
  cuenta?: CuentaFe | null;
}) {
  registrarFuentes();
  const { f, empresa, cliente } = d;
  const m = marca(empresa);
  const logo = await logoParaPdf(empresa.logoUrl);
  const enUsd = f.moneda === "USD";
  const trm = enUsd ? f.trmReferencia ?? f.trm : 1;
  const lineas = lineasEnCop(f.lineas, f.moneda, trm);
  const tc = totalesCop(lineas);
  const to = totalesOriginales(lineas);
  const fmt = (n: number) => (enUsd ? usd.format(n) : cop.format(n));
  const emitida = f.estado === "emitida" && !!f.numero;
  const cufe = esCufe(f.cufe) ? f.cufe : undefined;
  const fiscal = cliente.fiscal ?? {};
  const consecutivosDO = f.operaciones.map((id) => d.operaciones.find((o) => o.id === id)?.consecutivo).filter(Boolean) as string[];
  const tieneTerceros = lineas.some((l) => l.tipo === "terceros");

  return renderToBuffer(
    <Document
      title={`Factura ${f.numero ?? "prefactura"}`}
      author={empresa.razonSocial}
      creator="LOGIKS.CO"
      language="es-CO"
    >
      <Page size="LETTER" style={e.pagina}>
        <Marco empresa={empresa} pie={`${empresa.razonSocial}  ·  Factura ${f.numero ?? "(sin emitir)"}`} />
        <Encabezado
          empresa={empresa}
          logo={logo}
          tipoDoc="Factura electrónica de venta"
          numero={f.numero ?? "PREFACTURA"}
          sub={emitida && f.fechaValidacion ? `validada DIAN ${fechaHora(f.fechaValidacion)}` : "vista previa · sin validez fiscal"}
        />

        {/* Bloque principal: cliente y total en la moneda negociada */}
        <Oscura estilo={{ flexDirection: "row", padding: 0 }}>
          <View style={{ flex: 1, padding: 18 }}>
            <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Facturado a</Text>
            <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 14, color: "#FFFFFF", marginTop: 4 }}>{cliente.razonSocial}</Text>
            <Text style={{ fontSize: 8, color: "#A8B2C8", marginTop: 3 }}>
              {fiscal.tipoDocumento ?? "NIT"} {fiscal.numeroDocumento ?? cliente.nit}
              {fiscal.ciudad ? `  ·  ${fiscal.ciudad}` : cliente.ciudad ? `  ·  ${cliente.ciudad}` : ""}
            </Text>
            {fiscal.direccion ? <Text style={{ fontSize: 8, color: "#A8B2C8", marginTop: 1.5 }}>{fiscal.direccion}</Text> : null}
            {fiscal.email ? <Text style={{ fontFamily: "Mono", fontSize: 7, color: "#8E9AB5", marginTop: 1.5 }}>{fiscal.email}</Text> : null}
            <View style={{ flexDirection: "row", marginTop: 14 }}>
              <Dato claro etiqueta="Emisión" valor={fecha(f.fechaValidacion ?? f.creadoEl)} />
              <Dato claro etiqueta="Vence" valor={fecha(f.vencimiento ?? f.creadoEl)} />
              <Dato claro etiqueta="Pago" valor={f.tipoPago ?? "—"} sub={f.metodoPago} flex={1.4} />
            </View>
          </View>
          {/* Talón con el total */}
          <View style={{ width: 170, borderLeftWidth: 1.2, borderLeftColor: "#2A3550", borderStyle: "dashed", padding: 18, justifyContent: "space-between" }}>
            <View>
              <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Total a pagar</Text>
              <Text style={{ fontFamily: "Mono", fontSize: 7.5, color: m.suave, marginTop: 6 }}>{f.moneda}</Text>
              <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 21, color: "#FFFFFF", letterSpacing: -0.4 }}>
                {fmt(to.total).replace("US$", "$").replace("COP", "").trim()}
              </Text>
            </View>
            <View>
              {enUsd && (
                <Text style={{ fontFamily: "Mono", fontSize: 7, color: "#A8B2C8" }}>
                  = {cop.format(tc.total)}
                </Text>
              )}
              {f.referencia ? <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: "#7F8BA6", marginTop: 4 }}>REF {f.referencia}</Text> : null}
              {consecutivosDO.length ? (
                <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: "#7F8BA6", marginTop: 2 }}>DO {consecutivosDO.join(", ")}</Text>
              ) : null}
            </View>
          </View>
        </Oscura>

        {/* Detalle */}
        <Seccion n="01" titulo="Detalle" derecha={`${lineas.length} concepto${lineas.length === 1 ? "" : "s"} · ${f.moneda}`} color={m.color} />
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: T.linea }}>
          <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: T.lavado, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
            <Text style={[e.etiqueta, { flex: 3.2 }]}>Concepto</Text>
            <Text style={[e.etiqueta, { flex: 0.7, textAlign: "right" }]}>Cant.</Text>
            <Text style={[e.etiqueta, { flex: 1.2, textAlign: "right" }]}>Unitario</Text>
            <Text style={[e.etiqueta, { flex: 0.8, textAlign: "right" }]}>IVA</Text>
            <Text style={[e.etiqueta, { flex: 1.3, textAlign: "right" }]}>Total</Text>
          </View>
          {lineas.map((l, i) => (
            <View key={i} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 12, paddingVertical: 4.5, borderTopWidth: i ? 1 : 0, borderTopColor: T.lavado }}>
              <View style={{ flex: 3.2, paddingRight: 8 }}>
                <Text style={{ fontSize: 8.6, color: T.tinta }}>{l.descripcion.replaceAll("→", "–")}</Text>
                <View style={{ flexDirection: "row", marginTop: 2 }}>
                  {l.productoFinppi ? <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.tenue, marginRight: 6 }}>{l.productoFinppi}</Text> : null}
                  {l.tipo === "terceros" ? (
                    <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.info }}>INGRESO PARA TERCEROS</Text>
                  ) : null}
                </View>
              </View>
              <Text style={{ flex: 0.7, textAlign: "right", fontFamily: "Mono", fontSize: 8, color: T.texto }}>{cant.format(l.cantidad)}</Text>
              <View style={{ flex: 1.2, alignItems: "flex-end" }}>
                <Text style={{ fontFamily: "Mono", fontSize: 8, color: T.texto }}>{fmt(l.precioOriginal)}</Text>
                {enUsd && <Text style={{ fontFamily: "Mono", fontSize: 6.3, color: T.tenue, marginTop: 1.5 }}>{cop.format(l.precioCop)}</Text>}
              </View>
              <Text style={{ flex: 0.8, textAlign: "right", fontFamily: "Mono", fontSize: 7.5, color: T.suave }}>{l.iva === "Ninguno" ? "—" : l.iva.replace("IVA-", "") + "%"}</Text>
              <View style={{ flex: 1.3, alignItems: "flex-end" }}>
                <Text style={{ fontFamily: "Mono", fontWeight: 600, fontSize: 8.4, color: T.tinta }}>{fmt(l.subtotalOriginal)}</Text>
                {enUsd && <Text style={{ fontFamily: "Mono", fontSize: 6.3, color: T.tenue, marginTop: 1.5 }}>{cop.format(l.subtotalCop)}</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Totales (USD → COP) y validación DIAN, lado a lado */}
        <Seccion n="02" titulo="Totales y validación DIAN" derecha={enUsd ? `TRM de referencia ${trmFmt.format(trm)}` : "Pesos colombianos"} color={m.color} />
        <View wrap={false} style={{ flexDirection: "row", alignItems: "stretch" }}>
          <View style={{ flex: 1.15, borderRadius: 12, borderWidth: 1, borderColor: T.linea, paddingVertical: 10, paddingHorizontal: 12 }}>
            <View style={{ flexDirection: "row", marginBottom: 4 }}>
              <Text style={[e.etiqueta, { flex: 1 }]}> </Text>
              <Text style={[e.etiqueta, { width: 78, textAlign: "right", color: m.oscuro }]}>{f.moneda}</Text>
              {enUsd && (
                <View style={{ width: 104, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
                  <Flecha color={m.color} />
                  <Text style={[e.etiqueta, { color: m.oscuro, marginLeft: 4 }]}>COP · DIAN</Text>
                </View>
              )}
            </View>
            {(
              [
                ["Subtotal", to.subtotal, tc.subtotal],
                ...(to.terceros > 0 ? [["Incluye terceros", to.terceros, tc.terceros] as const] : []),
                ["IVA", to.iva, tc.iva],
              ] as const
            ).map(([et, a, c]) => (
              <View key={et} style={{ flexDirection: "row", paddingVertical: 2.2 }}>
                <Text style={{ flex: 1, fontSize: 8, color: T.suave }}>{et}</Text>
                <Text style={{ width: 78, textAlign: "right", fontFamily: "Mono", fontSize: 8, color: T.tinta }}>{fmt(a)}</Text>
                {enUsd && <Text style={{ width: 104, textAlign: "right", fontFamily: "Mono", fontSize: 8, color: T.texto }}>{cop.format(c)}</Text>}
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: T.linea, marginVertical: 5 }} />
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ flex: 1, fontFamily: "Grotesk", fontWeight: 700, fontSize: 10, color: T.tinta }}>Total</Text>
              <Text style={{ width: 78, textAlign: "right", fontFamily: "Mono", fontWeight: 600, fontSize: 9.5, color: T.tinta }}>{fmt(to.total)}</Text>
              {enUsd && (
                <Text style={{ width: 104, textAlign: "right", fontFamily: "Mono", fontWeight: 600, fontSize: 9, color: m.oscuro }}>{cop.format(tc.total)}</Text>
              )}
            </View>
          </View>

          <View style={{ width: 10 }} />

          <View style={{ flex: 1, borderRadius: 12, backgroundColor: T.lavado, padding: 10, flexDirection: "row" }}>
            {cufe ? (
              <QR texto={urlDian(cufe)} tam={70} />
            ) : (
              <View style={{ width: 70, height: 70, borderRadius: 8, borderWidth: 1.2, borderColor: T.linea, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: "Mono", fontSize: 6.3, color: T.tenue, textAlign: "center" }}>QR AL{"\n"}EMITIR</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View>
                  <Text style={e.etiqueta}>Número</Text>
                  <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 11, color: T.tinta, marginTop: 2 }}>{f.numero ?? "Al emitir"}</Text>
                </View>
                {f.simulada ? (
                  <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.alerta, borderWidth: 1, borderColor: T.alerta, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1.5 }}>SIMULACIÓN</Text>
                ) : !emitida ? (
                  <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.tenue, borderWidth: 1, borderColor: T.linea, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1.5 }}>BORRADOR</Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 7, color: T.suave, marginTop: 2 }}>
                {f.fechaValidacion ? `Validada ${fechaHora(f.fechaValidacion)}` : "Sin validar"}
              </Text>
              <Text style={[e.etiqueta, { marginTop: 6 }]}>CUFE</Text>
              <Text style={{ fontFamily: "Mono", fontSize: 5.6, color: T.tinta, marginTop: 1.5, lineHeight: 1.3 }}>
                {cufe ? cufe.match(/.{1,32}/g)!.join("\n") : "Se genera cuando la DIAN valida la factura."}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          {d.cuenta?.resolucion ? <Text style={{ fontSize: 7, color: T.suave, lineHeight: 1.4 }}>{d.cuenta.resolucion}</Text> : null}
          <Text style={{ fontSize: 7, color: T.suave, lineHeight: 1.4, marginTop: 3 }}>
            {enUsd
              ? `Representación comercial en dólares de la factura electrónica ${f.numero ?? ""}. Ante la DIAN la factura se emitió en pesos colombianos con la TRM de referencia ${trmFmt.format(trm)}; los valores fiscales son los de la columna en COP. `
              : `Representación comercial de la factura electrónica ${f.numero ?? ""}. `}
            {tieneTerceros ? "Los ingresos para terceros corresponden a pagos hechos por cuenta del cliente y no hacen parte del ingreso propio. " : ""}
            {cufe ? "Escanea el QR o consulta el CUFE en catalogo-vpfe.dian.gov.co para verificarla." : ""}
          </Text>
        </View>
      </Page>
    </Document>,
  );
}
