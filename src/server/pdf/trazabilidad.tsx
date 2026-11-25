import "server-only";
import { createHash } from "node:crypto";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Comunicacion, Empresa, Operacion, Tercero } from "@/domain/types";
import { ESTADOS_DO, TIPOS_SERVICIO } from "@/domain/types";
import { fecha, fechaHora } from "@/lib/formato";

/**
 * Línea de tiempo del DO como evidencia ante un reclamo (RF-40): hitos y
 * todas las comunicaciones, con huella SHA-256 del contenido.
 */
const s = StyleSheet.create({
  pagina: { padding: 40, paddingBottom: 60, fontSize: 9, color: "#0d1326", fontFamily: "Helvetica" },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  sub: { color: "#5b6478", marginTop: 2 },
  seccion: { marginTop: 16, marginBottom: 4, fontSize: 8, color: "#5b6478", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  fila: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderColor: "#e4e7ef" },
  correo: { paddingVertical: 7, borderBottomWidth: 1, borderColor: "#e4e7ef" },
  pie: { position: "absolute", bottom: 26, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", color: "#8a92a6", fontSize: 7.5 },
});
const t = (x: string) => x.replaceAll("→", "–");

export function pdfTrazabilidad(d: { op: Operacion; empresa: Empresa; cliente?: Tercero | null; comunicaciones: Comunicacion[] }) {
  const { op, empresa, cliente } = d;
  const orden = [...d.comunicaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const huella = createHash("sha256")
    .update(JSON.stringify({ op: op.id, hitos: op.hitos, c: orden.map((c) => [c.id, c.fecha, c.asunto, c.para, c.resumen]) }))
    .digest("hex");
  const generado = new Date().toISOString();
  return renderToBuffer(
    <Document title={`Trazabilidad ${op.consecutivo}`} author={empresa.razonSocial} creator="LOGIKS.CO" language="es-CO">
      <Page size="LETTER" style={s.pagina}>
        <Text style={s.titulo}>Trazabilidad de la operación {op.consecutivo}</Text>
        <Text style={s.sub}>
          {empresa.razonSocial} · NIT {empresa.nit} · Cliente {cliente?.razonSocial ?? "—"} · {TIPOS_SERVICIO[op.tipo]} · {t(op.origen)} – {t(op.destino)}
        </Text>
        <Text style={s.sub}>
          Estado {ESTADOS_DO[op.estado]} · abierto el {fecha(op.abiertoEl)} · generado {fechaHora(generado)}
        </Text>

        <Text style={s.seccion}>Hitos</Text>
        {op.hitos.map((h) => (
          <View key={h.id} style={s.fila} wrap={false}>
            <Text style={{ width: 150 }}>{h.nombre}</Text>
            <Text style={{ width: 150, color: "#5b6478" }}>Estimado {fecha(h.estimada)}</Text>
            <Text>Real {fecha(h.real)}</Text>
          </View>
        ))}

        <Text style={s.seccion}>Comunicaciones ({orden.length})</Text>
        {orden.length === 0 && <Text style={s.sub}>Sin comunicaciones registradas.</Text>}
        {orden.map((c) => (
          <View key={c.id} style={s.correo} wrap={false}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {fechaHora(c.fecha)} · {c.direccion === "saliente" ? "Enviado" : "Recibido"} · {t(c.asunto)}
            </Text>
            <Text style={s.sub}>
              {c.direccion === "saliente" ? "Para" : "En"} {c.para.join(", ")}
              {c.entregadoEl ? ` · entregado ${fechaHora(c.entregadoEl)}` : ""}
              {c.abiertoEl ? ` · abierto ${fechaHora(c.abiertoEl)}` : ""}
            </Text>
            <Text style={{ marginTop: 3, lineHeight: 1.4 }}>{t(c.resumen)}</Text>
          </View>
        ))}

        <Text style={s.seccion}>Huella del documento</Text>
        <Text style={{ fontFamily: "Courier", fontSize: 8 }}>SHA-256 {huella}</Text>
        <Text style={[s.sub, { fontSize: 8 }]}>Registro inmutable: las comunicaciones no se editan ni se borran en LOGIKS.CO.</Text>

        <View style={s.pie} fixed>
          <Text>{empresa.razonSocial} · Trazabilidad {op.consecutivo}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
