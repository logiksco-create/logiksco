import "server-only";
import { createHash } from "node:crypto";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Comunicacion, Empresa, Operacion, Tercero } from "@/domain/types";
import { ESTADOS_DO, TIPOS_SERVICIO } from "@/domain/types";
import { avance, hitoActual } from "@/domain/operacion";
import { diasEntre } from "@/domain/fechas";
import { fecha, fechaHora } from "@/lib/formato";
import { logoParaPdf } from "./logo";
import {
  Chulo,
  Encabezado,
  FlechaDireccion,
  Marco,
  Oscura,
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
 * Trazabilidad del DO como evidencia ante un reclamo (RF-40), sistema
 * «Manifiesto»: hitos, todas las comunicaciones y huella SHA-256.
 */
export async function pdfTrazabilidad(d: { op: Operacion; empresa: Empresa; cliente?: Tercero | null; comunicaciones: Comunicacion[] }) {
  registrarFuentes();
  const { op, empresa, cliente } = d;
  const m = marca(empresa);
  const logo = await logoParaPdf(empresa.logoUrl);
  const orden = [...d.comunicaciones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const huella = createHash("sha256")
    .update(JSON.stringify({ op: op.id, hitos: op.hitos, c: orden.map((c) => [c.id, c.fecha, c.asunto, c.para, c.resumen]) }))
    .digest("hex");
  const actual = hitoActual(op);
  const hechos = op.hitos.filter((h) => h.real).length;
  const o = partirLugar(op.origen);
  const de = partirLugar(op.destino);

  return renderToBuffer(
    <Document title={`Trazabilidad ${op.consecutivo}`} author={empresa.razonSocial} creator="LOGIKS.CO" language="es-CO">
      <Page size="LETTER" style={e.pagina}>
        <Marco empresa={empresa} pie={`${empresa.razonSocial}  ·  Trazabilidad ${op.consecutivo}`} />
        <Encabezado
          empresa={empresa}
          logo={logo}
          tipoDoc="Trazabilidad de la operación"
          numero={op.consecutivo}
          sub={`generada ${fechaHora(new Date().toISOString())}`}
        />

        <Oscura>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={[e.etiqueta, { color: "#7F8BA6", marginRight: 8 }]}>Cliente</Text>
              <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 10, color: "#FFFFFF" }}>{cliente?.razonSocial ?? "—"}</Text>
            </View>
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: m.color }}>
              <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: "#FFFFFF" }}>{ESTADOS_DO[op.estado].toUpperCase()}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 24, color: "#FFFFFF" }}>{codigoLugar(op.origen)}</Text>
              <Text style={{ fontSize: 8, color: "#A8B2C8" }}>{o.ciudad}</Text>
            </View>
            <Ruta ancho={250} color={m.color} tipo={op.tipo} />
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 24, color: "#FFFFFF" }}>{codigoLugar(op.destino)}</Text>
              <Text style={{ fontSize: 8, color: "#A8B2C8" }}>{de.ciudad}</Text>
            </View>
          </View>
          {/* Hitos como segmentos */}
          <View style={{ flexDirection: "row", marginTop: 14 }}>
            {op.hitos.map((h, i) => (
              <View
                key={h.id}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 2.5,
                  marginLeft: i ? 3 : 0,
                  backgroundColor: h.real ? m.color : h.id === actual?.id ? "#3B4A6B" : "#243049",
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 5 }}>
            <Text style={{ fontFamily: "Mono", fontSize: 7, color: "#A8B2C8" }}>
              {hechos} de {op.hitos.length} hitos  ·  {Math.round(avance(op) * 100)}%
            </Text>
            <Text style={{ fontFamily: "Mono", fontSize: 7, color: "#A8B2C8" }}>
              {TIPOS_SERVICIO[op.tipo]}  ·  abierto {fecha(op.abiertoEl)}
            </Text>
          </View>
        </Oscura>

        <Seccion n="01" titulo="Hitos" derecha={actual ? `Sigue: ${actual.nombre}` : "Completada"} color={m.color} />
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: T.linea, paddingVertical: 4 }}>
          <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingVertical: 5 }}>
            <Text style={[e.etiqueta, { flex: 1.4 }]}>Hito</Text>
            <Text style={[e.etiqueta, { flex: 1 }]}>Estimado</Text>
            <Text style={[e.etiqueta, { flex: 1 }]}>Real</Text>
            <Text style={[e.etiqueta, { flex: 0.8, textAlign: "right" }]}>Diferencia</Text>
          </View>
          {op.hitos.map((h) => {
            const dif = h.real && h.estimada ? diasEntre(h.estimada, h.real) : null;
            return (
              <View key={h.id} wrap={false} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 4.5, borderTopWidth: 1, borderTopColor: T.lavado }}>
                <View style={{ flex: 1.4, flexDirection: "row", alignItems: "center" }}>
                  {h.real ? (
                    <Chulo color={m.color} tam={8} />
                  ) : (
                    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.2, borderColor: h.id === actual?.id ? m.color : T.linea }} />
                  )}
                  <Text style={{ marginLeft: 7, fontSize: 8.8, color: h.real || h.id === actual?.id ? T.tinta : T.suave, fontWeight: h.id === actual?.id ? 700 : 400 }}>{h.nombre}</Text>
                </View>
                <Text style={{ flex: 1, fontFamily: "Mono", fontSize: 7.8, color: T.suave }}>{fecha(h.estimada)}</Text>
                <Text style={{ flex: 1, fontFamily: "Mono", fontSize: 7.8, color: T.tinta }}>{fecha(h.real)}</Text>
                <Text style={{ flex: 0.8, textAlign: "right", fontFamily: "Mono", fontSize: 7.8, color: dif === null ? T.tenue : dif > 0 ? T.peligro : T.exito }}>
                  {dif === null ? "—" : dif === 0 ? "a tiempo" : `${dif > 0 ? "+" : ""}${dif} d`}
                </Text>
              </View>
            );
          })}
        </View>

        <Seccion n="02" titulo="Comunicaciones" derecha={`${orden.length} registradas`} color={m.color} />
        {orden.length === 0 && <Text style={{ fontSize: 8.5, color: T.suave }}>Sin comunicaciones registradas.</Text>}
        {orden.map((c, i) => {
          const sal = c.direccion === "saliente";
          const color = sal ? m.color : T.exito;
          return (
            <View key={c.id} wrap={false} style={{ flexDirection: "row" }}>
              <View style={{ width: 62, paddingTop: 1 }}>
                <Text style={{ fontFamily: "Mono", fontSize: 7, color: T.tinta }}>{fecha(c.fecha).split(" ").slice(0, 2).join(" ")}</Text>
                <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.tenue, marginTop: 1 }}>{fechaHora(c.fecha).split(", ").pop()}</Text>
              </View>
              <View style={{ width: 20, alignItems: "center" }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: sal ? m.suave : "#E7F7F0", alignItems: "center", justifyContent: "center" }}>
                  <FlechaDireccion saliente={sal} color={color} tam={9} />
                </View>
                {i < orden.length - 1 && <View style={{ width: 1, flexGrow: 1, backgroundColor: T.linea, marginTop: 2 }} />}
              </View>
              <View style={{ flex: 1, paddingLeft: 10, paddingBottom: 12 }}>
                <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 9, color: T.tinta }}>{c.asunto.replaceAll("→", "–")}</Text>
                <Text style={{ fontFamily: "Mono", fontSize: 6.8, color: T.suave, marginTop: 2 }}>
                  {sal ? "ENVIADO A" : "RECIBIDO EN"}  {c.para.join(", ")}
                </Text>
                <Text style={{ fontSize: 8.3, lineHeight: 1.45, color: T.texto, marginTop: 3 }}>{c.resumen.replaceAll("→", "–")}</Text>
                {(c.entregadoEl || c.abiertoEl) && (
                  <View style={{ flexDirection: "row", marginTop: 4 }}>
                    {c.entregadoEl && (
                      <View style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
                        <Chulo color={T.suave} tam={7} />
                        <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.suave, marginLeft: 4 }}>Entregado {fechaHora(c.entregadoEl)}</Text>
                      </View>
                    )}
                    {c.abiertoEl && (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Chulo color={T.exito} tam={7} />
                        <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.exito, marginLeft: 4 }}>Abierto {fechaHora(c.abiertoEl)}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        <View wrap={false} style={{ flexDirection: "row", alignItems: "center", marginTop: 8, borderRadius: 12, backgroundColor: T.lavado, padding: 12 }}>
          <QR texto={`sha256:${huella}`} tam={52} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 10, color: T.tinta }}>Registro inmutable</Text>
            <Text style={{ fontSize: 7.8, color: T.suave, marginTop: 2 }}>
              Las comunicaciones no se editan ni se borran en LOGIKS.CO. Esta huella cambia si cambia cualquier dato del documento.
            </Text>
            <Text style={{ fontFamily: "Mono", fontSize: 6.8, color: T.tinta, marginTop: 4 }}>SHA-256 {huella}</Text>
          </View>
        </View>
      </Page>
    </Document>,
  );
}
