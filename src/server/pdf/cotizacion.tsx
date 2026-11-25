import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Cotizacion, Empresa, Tercero } from "@/domain/types";
import { BLOQUES, TIPOS_SERVICIO, type Bloque } from "@/domain/types";
import { convertir, totalesConceptos } from "@/domain/cotizacion";
import { dinero, fecha, numero } from "@/lib/formato";

/**
 * PDF de la cotización para el cliente (RF-05). Igual que la vista pública:
 * nunca incluye costos, proveedores ni utilidad.
 * Fuente Helvetica (incluida en PDF): por eso "→" se escribe como "–".
 */

const tinta = "#0d1326";
const gris = "#5b6478";
const linea = "#e4e7ef";

const s = StyleSheet.create({
  pagina: { padding: 40, paddingBottom: 60, fontSize: 9.5, color: tinta, fontFamily: "Helvetica" },
  cabecera: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  empresa: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  sub: { color: gris, marginTop: 2 },
  chip: { fontSize: 8, color: "#ffffff", paddingVertical: 3, paddingHorizontal: 7, borderRadius: 8 },
  banda: { marginTop: 22, padding: 16, borderRadius: 8, backgroundColor: "#0a0f1f", color: "#ffffff" },
  ruta: { fontSize: 17, fontFamily: "Helvetica-Bold", marginTop: 4 },
  bandaSub: { color: "#aab3c8", marginTop: 6, fontSize: 9 },
  datos: { flexDirection: "row", marginTop: 14, borderWidth: 1, borderColor: linea, borderRadius: 6 },
  dato: { flex: 1, padding: 10, borderRightWidth: 1, borderColor: linea },
  etiqueta: { color: gris, fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  bloque: { marginTop: 14 },
  bloqueTitulo: { fontSize: 7.5, color: gris, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  fila: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderColor: linea },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, padding: 12, borderRadius: 6, backgroundColor: "#f5f6fa" },
  totalValor: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  terminos: { marginTop: 18, color: gris, fontSize: 8, lineHeight: 1.45 },
  pie: { position: "absolute", bottom: 26, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", color: "#8a92a6", fontSize: 7.5 },
});

const texto = (t: string) => t.replaceAll("→", "–");

export function DocumentoCotizacion({
  q,
  empresa,
  cliente,
  enlace,
}: {
  q: Cotizacion;
  empresa: Empresa;
  cliente: Tercero;
  enlace?: string;
}) {
  const mon = q.monedaPresentacion;
  const total = totalesConceptos(q.conceptos, mon, q.trm).venta;
  const bloques = (Object.keys(BLOQUES) as Bloque[]).filter((b) => q.conceptos.some((c) => c.bloque === b));
  const contacto = cliente.contactos.find((c) => c.id === q.contactoId) ?? cliente.contactos[0];

  return (
    <Document title={`${q.consecutivo} v${q.version}`} author={empresa.razonSocial} creator="LOGIKS.CO" language="es-CO">
      <Page size="LETTER" style={s.pagina}>
        <View style={s.cabecera}>
          <View>
            <Text style={s.empresa}>{empresa.razonSocial}</Text>
            <Text style={s.sub}>NIT {empresa.nit}{empresa.ciudad ? ` · ${empresa.ciudad}` : ""}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.chip, { backgroundColor: empresa.colorPrimario || "#3b5bfd" }]}>COTIZACIÓN</Text>
            <Text style={[s.sub, { marginTop: 6, fontFamily: "Helvetica-Bold", color: tinta }]}>
              {q.consecutivo} · v{q.version}
            </Text>
            <Text style={s.sub}>Emitida {fecha(q.fechaEmision)}</Text>
          </View>
        </View>

        <View style={s.banda}>
          <Text style={{ color: "#aab3c8", fontSize: 8.5 }}>Para {cliente.razonSocial} · NIT {cliente.nit}</Text>
          <Text style={s.ruta}>
            {texto(q.origen)}  –  {texto(q.destino)}
          </Text>
          <Text style={s.bandaSub}>
            Válida hasta {fecha(q.vigenteHasta)}
            {contacto ? ` · Atención: ${contacto.nombre}${contacto.cargo ? `, ${contacto.cargo}` : ""}` : ""}
          </Text>
        </View>

        <View style={s.datos}>
          <View style={s.dato}>
            <Text style={s.etiqueta}>Servicio</Text>
            <Text>{TIPOS_SERVICIO[q.tipoServicio]}</Text>
            <Text style={s.sub}>Incoterm {q.incoterm}</Text>
          </View>
          <View style={s.dato}>
            <Text style={s.etiqueta}>Mercancía</Text>
            <Text>{q.mercancia.descripcion}</Text>
            <Text style={s.sub}>{numero(q.mercancia.piezas)} piezas</Text>
          </View>
          <View style={[s.dato, { borderRightWidth: 0 }]}>
            <Text style={s.etiqueta}>Peso y volumen</Text>
            <Text>{numero(q.mercancia.pesoKg)} kg</Text>
            <Text style={s.sub}>{numero(q.mercancia.volumenM3, 1)} m³</Text>
          </View>
        </View>

        {bloques.map((b) => (
          <View key={b} style={s.bloque} wrap={false}>
            <Text style={s.bloqueTitulo}>{BLOQUES[b]}</Text>
            {q.conceptos
              .filter((c) => c.bloque === b)
              .map((c) => (
                <View key={c.id} style={s.fila}>
                  <Text style={{ flex: 1, paddingRight: 12 }}>
                    {texto(c.descripcion)}
                    {c.cantidad !== 1 ? `  × ${numero(c.cantidad, 2)}` : ""}
                  </Text>
                  <Text>{dinero(convertir(c.ventaUnitaria * c.cantidad, c.moneda, mon, q.trm), mon)}</Text>
                </View>
              ))}
          </View>
        ))}

        <View style={s.total} wrap={false}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Total</Text>
          <Text style={s.totalValor}>{dinero(total, mon)}</Text>
        </View>
        {q.conceptos.some((c) => c.moneda !== mon) && (
          <Text style={[s.sub, { marginTop: 4, fontSize: 8 }]}>
            Valores convertidos a {mon} con TRM {dinero(q.trm, "COP")}.
          </Text>
        )}

        {q.terminos ? (
          <View style={s.terminos}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: tinta, marginBottom: 3 }}>Términos y condiciones</Text>
            <Text>{q.terminos}</Text>
          </View>
        ) : null}

        {enlace && (
          <Text style={[s.terminos, { color: tinta }]}>
            Acepta en línea en: <Text style={{ color: "#2a44d4" }}>{enlace}</Text>
          </Text>
        )}

        <View style={s.pie} fixed>
          <Text>{empresa.razonSocial} · Generado con LOGIKS.CO</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function pdfCotizacion(props: Parameters<typeof DocumentoCotizacion>[0]) {
  return renderToBuffer(<DocumentoCotizacion {...props} />);
}
