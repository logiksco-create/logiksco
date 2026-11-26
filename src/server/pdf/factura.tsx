import "server-only";
import { Document, Image, Page, Path, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Cotizacion, CuentaFe, Empresa, Factura, Operacion, Tercero } from "@/domain/types";
import { TIPOS_SERVICIO } from "@/domain/types";
import { esCufe, lineasEnCop, presentacionEfectiva, pctIva, totalesCop, totalesOriginales, urlDian, type LineaCop } from "@/domain/einvoice";
import { enLetras } from "@/domain/letras";
import { fecha, fechaHora } from "@/lib/formato";
import { logoParaPdf } from "./logo";
import { IconoServicio, Marco, Oscura, QR, Ruta, T, codigoLugar, e, marca, partirLugar, registrarFuentes } from "./sistema";

/**
 * Factura electrónica de venta de LOGIKS.CO para operadores logísticos.
 * Estructura de una factura de agencia de carga colombiana (información
 * tributaria y QR arriba, datos de la operación, ingresos para terceros y
 * propios por separado, detalle de impuestos, valor en letras y firma de
 * recibido) con el sistema visual «Manifiesto».
 *
 * Se lee en la moneda negociada (USD) y lleva al lado los valores fiscales
 * en COP con la TRM de referencia. Es la representación comercial; el
 * documento válido ante la DIAN es el que emite Finppi.
 */

export interface DatosPdfFactura {
  f: Factura;
  empresa: Empresa;
  cliente: Tercero;
  operaciones: Operacion[];
  cotizacion?: Cotizacion | null;
  comercial?: string;
  cuenta?: CuentaFe | null;
}

const COP = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const USD = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CANT = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const UM: Record<string, string> = { contenedor: "Cont", kg: "Kg", m3: "m³", embarque: "Und" };

const claro = { etiqueta: "#7F8BA6", texto: "#A8B2C8", linea: "#26324D" };

function Flecha({ color, ancho = 18 }: { color: string; ancho?: number }) {
  return (
    <Svg width={ancho} height={10} viewBox={`0 0 ${ancho} 10`}>
      <Path d={`M1 5h${ancho - 3}M${ancho - 7} 1.5L${ancho - 2} 5 ${ancho - 7} 8.5`} stroke={color} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Par etiqueta / valor en una ficha. */
function Par({ k, v, mono, ancho = 62 }: { k: string; v?: string; mono?: boolean; ancho?: number }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 0.8 }}>
      <Text style={[e.etiqueta, { width: ancho, paddingTop: 1 }]}>{k}</Text>
      <Text style={{ flex: 1, fontSize: 8, color: v ? T.tinta : T.tenue, fontFamily: mono ? "Mono" : "Manrope", fontWeight: mono ? 400 : 600 }}>{v || "—"}</Text>
    </View>
  );
}

function Ficha({ titulo, color, children }: { titulo: string; color: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: T.linea, paddingHorizontal: 11, paddingVertical: 7 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color, marginRight: 5 }} />
        <Text style={[e.etiqueta, { color: T.suave }]}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

