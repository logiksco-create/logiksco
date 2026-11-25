import "server-only";
import type React from "react";
import path from "node:path";
import QRCode from "qrcode";
import { Circle, Font, Image, Line, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { Bloque, Empresa, TipoServicio } from "@/domain/types";
import { catalogoBase } from "@/domain/catalogo";

/* =====================================================================
 * Sistema de diseño «Manifiesto» para los PDF de LOGIKS.CO
 *
 * Idea: los documentos se leen como un pase de abordar de carga. Códigos de
 * lugar grandes, ruta dibujada, talón perforado con el total, composición
 * del precio a la vista y QR para actuar. Tipografía con carácter técnico:
 *   - Space Grotesk: titulares, códigos y cifras grandes.
 *   - Manrope: texto de lectura.
 *   - JetBrains Mono: consecutivos, etiquetas y números tabulares.
 * Fuentes con licencia SIL OFL (ver fuentes/LICENSE-*.txt).
 * ===================================================================== */

const dir = path.join(process.cwd(), "src/server/pdf/fuentes");
let registradas = false;
export function registrarFuentes() {
  if (registradas) return;
  Font.register({
    family: "Grotesk",
    fonts: [
      { src: path.join(dir, "space-grotesk-latin-500-normal.woff"), fontWeight: 500 },
      { src: path.join(dir, "space-grotesk-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Manrope",
    fonts: [
      { src: path.join(dir, "manrope-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(dir, "manrope-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(dir, "manrope-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Mono",
    fonts: [
      { src: path.join(dir, "jetbrains-mono-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(dir, "jetbrains-mono-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  // Sin guiones de corte: en español parten mal las palabras.
  Font.registerHyphenationCallback((palabra) => [palabra]);
  registradas = true;
}

/* ---------------- Tokens ---------------- */

export const T = {
  tinta: "#0B1220",
  tinta2: "#1B2438",
  texto: "#2A3347",
  suave: "#5D677D",
  tenue: "#8C95A8",
  linea: "#E5E8EF",
  lavado: "#F5F6FA",
  papel: "#FFFFFF",
  exito: "#0E9F6E",
  alerta: "#D97706",
  peligro: "#DC2626",
  info: "#2563EB",
};

/** Colores fijos por bloque (la identidad no depende de la marca). */
export const COLOR_BLOQUE: Record<Bloque, string> = {
  origen: "#4F6BFF",
  flete: "#0EA5A4",
  destino: "#F59E0B",
  terrestre: "#8B5CF6",
  aduana: "#E11D48",
  seguro: "#10B981",
  otros: "#94A3B8",
};

export function marca(empresa: Empresa) {
  const c = /^#[0-9a-f]{6}$/i.test(empresa.colorPrimario) ? empresa.colorPrimario : "#3B5BFD";
  return { color: c, suave: mezclar(c, "#FFFFFF", 0.88), oscuro: mezclar(c, "#000000", 0.35) };
}

function mezclar(a: string, b: string, t: number) {
  const h = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [r1, g1, b1] = h(a);
  const [r2, g2, b2] = h(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
}

export const e = StyleSheet.create({
  pagina: { paddingTop: 32, paddingBottom: 50, paddingHorizontal: 40, fontFamily: "Manrope", fontSize: 9, color: T.texto, backgroundColor: T.papel },
  etiqueta: { fontFamily: "Mono", fontSize: 6.5, letterSpacing: 1.2, textTransform: "uppercase", color: T.tenue },
  titulo: { fontFamily: "Grotesk", fontWeight: 700, color: T.tinta },
  mono: { fontFamily: "Mono" },
  fila: { flexDirection: "row" },
});

/* ---------------- Códigos de lugar ---------------- */

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lugares = catalogoBase().filter((x) => x.tipo === "puerto" || x.tipo === "aeropuerto");

/** "Ningbo, China" → NGB · "Rionegro (MDE)" → MDE · "Medellín" → MED */
export function codigoLugar(texto: string): string {
  const entreParentesis = texto.match(/\(([A-Z]{3,5})\)/);
  if (entreParentesis) return entreParentesis[1];
  const t = sinTildes(texto);
  const hit = lugares.find((l) => {
    const n = sinTildes(l.nombre.split(" (")[0]);
    return t.startsWith(n) || n.startsWith(t.split(",")[0].trim());
  });
  if (hit?.codigo) return hit.codigo.length === 5 ? hit.codigo.slice(2) : hit.codigo;
  return sinTildes(texto).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "—";
}

/** "Ningbo, China" → "Ningbo" + "China" */
export function partirLugar(texto: string) {
  const [ciudad, ...resto] = texto.replace(/\s*\([A-Z]{3,5}\)/, "").split(",");
  return { ciudad: ciudad.trim(), region: resto.join(",").trim() };
}

/** Tarjeta oscura «boleto» reutilizable. */
export function Oscura({ children, estilo }: { children: React.ReactNode; estilo?: { [k: string]: string | number } }) {
  return <View style={{ backgroundColor: T.tinta, borderRadius: 14, padding: 18, ...estilo }}>{children}</View>;
}

/** Sello rotado (estado de un documento). */
export function Sello({ texto, sub, color }: { texto: string; sub?: string; color: string }) {
  return (
    <View style={{ transform: "rotate(-7deg)", borderWidth: 2, borderColor: color, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" }}>
      <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 13, color, letterSpacing: 1.5 }}>{texto}</Text>
      {sub ? <Text style={{ fontFamily: "Mono", fontSize: 6.5, color, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

/* ---------------- Íconos vectoriales ---------------- */

export function IconoServicio({ tipo, color, tam = 14 }: { tipo: TipoServicio; color: string; tam?: number }) {
  const s = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24">
      {tipo === "aereo" ? (
        <Path {...s} d="M2 16l20-6-20-6 4 6-4 6zM6 10h10" />
      ) : tipo === "terrestre" ? (
        <>
          <Path {...s} d="M2 6h12v10H2zM14 10h4l3 3v3h-7" />
          <Circle {...s} cx="6" cy="18" r="2" />
          <Circle {...s} cx="17" cy="18" r="2" />
        </>
      ) : tipo === "aduana" || tipo === "seguro" ? (
        <Path {...s} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5" />
      ) : (
        <>
          <Path {...s} d="M3 14h18l-2.5 5h-13L3 14zM6 14V9h12v5M9 9V6h6v3" />
        </>
      )}
    </Svg>
  );
}

export function Chulo({ color = T.exito, tam = 9 }: { color?: string; tam?: number }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 12 12">
      <Circle cx="6" cy="6" r="6" fill={color} />
      <Path d="M3.4 6.2l1.7 1.7 3.5-3.6" stroke="#FFFFFF" strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export function Equis({ color = T.peligro, tam = 9 }: { color?: string; tam?: number }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 12 12">
      <Circle cx="6" cy="6" r="6" fill={color} />
      <Path d="M4 4l4 4M8 4l-4 4" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Flecha de dirección: ↗ enviado · ↙ recibido */
export function FlechaDireccion({ saliente, color, tam = 10 }: { saliente: boolean; color: string; tam?: number }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 12 12">
      <Path
        d={saliente ? "M3 9L9 3M4.5 3H9v4.5" : "M9 3L3 9M7.5 9H3V4.5"}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Ruta: punto de salida, línea discontinua, ícono del servicio, aro de llegada. */
export function Ruta({ ancho, color, tipo, claro = true }: { ancho: number; color: string; tipo: TipoServicio; claro?: boolean }) {
  const base = claro ? "#FFFFFF" : T.tinta;
  return (
    <View style={{ width: ancho, alignItems: "center", justifyContent: "center" }}>
      <Svg width={ancho} height={22} viewBox={`0 0 ${ancho} 22`}>
        <Circle cx="5" cy="11" r="3.5" fill={color} />
        <Line x1="12" y1="11" x2={ancho / 2 - 15} y2="11" stroke={base} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="3 3" />
        <Line x1={ancho / 2 + 15} y1="11" x2={ancho - 12} y2="11" stroke={base} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="3 3" />
        <Circle cx={ancho - 5} cy="11" r="3.5" stroke={color} strokeWidth={1.5} fill="none" />
      </Svg>
      <View style={{ position: "absolute", left: ancho / 2 - 11, top: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
        <IconoServicio tipo={tipo} color="#FFFFFF" tam={12} />
      </View>
    </View>
  );
}

/* ---------------- QR ---------------- */

export function QR({ texto, tam = 72, color = T.tinta }: { texto: string; tam?: number; color?: string }) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const borde = 2;
  const total = n + borde * 2;
  // Une módulos contiguos de cada fila en un solo rectángulo (PDF liviano).
  const rects: { x: number; y: number; w: number }[] = [];
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (qr.modules.get(y, x)) {
        const ini = x;
        while (x < n && qr.modules.get(y, x)) x++;
        rects.push({ x: ini, y, w: x - ini });
      } else x++;
    }
  }
  return (
    <Svg width={tam} height={tam} viewBox={`0 0 ${total} ${total}`}>
      <Rect x={0} y={0} width={total} height={total} fill="#FFFFFF" />
      {rects.map((r, i) => (
        <Rect key={i} x={r.x + borde} y={r.y + borde} width={r.w} height={1.02} fill={color} />
      ))}
    </Svg>
  );
}

/* ---------------- Estructura de página ---------------- */

export function Encabezado({
  empresa,
  logo,
  tipoDoc,
  numero,
  sub,
}: {
  empresa: Empresa;
  logo?: { data: Buffer; format: "png" | "jpg" };
  tipoDoc: string;
  numero: string;
  sub?: string;
}) {
  const m = marca(empresa);
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
      <View style={{ maxWidth: 300 }}>
        {logo ? (
          <Image src={logo} style={{ maxHeight: 34, maxWidth: 150, objectFit: "contain", marginBottom: 7 }} />
        ) : (
          <Text style={[e.titulo, { fontSize: 15, marginBottom: 3 }]}>{empresa.razonSocial}</Text>
        )}
        {logo && <Text style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 9, color: T.tinta }}>{empresa.razonSocial}</Text>}
        <Text style={{ fontSize: 7.5, color: T.suave, marginTop: 1.5 }}>
          NIT {empresa.nit}
          {empresa.ciudad ? `  ·  ${empresa.ciudad}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.color, marginRight: 5 }} />
          <Text style={[e.etiqueta, { color: m.oscuro }]}>{tipoDoc}</Text>
        </View>
        <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 19, color: T.tinta, letterSpacing: -0.3 }}>{numero}</Text>
        {sub && <Text style={{ fontFamily: "Mono", fontSize: 7, color: T.suave, marginTop: 2 }}>{sub}</Text>}
      </View>
    </View>
  );
}

/** Franja de marca arriba y pie con línea perforada y numeración. */
export function Marco({ empresa, pie }: { empresa: Empresa; pie: string }) {
  const m = marca(empresa);
  return (
    <>
      <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, flexDirection: "row" }}>
        <View style={{ flex: 5, backgroundColor: m.color }} />
        <View style={{ flex: 1, backgroundColor: T.tinta }} />
      </View>
      <View fixed style={{ position: "absolute", bottom: 24, left: 40, right: 40 }}>
        <Svg width={532} height={6} viewBox="0 0 532 6">
          <Line x1="0" y1="3" x2="532" y2="3" stroke={T.linea} strokeWidth={1} strokeDasharray="2 3" />
        </Svg>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontFamily: "Mono", fontSize: 6.5, color: T.tenue }}>{pie}</Text>
          <Text
            style={{ fontFamily: "Mono", fontSize: 6.5, color: T.tenue }}
            render={({ pageNumber, totalPages }) => `LOGIKS.CO  ·  ${String(pageNumber).padStart(2, "0")}/${String(totalPages).padStart(2, "0")}`}
          />
        </View>
      </View>
    </>
  );
}

/** Celda etiqueta + valor. */
export function Dato({ etiqueta, valor, sub, flex = 1, claro }: { etiqueta: string; valor: string; sub?: string; flex?: number; claro?: boolean }) {
  return (
    <View style={{ flex, paddingRight: 8 }}>
      <Text style={[e.etiqueta, claro ? { color: "#8E9AB5" } : {}]}>{etiqueta}</Text>
      <Text style={{ fontFamily: "Manrope", fontWeight: 600, fontSize: 9.5, color: claro ? "#FFFFFF" : T.tinta, marginTop: 3 }}>{valor}</Text>
      {sub ? <Text style={{ fontSize: 7.5, color: claro ? "#A8B2C8" : T.suave, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}

/** Título de sección con número: «01  Detalle». */
export function Seccion({ n, titulo, derecha, color }: { n: string; titulo: string; derecha?: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 7 }}>
      <Text style={{ fontFamily: "Mono", fontWeight: 600, fontSize: 7, color, marginRight: 8 }}>{n}</Text>
      <Text style={{ fontFamily: "Grotesk", fontWeight: 700, fontSize: 11, color: T.tinta }}>{titulo}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: T.linea, marginHorizontal: 10 }} />
      {derecha ? <Text style={{ fontFamily: "Mono", fontSize: 7.5, color: T.suave }}>{derecha}</Text> : null}
    </View>
  );
}
