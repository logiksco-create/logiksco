import "server-only";
import { createHash } from "node:crypto";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Empresa, Formulario170, Tercero } from "@/domain/types";
import { ESTADOS_170 } from "@/domain/types";
import { diasEntre, hoyISO } from "@/domain/fechas";
import { dinero, fecha, fechaHora } from "@/lib/formato";
import { logoParaPdf } from "./logo";
import { Chulo, Dato, Encabezado, Equis, Marco, Oscura, QR, Sello, Seccion, T, e, marca, registrarFuentes } from "./sistema";

/** Expediente de conocimiento del cliente, Circular 170 (RF-20), sistema «Manifiesto». */

export function huellaFormulario(f: Formulario170) {
  return createHash("sha256").update(JSON.stringify({ t: f.terceroId, v: f.version, d: f.datos })).digest("hex");
}

const COLOR_ESTADO: Record<Formulario170["estado"], string> = {
  aprobado: "#34D399",
  en_revision: "#60A5FA",
  devuelto: "#FBBF24",
  rechazado: "#F87171",
  pendiente: "#94A3B8",
};

function Tarjeta({ n, titulo, color, children }: { n: string; titulo: string; color: string; children: React.ReactNode }) {
  return (
    <View wrap={false} style={{ width: "48.8%", backgroundColor: T.lavado, borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ fontFamily: "Mono", fontWeight: 600, fontSize: 7, color, marginRight: 7 }}>{n}</Text>
        <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 10.5, color: T.tinta }}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

function Campo({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ marginBottom: 7 }}>
      <Text style={e.etiqueta}>{k}</Text>
      <Text style={{ fontSize: 8.8, color: T.tinta, marginTop: 2 }}>{v || "—"}</Text>
    </View>
  );
}

function Declaracion({ ok, texto, neutral }: { ok: boolean; texto: string; neutral?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 7 }}>
      {ok ? <Chulo color={neutral ? T.suave : T.exito} /> : <Equis color={neutral ? T.alerta : T.peligro} />}
      <Text style={{ fontSize: 8.8, color: T.tinta, marginLeft: 7 }}>{texto}</Text>
    </View>
  );
}