export async function pdfFactura(d: DatosPdfFactura) {
  registrarFuentes();
  const { f, empresa, cliente } = d;
  const m = marca(empresa);
  const logo = await logoParaPdf(empresa.logoUrl);
  const negociadaUsd = f.moneda === "USD";
  const trm = negociadaUsd ? f.trmReferencia ?? f.trm : 1;
  // Qué ve el cliente: solo USD, USD y COP, o solo COP (elige la empresa o la factura).
  const modo = presentacionEfectiva(f, d.cuenta);
  const soloCop = negociadaUsd && modo === "cop";
  const muestraPesos = !negociadaUsd || modo !== "usd";
  /** Columna COP adicional al lado de la moneda negociada. */
  const enUsd = negociadaUsd && modo === "ambas";
  const monedaVista = soloCop ? "COP" : f.moneda;
  const base = lineasEnCop(f.lineas, f.moneda, trm);
  const lineas: LineaCop[] = soloCop
    ? base.map((l) => ({ ...l, precioOriginal: l.precioCop, subtotalOriginal: l.subtotalCop, ivaOriginal: l.ivaCop }))
    : base;
  const tc = totalesCop(lineas);
  const to = totalesOriginales(lineas);
  const mon = (n: number) => (monedaVista === "USD" ? USD.format(n) : COP.format(n));
  const emitida = f.estado === "emitida" && !!f.numero;
  const cufe = esCufe(f.cufe) ? f.cufe : undefined;
  const fiscal = cliente.fiscal ?? {};
  const contacto = cliente.contactos.find((c) => c.id === d.cotizacion?.contactoId) ?? cliente.contactos[0];
  const op = d.operaciones[0];
  const q = d.cotizacion;
  const merc = q?.mercancia;
  const origen = op?.origen ?? q?.origen;
  const destino = op?.destino ?? q?.destino;
  const tipo = op?.tipo ?? q?.tipoServicio;

  // Agrupación como en las agencias de carga: terceros primero, luego propios.
  const grupos: { titulo: string; lineas: LineaCop[] }[] = [
    { titulo: "Ingresos recibidos para terceros", lineas: lineas.filter((l) => l.tipo === "terceros") },
    { titulo: "Ingresos propios", lineas: lineas.filter((l) => l.tipo === "propio") },
  ].filter((g) => g.lineas.length);

  // Detalle de impuestos por tarifa.
  const tarifas = new Map<number, { base: number; valor: number; baseCop: number; valorCop: number }>();
  for (const l of lineas) {
    const pct = pctIva(l.iva);
    if (!pct) continue;
    const t = tarifas.get(pct) ?? { base: 0, valor: 0, baseCop: 0, valorCop: 0 };
    t.base += l.subtotalOriginal;
    t.valor += l.ivaOriginal;
    t.baseCop += l.subtotalCop;
    t.valorCop += l.ivaCop;
    tarifas.set(pct, t);
  }
  const noGravado = lineas.filter((l) => !pctIva(l.iva));
  const exc = { o: noGravado.reduce((s, l) => s + l.subtotalOriginal, 0), c: noGravado.reduce((s, l) => s + l.subtotalCop, 0) };
  const grav = { o: to.subtotal - exc.o, c: tc.subtotal - exc.c };

  const totalesFila: [string, number, number, ("fuerte" | "pagar")?][] = [
    ["Excluido / no gravado", exc.o, exc.c],
    ["Base gravada", grav.o, grav.c],
    ["Total IVA", to.iva, tc.iva],
    ["Total general", to.total, tc.total, "fuerte"],
    ["Abonos / notas crédito", 0, 0],
    ["Valor a pagar", to.total, tc.total, "pagar"],
  ];

  const generada = f.fechaValidacion ?? f.creadoEl;
  const anchoMon = enUsd ? 50 : monedaVista === "USD" ? 64 : 72;
  /** Ancho de la columna principal de totales (los pesos son más largos). */
  const wPrim = !enUsd && monedaVista === "COP" ? 86 : 62;

  return renderToBuffer(
    <Document title={`Factura ${f.numero ?? "prefactura"}`} author={empresa.razonSocial} creator="LOGIKS.CO" language="es-CO">
      <Page size="LETTER" style={[e.pagina, { paddingTop: 26 }]}>
        <Marco empresa={empresa} pie={`${empresa.razonSocial}  ·  NIT ${empresa.nit}  ·  Factura ${f.numero ?? "(sin emitir)"}`} />

        {/* ============ Encabezado: emisor · información tributaria · QR · número ============ */}
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ width: 132, paddingRight: 8 }}>
            {logo ? (
              <>
                <Image src={logo} style={{ maxHeight: 32, maxWidth: 140, objectFit: "contain" }} />
                <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 8.5, color: T.tinta, marginTop: 4 }}>{empresa.razonSocial}</Text>
              </>
            ) : (
              <Text style={[e.titulo, { fontSize: 13 }]}>{empresa.razonSocial}</Text>
            )}
            <Text style={{ fontFamily: "Mono", fontSize: 7, color: T.suave, marginTop: 2 }}>NIT {empresa.nit}</Text>
            {empresa.ciudad ? <Text style={{ fontSize: 7, color: T.suave, marginTop: 1 }}>{empresa.ciudad}</Text> : null}
          </View>
          <View style={{ flex: 1, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: T.linea }}>
            <Text style={[e.etiqueta, { marginBottom: 2 }]}>Información tributaria</Text>
            <Text style={{ fontSize: 6.4, lineHeight: 1.35, color: T.suave }}>
              {d.cuenta?.resolucion || "Configura la información tributaria y la resolución DIAN en Configuración → Facturación electrónica."}
            </Text>
          </View>
          <View style={{ width: 66, alignItems: "center", marginHorizontal: 6 }}>
            {cufe ? (
              <QR texto={urlDian(cufe)} tam={64} />
            ) : (
              <View style={{ width: 64, height: 64, borderRadius: 6, borderWidth: 1.1, borderColor: T.linea, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: "Mono", fontSize: 5.8, color: T.tenue, textAlign: "center" }}>QR DIAN{"\n"}AL EMITIR</Text>
              </View>
            )}
          </View>
          <View style={{ width: 120, alignItems: "flex-end" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: m.color, marginRight: 4 }} />
              <Text style={[e.etiqueta, { color: m.oscuro, fontSize: 6 }]}>Factura electrónica de venta</Text>
            </View>
            <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 21, color: T.tinta, letterSpacing: -0.4, marginTop: 2 }}>{f.numero ?? "PREFACTURA"}</Text>
            <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.suave, marginTop: 2, textAlign: "right" }}>
              {emitida ? `Generada ${fechaHora(generada)}` : "Vista previa · sin validez fiscal"}
            </Text>
            {f.simulada || !emitida ? (
              <Text
                style={{
                  marginTop: 4,
                  fontFamily: "Mono",
                  fontWeight: 600,
                  fontSize: 6.2,
                  letterSpacing: 0.8,
                  color: f.simulada ? T.alerta : T.suave,
                  borderWidth: 1,
                  borderColor: f.simulada ? T.alerta : T.linea,
                  borderRadius: 4,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                }}
              >
                {f.simulada ? "SIMULACIÓN · DEMO" : "BORRADOR"}
              </Text>
            ) : null}
          </View>
        </View>

        {/* CUFE */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: T.lavado, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4.5, marginTop: 8 }}>
          <Text style={[e.etiqueta, { marginRight: 8 }]}>CUFE</Text>
          <Text style={{ fontFamily: "Mono", fontSize: 5.9, color: cufe ? T.tinta : T.tenue }}>{cufe ?? "Se asigna cuando la DIAN valida la factura"}</Text>
        </View>

        {/* ============ Operación (boleto oscuro) ============ */}
        <Oscura estilo={{ marginTop: 8, paddingVertical: 8, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 118 }}>
              <Text style={[e.etiqueta, { color: claro.etiqueta }]}>Operación</Text>
              <Text style={{ fontFamily: "Mono", fontWeight: 600, fontSize: 9.5, color: "#FFFFFF", marginTop: 3 }}>
                {d.operaciones.map((o) => o.consecutivo).join("\n") || "—"}
              </Text>
              {tipo ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                  <IconoServicio tipo={tipo} color={m.suave} tam={9} />
                  <Text style={{ fontSize: 7, color: claro.texto, marginLeft: 4 }}>
                    {TIPOS_SERVICIO[tipo]}
                    {q?.incoterm ? `  ·  ${q.incoterm}` : ""}
                  </Text>
                </View>
              ) : null}
            </View>
            {origen && destino && tipo ? (
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                <View style={{ alignItems: "flex-end", width: 70 }}>
                  <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 19, color: "#FFFFFF" }}>{codigoLugar(origen)}</Text>
                  <Text style={{ fontSize: 6.8, color: claro.texto, textAlign: "right" }}>{partirLugar(origen).ciudad}</Text>
                </View>
                <View style={{ marginHorizontal: 8 }}>
                  <Ruta ancho={96} color={m.color} tipo={tipo} />
                </View>
                <View style={{ width: 70 }}>
                  <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 19, color: "#FFFFFF" }}>{codigoLugar(destino)}</Text>
                  <Text style={{ fontSize: 6.8, color: claro.texto }}>{partirLugar(destino).ciudad}</Text>
                </View>
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <View style={{ width: 120, alignItems: "flex-end" }}>
              <Text style={[e.etiqueta, { color: claro.etiqueta }]}>{negociadaUsd && muestraPesos ? "TRM de referencia" : "Moneda"}</Text>
              <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 14, color: "#FFFFFF", marginTop: 2 }}>
                {negociadaUsd && muestraPesos ? COP.format(trm) : monedaVista}
              </Text>
              <Text style={{ fontSize: 6.8, color: claro.texto, marginTop: 1 }}>
                {!negociadaUsd ? "Pesos colombianos" : modo === "usd" ? "Dólares estadounidenses" : modo === "cop" ? "Negociada en USD · valores en COP" : "Factura en USD · DIAN en COP"}
              </Text>
            </View>
          </View>
          {merc && (merc.descripcion || merc.piezas || merc.pesoKg) ? (
            <View style={{ flexDirection: "row", marginTop: 6, paddingTop: 5, borderTopWidth: 1, borderTopColor: claro.linea }}>
              {(
                [
                  ["Mercancía", merc.descripcion || "—", 2.6],
                  ["Piezas", merc.piezas ? CANT.format(merc.piezas) : "—", 1],
                  ["Peso", merc.pesoKg ? `${CANT.format(merc.pesoKg)} kg` : "—", 1],
                  ["Volumen", merc.volumenM3 ? `${CANT.format(merc.volumenM3)} m³` : "—", 1],
                ] as const
              ).map(([k, v, flex]) => (
                <View key={k} style={{ flex, paddingRight: 6 }}>
                  <Text style={[e.etiqueta, { color: claro.etiqueta, fontSize: 5.8 }]}>{k}</Text>
                  <Text style={{ fontSize: 8, color: "#FFFFFF", fontWeight: 600, marginTop: 2 }}>{v}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Oscura>

        {/* ============ Cliente y condiciones ============ */}
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <Ficha titulo="Facturado a" color={m.color}>
            <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 10.5, color: T.tinta, marginBottom: 3 }}>{cliente.razonSocial}</Text>
            <Par k={fiscal.tipoDocumento ?? "NIT"} v={fiscal.numeroDocumento ?? cliente.nit} mono />
            <Par k="Contacto" v={contacto?.nombre} />
            <Par k="Teléfono" v={fiscal.telefono || contacto?.telefono} mono />
            <Par k="Dirección" v={[fiscal.direccion, fiscal.ciudad ?? cliente.ciudad].filter(Boolean).join(" · ")} />
            <Par k="Correo" v={fiscal.email || contacto?.correo} mono />
          </Ficha>
          <View style={{ width: 9 }} />
          <Ficha titulo="Condiciones" color={m.color}>
            <View style={{ flexDirection: "row", marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={e.etiqueta}>Emisión</Text>
                <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 10.5, color: T.tinta, marginTop: 1 }}>{fecha(generada)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={e.etiqueta}>Vence</Text>
                <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 10.5, color: m.oscuro, marginTop: 1 }}>{fecha(f.vencimiento ?? generada)}</Text>
              </View>
            </View>
            <Par k="Forma de pago" v={f.tipoPago} ancho={70} />
            <Par k="Medio de pago" v={f.metodoPago} ancho={70} />
            <Par k="Ejecutivo" v={d.comercial} ancho={70} />
            <Par k="Referencia" v={f.referencia} mono ancho={70} />
          </Ficha>
        </View>

        {/* ============ Detalle ============ */}
        <View style={{ marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: T.linea }}>
          <View style={{ flexDirection: "row", paddingHorizontal: 10, paddingVertical: 5, backgroundColor: T.tinta, borderTopLeftRadius: 9, borderTopRightRadius: 9 }}>
            {(
              [
                ["Cant.", 34, "right"],
                ["Código", 56, "left"],
                ["U/M", 24, "left"],
                ["Descripción", 0, "left"],
                [`Unitario ${monedaVista}`, anchoMon + 4, "right"],
                [`Total ${monedaVista}`, anchoMon + 6, "right"],
                ...(enUsd ? ([["Total COP", 74, "right"]] as const) : []),
              ] as const
            ).map(([t, w, a]) => (
              <Text key={t} style={[e.etiqueta, { color: "#C9D1E3", fontSize: 5.8, letterSpacing: 0.8, textAlign: a, ...(w ? { width: w } : { flex: 1, paddingLeft: 6 }), paddingLeft: t === "Código" ? 10 : w ? 0 : 6 }]}>
                {t}
              </Text>
            ))}
          </View>
          {grupos.map((g, gi) => {
            const sub = g.lineas.reduce((s, l) => s + l.subtotalOriginal, 0);
            const subCop = g.lineas.reduce((s, l) => s + l.subtotalCop, 0);
            const terceros = g.lineas[0].tipo === "terceros";
            return (
              <View key={g.titulo}>
                <View wrap={false} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingTop: 5, paddingBottom: 1.5 }}>
                  <View style={{ width: 3, height: 9, borderRadius: 1.5, backgroundColor: terceros ? T.info : m.color, marginRight: 6 }} />
                  <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 8.4, color: T.tinta }}>{g.titulo}</Text>
                  <Text style={{ fontFamily: "Mono", fontSize: 6.3, color: T.tenue, marginLeft: 6 }}>
                    {terceros ? "pagos por cuenta del cliente · sin IVA" : "servicios de la agencia"}
                  </Text>
                </View>
                {g.lineas.map((l, i) => (
                  <View key={i} wrap={false} style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 10, paddingVertical: 2.6, borderBottomWidth: 0.6, borderBottomColor: T.lavado }}>
                    <Text style={{ width: 34, textAlign: "right", fontFamily: "Mono", fontSize: 7.4, color: T.texto }}>{CANT.format(l.cantidad)}</Text>
                    <Text style={{ width: 56, paddingLeft: 10, fontFamily: "Mono", fontSize: 6.4, color: T.suave }}>{l.productoFinppi ?? "—"}</Text>
                    <Text style={{ width: 24, fontFamily: "Mono", fontSize: 6.4, color: T.suave }}>{UM[f.lineas[lineas.indexOf(l)]?.unidad ?? "embarque"] ?? "Und"}</Text>
                    <View style={{ flex: 1, paddingLeft: 6, paddingRight: 4 }}>
                      <Text style={{ fontSize: 7.4, color: T.tinta }}>
                        {l.descripcion.replaceAll("→", "–")}
                        {pctIva(l.iva) ? <Text style={{ fontFamily: "Mono", fontSize: 6, color: T.tenue }}>{`  IVA ${pctIva(l.iva)}%`}</Text> : null}
                      </Text>
                    </View>
                    <Text style={{ width: anchoMon + 4, textAlign: "right", fontFamily: "Mono", fontSize: 7.4, color: T.texto }}>{mon(l.precioOriginal)}</Text>
                    <Text style={{ width: anchoMon + 6, textAlign: "right", fontFamily: "Mono", fontWeight: 600, fontSize: 7.6, color: T.tinta }}>{mon(l.subtotalOriginal)}</Text>
                    {enUsd && <Text style={{ width: 74, textAlign: "right", fontFamily: "Mono", fontSize: 6.8, color: T.suave }}>{COP.format(l.subtotalCop)}</Text>}
                  </View>
                ))}
                <View wrap={false} style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 10, paddingVertical: 3.5, backgroundColor: T.lavado, ...(gi === grupos.length - 1 ? { borderBottomLeftRadius: 9, borderBottomRightRadius: 9 } : {}) }}>
                  {gi === grupos.length - 1 ? (
                    <Text style={{ flex: 1, fontFamily: "Mono", fontSize: 6.2, color: T.tenue }}>Número de ítems: {lineas.length}</Text>
                  ) : null}
                  <Text style={[e.etiqueta, { marginRight: 8 }]}>Subtotal {terceros ? "terceros" : "propios"}</Text>
                  <Text style={{ width: anchoMon + 6, textAlign: "right", fontFamily: "Mono", fontWeight: 600, fontSize: 7.8, color: T.tinta }}>{mon(sub)}</Text>
                  {enUsd && <Text style={{ width: 74, textAlign: "right", fontFamily: "Mono", fontSize: 7, color: T.suave }}>{COP.format(subCop)}</Text>}
                </View>
              </View>
            );
          })}
        </View>

        {/* ============ Impuestos y valor en letras · Totales ============ */}
        <View wrap={false} style={{ flexDirection: "row", marginTop: 8 }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[e.etiqueta, { marginBottom: 3 }]}>Detalle de impuestos</Text>
            <View style={{ borderRadius: 7, borderWidth: 1, borderColor: T.linea, paddingHorizontal: 8, paddingVertical: 3 }}>
              {tarifas.size === 0 ? (
                <Text style={{ fontSize: 7, color: T.suave, paddingVertical: 1 }}>Sin impuestos: todos los conceptos son excluidos o no gravados.</Text>
              ) : (
                [...tarifas.entries()].map(([pct, t]) => (
                  <View key={pct} style={{ flexDirection: "row", alignItems: "baseline", paddingVertical: 1.2 }}>
                    <Text style={{ width: 46, fontSize: 7.4, fontWeight: 700, color: T.tinta }}>IVA {pct}%</Text>
                    <Text style={[e.etiqueta, { fontSize: 5.6, marginRight: 4 }]}>Base</Text>
                    <Text style={{ flex: 1, fontFamily: "Mono", fontSize: 7, color: T.texto }}>{mon(t.base)}</Text>
                    <Text style={[e.etiqueta, { fontSize: 5.6, marginRight: 4 }]}>Valor</Text>
                    <Text style={{ fontFamily: "Mono", fontSize: 7, color: T.tinta }}>{mon(t.valor)}</Text>
                  </View>
                ))
              )}
            </View>
            <View style={{ marginTop: 6, borderLeftWidth: 2, borderLeftColor: m.color, paddingLeft: 7 }}>
              <Text style={e.etiqueta}>Son</Text>
              <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 7.8, color: T.tinta, marginTop: 1.5, lineHeight: 1.35 }}>{enLetras(to.total, monedaVista)}</Text>
              {enUsd && (
                <Text style={{ fontSize: 6.6, color: T.suave, marginTop: 2, lineHeight: 1.35 }}>
                  Equivalente fiscal: {enLetras(tc.total, "COP")}
                </Text>
              )}
            </View>
            <View style={{ marginTop: 7 }}>
              <Text style={[e.etiqueta, { marginBottom: 2 }]}>Observaciones y condiciones</Text>
              <Text style={{ fontSize: 6.1, color: T.texto, lineHeight: 1.35 }}>
                {negociadaUsd && muestraPesos ? `Factura negociada en dólares; ante la DIAN se emitió en pesos con la TRM de referencia ${COP.format(trm)}. ` : ""}
                {negociadaUsd && !muestraPesos ? "Valores en dólares estadounidenses. " : ""}
                {d.cuenta?.condiciones ?? ""}
              </Text>
              <Text style={{ fontSize: 5.8, color: T.suave, lineHeight: 1.35, marginTop: 2 }}>
                Representación comercial de la factura electrónica {f.numero ?? ""} generada por LOGIKS.CO.
                {cufe ? " Verifícala con el QR o el CUFE en catalogo-vpfe.dian.gov.co." : ""}
              </Text>
            </View>
          </View>

          <View style={{ width: enUsd ? 262 : 210 }}>
          <View style={{ borderRadius: 10, borderWidth: 1, borderColor: T.linea, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 }}>
              <Text style={[e.etiqueta, { flex: 1, fontSize: 5.8 }]}> </Text>
              <Text style={[e.etiqueta, { width: wPrim, textAlign: "right", fontSize: 5.8, color: m.oscuro }]}>{monedaVista}</Text>
              {enUsd && (
                <View style={{ width: 82, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" }}>
                  <Flecha color={m.color} ancho={14} />
                  <Text style={[e.etiqueta, { fontSize: 5.8, color: m.oscuro, marginLeft: 3 }]}>COP · DIAN</Text>
                </View>
              )}
            </View>
            {totalesFila.map(([k, a, c, estilo]) =>
              estilo === "pagar" ? (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", backgroundColor: T.tinta, paddingHorizontal: 10, paddingVertical: 6, marginTop: 3 }}>
                  <Text style={{ flex: 1, fontFamily: "Grotesk", fontWeight: 700, fontSize: 9.5, color: "#FFFFFF" }}>Valor a pagar</Text>
                  <Text style={{ width: wPrim, textAlign: "right", fontFamily: "Grotesk", fontWeight: 700, fontSize: 10.5, color: "#FFFFFF" }}>{mon(a)}</Text>
                  {enUsd && <Text style={{ width: 82, textAlign: "right", fontFamily: "Mono", fontWeight: 600, fontSize: 7.4, color: m.suave }}>{COP.format(c)}</Text>}
                </View>
              ) : (
                <View
                  key={k}
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: 10,
                    paddingVertical: 2.4,
                    ...(estilo === "fuerte" ? { borderTopWidth: 1, borderTopColor: T.linea, marginTop: 2, paddingTop: 4 } : {}),
                  }}
                >
                  <Text style={{ flex: 1, fontSize: estilo ? 8 : 7.4, color: estilo ? T.tinta : T.suave, fontWeight: estilo ? 700 : 400 }}>{k}</Text>
                  <Text style={{ width: wPrim, textAlign: "right", fontFamily: "Mono", fontSize: 7.4, fontWeight: estilo ? 600 : 400, color: T.tinta }}>{mon(a)}</Text>
                  {enUsd && <Text style={{ width: 82, textAlign: "right", fontFamily: "Mono", fontSize: 7, color: T.suave }}>{COP.format(c)}</Text>}
                </View>
              ),
            )}
          </View>
            {/* Recibido del cliente */}
            <View style={{ flexDirection: "row", marginTop: 20 }}>
              {["Recibido (firma y sello)", "C.C.", "Fecha"].map((k, i) => (
                <View key={k} style={{ flex: i === 0 ? 2 : 1, marginLeft: i ? 8 : 0 }}>
                  <View style={{ height: 1, backgroundColor: T.tinta }} />
                  <Text style={[e.etiqueta, { marginTop: 2, fontSize: 5.8 }]}>{k}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

      </Page>
    </Document>,
  );
}
