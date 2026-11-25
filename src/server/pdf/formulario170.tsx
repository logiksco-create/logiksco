import "server-only";
import { createHash } from "node:crypto";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { logoParaPdf } from "./logo";
import type { Empresa, Formulario170, Tercero } from "@/domain/types";
import { ESTADOS_170 } from "@/domain/types";
import { dinero, fecha, fechaHora } from "@/lib/formato";

/** Expediente de conocimiento del cliente, Circular 170 (RF-20). */
const s = StyleSheet.create({
  pagina: { padding: 40, paddingBottom: 60, fontSize: 9.5, color: "#0d1326", fontFamily: "Helvetica" },
  titulo: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  sub: { color: "#5b6478", marginTop: 2 },
  seccion: { marginTop: 16, fontSize: 8, color: "#5b6478", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  fila: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderColor: "#e4e7ef" },
  k: { width: 170, color: "#5b6478" },
  v: { flex: 1 },
  pie: { position: "absolute", bottom: 26, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", color: "#8a92a6", fontSize: 7.5 },
});

export function huellaFormulario(f: Formulario170) {
  return createHash("sha256").update(JSON.stringify({ t: f.terceroId, v: f.version, d: f.datos })).digest("hex");
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.fila} wrap={false}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v || "—"}</Text>
    </View>
  );
}

export async function pdfFormulario170({ f, empresa, cliente }: { f: Formulario170; empresa: Empresa; cliente: Tercero }) {
  const d = f.datos;
  const logo = await logoParaPdf(empresa.logoUrl);
  return renderToBuffer(
    <Document title={`Circular 170 · ${cliente.razonSocial} · v${f.version}`} author={empresa.razonSocial} creator="LOGIKS.CO" language="es-CO">
      <Page size="LETTER" style={s.pagina}>
        {logo && <Image src={logo} style={{ maxHeight: 36, maxWidth: 160, objectFit: "contain", marginBottom: 10 }} />}
        <Text style={s.titulo}>Formato de conocimiento del cliente</Text>
        <Text style={s.sub}>Circular Externa 170 de 2002 (DIAN) · {empresa.razonSocial} · NIT {empresa.nit}</Text>

        <Text style={s.seccion}>Expediente</Text>
        <Fila k="Cliente" v={`${cliente.razonSocial} · NIT ${cliente.nit}`} />
        <Fila k="Versión" v={String(f.version)} />
        <Fila k="Estado" v={ESTADOS_170[f.estado]} />
        <Fila k="Diligenciado" v={f.diligenciadoEl ? `${fecha(f.diligenciadoEl)}, ${fechaHora(f.diligenciadoEl).split(", ").pop()}` : ""} />
        <Fila k="Aprobado" v={f.aprobadoEl ? `${fecha(f.aprobadoEl)}${f.revisor ? ` · ${f.revisor}` : ""}` : ""} />
        <Fila k="Vigente hasta" v={fecha(f.vigenteHasta)} />
        {f.observaciones ? <Fila k="Observaciones" v={f.observaciones} /> : null}

        <Text style={s.seccion}>Identificación (numeral 5.2.1)</Text>
        <Fila k="Razón social o nombre" v={d.razonSocial} />
        <Fila k="NIT o documento" v={d.nit} />
        <Fila k="Domicilio y residencia" v={`${d.domicilio}, ${d.ciudad}`} />
        <Fila k="Actividad económica" v={d.actividadEconomica} />
        <Fila k="Capital social registrado" v={dinero(d.capitalSocial)} />
        <Fila k="Origen de los recursos" v={d.origenRecursos} />
        <Fila k="Forma de pago" v={`${d.formaPago} · ${d.entidadFinanciera}`} />
        <Fila k="Socios y representantes" v={d.representantes.map((r) => `${r.nombre} (${r.documento}) · ${r.cargo}`).join("\n")} />
        <Fila k="Beneficiarios de las operaciones" v={d.beneficiarios} />
        <Fila k="Persona expuesta políticamente" v={d.esPEP ? "Sí" : "No"} />
        <Fila k="Tratamiento de datos (Ley 1581)" v={d.autorizaDatos ? "Autorizado" : "No autorizado"} />

        <Text style={s.seccion}>Huella del documento</Text>
        <Text style={{ marginTop: 4, fontFamily: "Courier", fontSize: 8 }}>SHA-256 {huellaFormulario(f)}</Text>

        <View style={s.pie} fixed>
          <Text>Expediente sin borrado · LOGIKS.CO</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