export async function pdfFormulario170({ f, empresa, cliente }: { f: Formulario170; empresa: Empresa; cliente: Tercero }) {
  registrarFuentes();
  const d = f.datos;
  const m = marca(empresa);
  const logo = await logoParaPdf(empresa.logoUrl);
  const huella = huellaFormulario(f);
  const hoy = hoyISO();

  // Barra de vigencia: aprobación → vencimiento, con «hoy».
  let avance: number | null = null;
  let restantes: number | null = null;
  if (f.aprobadoEl && f.vigenteHasta) {
    const total = Math.max(1, diasEntre(f.aprobadoEl, f.vigenteHasta));
    avance = Math.min(1, Math.max(0, diasEntre(f.aprobadoEl, hoy) / total));
    restantes = diasEntre(hoy, f.vigenteHasta);
  }
  const colorVigencia = restantes === null ? T.suave : restantes < 0 ? "#F87171" : restantes <= 30 ? "#FBBF24" : "#34D399";

  return renderToBuffer(
    <Document title={`Circular 170 · ${cliente.razonSocial} · v${f.version}`} author={empresa.razonSocial} creator="LOGIKS.CO" language="es-CO">
      <Page size="LETTER" style={e.pagina}>
        <Marco empresa={empresa} pie={`${empresa.razonSocial}  ·  Expediente 170  ·  ${cliente.nit}`} />
        <Encabezado
          empresa={empresa}
          logo={logo}
          tipoDoc="Expediente · Circular 170"
          numero={`Versión ${f.version}`}
          sub="Conocimiento del cliente · DIAN"
        />

        <Oscura estilo={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Titular</Text>
            <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 18, color: "#FFFFFF", marginTop: 4, letterSpacing: -0.3 }}>{cliente.razonSocial}</Text>
            <Text style={{ fontFamily: "Mono", fontSize: 8, color: "#8E9AB5", marginTop: 3 }}>NIT {cliente.nit}</Text>

            {avance !== null ? (
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                  <Text style={[e.etiqueta, { color: "#7F8BA6" }]}>Vigencia</Text>
                  <Text style={{ fontFamily: "Mono", fontSize: 7, color: colorVigencia }}>
                    {restantes! < 0 ? `VENCIDA HACE ${-restantes!} DÍAS` : `QUEDAN ${restantes} DÍAS`}
                  </Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: "#243049" }}>
                  <View style={{ width: `${Math.round(avance * 100)}%`, height: 6, borderRadius: 3, backgroundColor: colorVigencia }} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 5 }}>
                  <Text style={{ fontFamily: "Mono", fontSize: 7, color: "#A8B2C8" }}>{fecha(f.aprobadoEl)}</Text>
                  <Text style={{ fontFamily: "Mono", fontSize: 7, color: "#A8B2C8" }}>{fecha(f.vigenteHasta)}</Text>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 8.5, color: "#A8B2C8", marginTop: 14 }}>Sin vigencia: el formulario aún no está aprobado.</Text>
            )}
          </View>
          <View style={{ width: 150, alignItems: "center", borderLeftWidth: 1.2, borderLeftColor: "#36435E", borderLeftStyle: "dashed", paddingLeft: 14 }}>
            <Sello
              texto={ESTADOS_170[f.estado].toUpperCase()}
              sub={f.aprobadoEl ? fecha(f.aprobadoEl) : f.diligenciadoEl ? fecha(f.diligenciadoEl) : undefined}
              color={COLOR_ESTADO[f.estado]}
            />
            {f.revisor && <Text style={{ fontSize: 7.5, color: "#A8B2C8", marginTop: 12 }}>Revisó: {f.revisor}</Text>}
          </View>
        </Oscura>

        <Seccion n="01" titulo="Información declarada" derecha="Numeral 5.2.1" color={m.color} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          <Tarjeta n="A" titulo="Identificación" color={m.color}>
            <Campo k="Razón social o nombre" v={d.razonSocial} />
            <Campo k="NIT o documento" v={d.nit} />
            <Campo k="Domicilio y residencia" v={`${d.domicilio}, ${d.ciudad}`} />
          </Tarjeta>
          <Tarjeta n="B" titulo="Actividad y recursos" color={m.color}>
            <Campo k="Actividad económica" v={d.actividadEconomica} />
            <Campo k="Capital social registrado" v={dinero(d.capitalSocial)} />
            <Campo k="Origen de los recursos" v={d.origenRecursos} />
          </Tarjeta>
          <Tarjeta n="C" titulo="Pagos y beneficiarios" color={m.color}>
            <Campo k="Forma de pago" v={`${d.formaPago} · ${d.entidadFinanciera}`} />
            <Campo k="Socios y representantes" v={d.representantes.map((r) => `${r.nombre} (${r.documento})`).join("\n")} />
            <Campo k="Beneficiarios de las operaciones" v={d.beneficiarios} />
          </Tarjeta>
          <Tarjeta n="D" titulo="Declaraciones" color={m.color}>
            <Declaracion ok={!d.esPEP} neutral texto={d.esPEP ? "Es persona expuesta políticamente (PEP)" : "No es persona expuesta políticamente"} />
            <Declaracion ok={d.autorizaDatos} texto={d.autorizaDatos ? "Autoriza tratamiento de datos (Ley 1581)" : "No autoriza tratamiento de datos"} />
            <Declaracion ok texto="Declara que la información es veraz" />
          </Tarjeta>
        </View>

        <Seccion n="02" titulo="Evidencia" color={m.color} />
        <View wrap={false} style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: T.linea, padding: 14 }}>
          <QR texto={`sha256:${huella}`} tam={62} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: "row" }}>
              <Dato etiqueta="Diligenciado" valor={f.diligenciadoEl ? `${fecha(f.diligenciadoEl)}, ${fechaHora(f.diligenciadoEl).split(", ").pop()}` : "—"} />
              <Dato etiqueta="Estado" valor={ESTADOS_170[f.estado]} />
              <Dato etiqueta="Versión" valor={String(f.version)} flex={0.5} />
            </View>
            {f.observaciones ? <Text style={{ fontSize: 8, color: T.suave, marginTop: 6 }}>Observaciones: {f.observaciones}</Text> : null}
            <Text style={[e.etiqueta, { marginTop: 8 }]}>Huella SHA-256</Text>
            <Text style={{ fontFamily: "Mono", fontSize: 6.8, color: T.tinta, marginTop: 2 }}>{huella}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 7, color: T.tenue, marginTop: 8 }}>
          Expediente sin borrado: cada corrección es una versión nueva. Consultable por la DIAN o la revisoría fiscal. Generado el {fechaHora(new Date().toISOString())}
        </Text>
      </Page>
    </Document>,
  );
}
