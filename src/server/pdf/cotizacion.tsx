import "server-only";
import { Document, Link, Page, Path, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Cotizacion, Empresa, Tercero } from "@/domain/types";
import { BLOQUES, TIPOS_SERVICIO, UNIDADES, type Bloque } from "@/domain/types";
import { convertir, totalesConceptos, totalesPorBloque } from "@/domain/cotizacion";
import { diasEntre } from "@/domain/fechas";
import { dinero, fecha, numero } from "@/lib/formato";
import { logoParaPdf } from "./logo";
import {
  COLOR_BLOQUE,
  Dato,
  Encabezado,
  Marco,
  QR,
  Ruta,
  Seccion,
  T,
  codigoLugar,
  e,
  marca,
  partirLugar,
  registrarFuentes,
} from "./sistema";

/**
 * Cotización para el cliente (RF-05) en el sistema «Manifiesto».
 * Nunca incluye costos, proveedores ni utilidad.
 */

type Logo = { data: Buffer; format: "png" | "jpg" };
const ANCHO = 532;
const TALON = 150;

function Boleto({ q, empresa, cliente }: { q: Cotizacion; empresa: Empresa; cliente: Tercero }) {
  const m = marca(empresa);
  const mon = q.monedaPresentacion;
  const total = totalesConceptos(q.conceptos, mon, q.trm).venta;
  const o = partirLugar(q.origen);
  const d = partirLugar(q.destino);
  const dias = diasEntre(q.fechaEmision, q.vigenteHasta);
  const izq = ANCHO - TALON;
  const contacto = cliente.contactos.find((c) => c.id === q.contactoId) ?? cliente.contactos[0];

  return (
    <View wrap={false} style={{ flexDirection: "row", backgroundColor: T.tinta, borderRadius: 14 }}>
      {/* Cuerpo del boleto */}
      <View style={{ width: izq, paddingHorizontal: 18, paddingVertical: 15 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 12 }}>
          <Text style={[e.etiqueta, { color: "#7F8BA6", marginRight: 8 }]}>Para</Text>
          <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 10, color: "#FFFFFF" }}>{cliente.razonSocial}</Text>
          <Text style={{ fontSize: 7.5, color: "#8E9AB5", marginLeft: 6 }}>
            NIT {cliente.nit}
            {contacto ? `  ·  ${contacto.nombre}` : ""}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Origen</Text>
          <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Destino</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 28, color: "#FFFFFF", letterSpacing: -0.5 }}>{codigoLugar(q.origen)}</Text>
          <Ruta ancho={150} color={m.color} tipo={q.tipoServicio} />
          <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 28, color: "#FFFFFF", letterSpacing: -0.5 }}>{codigoLugar(q.destino)}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
          <View style={{ maxWidth: 140 }}>
            <Text style={{ fontSize: 9, fontWeight: 600, color: "#E6EAF3" }}>{o.ciudad}</Text>
            {o.region ? <Text style={{ fontSize: 7.5, color: "#8E9AB5" }}>{o.region}</Text> : null}
          </View>
          <View style={{ maxWidth: 140, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 9, fontWeight: 600, color: "#E6EAF3", textAlign: "right" }}>{d.ciudad}</Text>
            {d.region ? <Text style={{ fontSize: 7.5, color: "#8E9AB5", textAlign: "right" }}>{d.region}</Text> : null}
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: "#243049", marginVertical: 10 }} />
        <View style={{ flexDirection: "row" }}>
          <Dato claro etiqueta="Servicio" valor={TIPOS_SERVICIO[q.tipoServicio]} />
          <Dato claro etiqueta="Incoterm" valor={q.incoterm} flex={0.6} />
          <Dato claro etiqueta="Mercancía" valor={q.mercancia.descripcion} flex={1.4} />
        </View>
      </View>

      {/* Muescas de la perforación */}
      <View style={{ width: 0, position: "relative" }}>
        <View style={{ position: "absolute", left: -7, top: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: T.papel }} />
        <View style={{ position: "absolute", left: -7, bottom: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: T.papel }} />
      </View>

      {/* Talón */}
      <View style={{ width: TALON, paddingHorizontal: 16, paddingVertical: 15, justifyContent: "space-between", borderLeftWidth: 1.2, borderLeftColor: "#36435E", borderLeftStyle: "dashed" }}>
        <View>
          <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Total {mon}</Text>
          <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 17, color: "#FFFFFF", marginTop: 4, letterSpacing: -0.3 }}>{dinero(total, mon)}</Text>
          <Text style={{ fontSize: 7, color: "#8E9AB5", marginTop: 2 }}>Antes de impuestos</Text>
        </View>
        <View>
          <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Válida hasta</Text>
          <Text style={{ fontFamily: "Manrope", fontWeight: 600, fontSize: 9.5, color: "#FFFFFF", marginTop: 3 }}>{fecha(q.vigenteHasta)}</Text>
          {dias > 0 && (
            <View style={{ alignSelf: "flex-start", marginTop: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: m.color }}>
              <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: "#FFFFFF" }}>{dias} DÍAS</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function Composicion({ q }: { q: Cotizacion }) {
  const mon = q.monedaPresentacion;
  const por = totalesPorBloque(q.conceptos, mon, q.trm);
  const total = Object.values(por).reduce((s, t) => s + (t?.venta ?? 0), 0);
  const bloques = (Object.keys(BLOQUES) as Bloque[]).filter((b) => por[b] && por[b]!.venta > 0);
  if (total <= 0 || bloques.length < 2) return null;
  return (
    <View wrap={false} style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden" }}>
        {bloques.map((b, i) => (
          <View key={b} style={{ flex: por[b]!.venta / total, backgroundColor: COLOR_BLOQUE[b], marginLeft: i === 0 ? 0 : 2 }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 3 }}>
        {bloques.map((b, i) => {
          const pct = por[b]!.venta / total;
          return (
            <View key={b} style={{ flex: pct, marginLeft: i === 0 ? 0 : 2 }}>
              {pct >= 0.08 && <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.suave }}>{Math.round(pct * 100)}%</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Detalle({ q, color, n }: { q: Cotizacion; color: string; n: string }) {
  const mon = q.monedaPresentacion;
  const por = totalesPorBloque(q.conceptos, mon, q.trm);
  const bloques = (Object.keys(BLOQUES) as Bloque[]).filter((b) => q.conceptos.some((c) => c.bloque === b));
  return (
    <View>
      <Seccion n={n} titulo="Detalle y composición del precio" derecha={`${q.conceptos.length} concepto${q.conceptos.length === 1 ? "" : "s"}`} color={color} />
      <Composicion q={q} />
      {bloques.map((b) => {
        const lineas = q.conceptos.filter((c) => c.bloque === b);
        const unico = lineas.length === 1;
        return (
          <View key={b} wrap={false} style={{ marginTop: 5 }}>
            {!unico && (
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                <View style={{ width: 3, height: 10, borderRadius: 1.5, backgroundColor: COLOR_BLOQUE[b], marginRight: 7 }} />
                <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 8.5, color: T.tinta, flex: 1 }}>{BLOQUES[b]}</Text>
                <Text style={{ fontFamily: "Mono", fontWeight: 600, fontSize: 8, color: T.tinta }}>{dinero(por[b]!.venta, mon)}</Text>
              </View>
            )}
            {lineas.map((c) => (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "flex-end", paddingLeft: unico ? 0 : 10, paddingVertical: 1.5 }}>
                {unico && <View style={{ width: 3, alignSelf: "stretch", borderRadius: 1.5, backgroundColor: COLOR_BLOQUE[b], marginRight: 7 }} />}
                <View style={{ maxWidth: 340 }}>
                  {unico && <Text style={[e.etiqueta, { fontSize: 6, marginBottom: 1.5 }]}>{BLOQUES[b]}</Text>}
                  <Text style={{ fontSize: 8.8, color: T.texto }}>{c.descripcion.replaceAll("→", "–")}</Text>
                  <Text style={{ fontFamily: "Mono", fontSize: 6.8, color: T.tenue, marginTop: 1 }}>
                    {numero(c.cantidad, 2)} × {UNIDADES[c.unidad].replace("Por ", "").toLowerCase()}
                    {c.moneda !== mon ? `  ·  ${dinero(c.ventaUnitaria, c.moneda)} c/u` : ""}
                    {c.paraTerceros ? "  ·  por cuenta del cliente" : ""}
                  </Text>
                </View>
                <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: T.linea, borderBottomStyle: "dotted", marginHorizontal: 8, marginBottom: 3 }} />
                <Text style={{ fontFamily: "Mono", fontWeight: unico ? 600 : 400, fontSize: 8.5, color: T.tinta }}>
                  {dinero(convertir(c.ventaUnitaria * c.cantidad, c.moneda, mon, q.trm), mon)}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Total({ q, color }: { q: Cotizacion; color: string }) {
  const mon = q.monedaPresentacion;
  const total = totalesConceptos(q.conceptos, mon, q.trm).venta;
  const terceros = totalesConceptos(q.conceptos.filter((c) => c.paraTerceros), mon, q.trm).venta;
  const convertidos = q.conceptos.some((c) => c.moneda !== mon);
  return (
    <View style={{ width: 250 }}>
      <View style={{ borderRadius: 12, backgroundColor: T.lavado, padding: 14, flexGrow: 1, justifyContent: "flex-end" }}>
        {terceros > 0 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ fontSize: 8, color: T.suave }}>Incluye gastos por cuenta del cliente</Text>
            <Text style={{ fontFamily: "Mono", fontSize: 8, color: T.suave }}>{dinero(terceros, mon)}</Text>
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={[e.etiqueta, { color }]}>Total</Text>
            <Text style={{ fontSize: 7, color: T.suave, marginTop: 2 }}>{mon} · antes de impuestos</Text>
          </View>
          <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 20, color: T.tinta, letterSpacing: -0.4 }}>{dinero(total, mon)}</Text>
        </View>
        {convertidos && (
          <Text style={{ fontFamily: "Mono", fontSize: 6.8, color: T.tenue, marginTop: 6 }}>TRM {dinero(q.trm, "COP")} por USD</Text>
        )}
      </View>
    </View>
  );
}

/** "https://app.co/c/abcdefgh…" para mostrar; el QR lleva la URL completa. */
function enlaceCorto(url: string) {
  const sinEsquema = url.replace(/^https?:\/\//, "");
  const [base, ...resto] = sinEsquema.split("/c/");
  const token = resto.join("/c/");
  return token.length > 10 ? `${base}/c/${token.slice(0, 8)}…` : sinEsquema;
}

/**
 * Bloque de aprobación: botón clicable dentro del PDF + QR, ambos con el
 * enlace único y firmado de esta versión. Al abrirlo, el cliente confirma con
 * su nombre, cargo, documento y correo; queda la evidencia y una tarea al
 * equipo para verificarla.
 */
function Aceptar({ enlace, color }: { enlace?: string; color: string }) {
  if (!enlace) {
    return (
      <View style={{ flex: 1, marginRight: 12, borderRadius: 12, borderWidth: 1, borderColor: T.linea, padding: 12 }}>
        <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 11, color: T.tinta }}>Aprobación</Text>
        <Text style={{ fontSize: 8.5, color: T.suave, marginTop: 3 }}>Pide a tu asesor el enlace seguro para aprobar esta cotización.</Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, marginRight: 12, flexDirection: "row", borderRadius: 12, borderWidth: 1, borderColor: T.linea, padding: 12, alignItems: "center" }}>
      <Link src={enlace} style={{ textDecoration: "none" }}>
        <QR texto={enlace} tam={60} />
      </Link>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 11, color: T.tinta }}>¿Todo en orden?</Text>
        <Link src={enlace} style={{ textDecoration: "none", marginTop: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: color, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 9.5, color: "#FFFFFF" }}>Aprobar cotización</Text>
            <Svg width={10} height={10} viewBox="0 0 12 12" style={{ marginLeft: 6 }}>
              <Path d="M2 6h7.5M6.5 2.5L10 6 6.5 9.5" stroke="#FFFFFF" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </Link>
        <Text style={{ fontSize: 7.2, lineHeight: 1.4, color: T.suave, marginTop: 6 }}>
          Enlace único y seguro de esta versión. Queda registro de quién aprueba, cuándo y desde dónde.
        </Text>
        <Text style={{ fontFamily: "Mono", fontSize: 6.3, color: T.tenue, marginTop: 4 }}>{enlaceCorto(enlace)}</Text>
      </View>
    </View>
  );
}

export function DocumentoCotizacion({
  q,
  empresa,
  cliente,
  enlace,
  logo,
}: {
  q: Cotizacion;
  empresa: Empresa;
  cliente: Tercero;
  enlace?: string;
  logo?: Logo;
}) {
  registrarFuentes();
  const m = marca(empresa);
  const contacto = cliente.contactos.find((c) => c.id === q.contactoId) ?? cliente.contactos[0];

  return (
    <Document title={`${q.consecutivo} v${q.version} · ${empresa.razonSocial}`} author={empresa.razonSocial} creator="LOGIKS.CO" language="es-CO">
      <Page size="LETTER" style={e.pagina}>
        <Marco empresa={empresa} pie={`${empresa.razonSocial}  ·  ${q.consecutivo} v${q.version}`} />
        <Encabezado
          empresa={empresa}
          logo={logo}
          tipoDoc="Cotización"
          numero={q.consecutivo}
          sub={`v${q.version}  ·  emitida ${fecha(q.fechaEmision)}`}
        />

        <Boleto q={q} empresa={empresa} cliente={cliente} />

        <View style={{ flexDirection: "row", marginTop: 8, borderRadius: 10, backgroundColor: T.lavado, paddingHorizontal: 12, paddingVertical: 9 }}>
          <Dato etiqueta="Piezas" valor={numero(q.mercancia.piezas)} />
          <Dato etiqueta="Peso" valor={`${numero(q.mercancia.pesoKg)} kg`} />
          <Dato etiqueta="Volumen" valor={`${numero(q.mercancia.volumenM3, 1)} m³`} />
          <Dato
            etiqueta="Equipo"
            valor={q.mercancia.contenedores?.length ? q.mercancia.contenedores.map((c) => `${c.cantidad}×${c.tipo}`).join(", ") : "Carga general"}
          />
        </View>

        <Detalle q={q} color={m.color} n="01" />
        <View wrap={false} style={{ flexDirection: "row", marginTop: 12 }}>
          <Aceptar enlace={enlace} color={m.color} />
          <Total q={q} color={m.oscuro} />
        </View>

        {q.terminos ? (
          <View wrap={false} style={{ marginTop: 10 }}>
            <Text style={e.etiqueta}>Términos y condiciones</Text>
            <Text style={{ fontSize: 7.5, lineHeight: 1.5, color: T.suave, marginTop: 4 }}>{q.terminos}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function pdfCotizacion(props: Omit<Parameters<typeof DocumentoCotizacion>[0], "logo">) {
  const logo = await logoParaPdf(props.empresa.logoUrl);
  return renderToBuffer(<DocumentoCotizacion {...props} logo={logo} />);
}
