/**
 * Recorre el flujo completo del bot (healthcheck, prueba sin emitir y
 * emisión con punto de no retorno) contra un Finppi SIMULADO servido
 * localmente y una base de datos en memoria. No toca Finppi ni Supabase.
 * Necesita Chromium (CHROMIUM_PATH o el de Playwright); si no hay, se omite.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const hayNavegador = existsSync(CHROMIUM);

const h = vi.hoisted(() => {
  process.env.SUPABASE_URL = "http://localhost:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "prueba";
  process.env.FE_PERMITIR_EMISION = "si";
  process.env.CHROMIUM_PATH ??= "/opt/pw-browsers/chromium";
  return {
    logs: [] as string[],
    facturas: {} as Record<string, Record<string, unknown>>,
    jobs: {} as Record<string, Record<string, unknown>>,
    cuenta: {} as Record<string, unknown>,
    libro: [] as { numero: string; prefijo: string; seq: number; estado: string }[],
    archivos: {} as Record<string, Uint8Array>,
    nuevosJobs: [] as Record<string, unknown>[],
    clave: "Cl4ve-Secreta",
    productos: [] as { codigo: string; nombre: string }[],
    marcados: [] as string[],
  };
});

vi.mock("../src/db.ts", () => ({
  credenciales: async () => ({ usuario: "facturacion@oikor.co", clave: h.clave }),
  log: async (_j: unknown, paso: string, mensaje: string) => void h.logs.push(`${paso}: ${mensaje}`),
  actualizarCuenta: async (_e: string, c: Record<string, unknown>) => void Object.assign(h.cuenta, c),
  empresa: async () => ({ nit: "901.456.789-1", razon_social: "Oikor Colombia SAS" }),
  actualizarFactura: async (id: string, c: Record<string, unknown>) => void (h.facturas[id] = { ...h.facturas[id], ...c }),
  actualizarJob: async (id: string, c: Record<string, unknown>) => void (h.jobs[id] = { ...h.jobs[id], ...c }),
  ultimoConsecutivo: async (_e: string, prefijo: string) =>
    h.libro.filter((x) => x.prefijo === prefijo && x.estado === "emitido").sort((a, b) => b.seq - a.seq)[0]?.numero ?? null,
  registrarConsecutivo: async (f: { numero: string; prefijo: string; seq: number; estado: string }) => {
    h.libro = h.libro.filter((x) => x.numero !== f.numero).concat(f);
  },
  subirArchivo: async (ruta: string, bytes: Uint8Array) => void (h.archivos[ruta] = bytes),
  factura: async (id: string) => ({ id, ...h.facturas[id] }),
  db: { from: () => ({ insert: async (f: Record<string, unknown>) => void h.nuevosJobs.push(f) }) },
  marcarProductoEnFinppi: async (_e: string, codigo: string) => void h.marcados.push(codigo),
  cargarProductosFinppi: async (_e: string, p: { codigo: string; nombre: string }[]) => {
    h.productos = p;
    return { nuevos: p.length, existentes: 0, omitidos: 0 };
  },
}));

/* Finppi simulado: toda petición a app.finppi.com se responde localmente. */
// Las descargas servidas con route.fulfill se cancelan en Playwright, así que
// los PDF/XML los sirve un HTTP local de verdad.
vi.mock("../src/navegador.ts", async () => {
  const { chromium } = await import("playwright");
  const http = await import("node:http");
  const servidor = http.createServer(async (req, res) => {
    const m = (req.url ?? "").match(/^\/__archivo\/(pdf|xml)\/(\w+)$/);
    if (!m) return void res.writeHead(404).end();
    const cuerpo = m[1] === "pdf" ? await pdfMinimo(m[2]) : Buffer.from(`<Invoice><ID>${m[2]}</ID></Invoice>`);
    res.writeHead(200, { "content-type": m[1] === "pdf" ? "application/pdf" : "application/xml", "content-disposition": `attachment; filename=f.${m[1]}` });
    res.end(cuerpo);
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  const html = readFileSync(path.join(__dirname, "finppi-simulado.html"), "utf8").replace("<head>", `<head><script>window.BASE_ARCHIVOS = "${base}";</script>`);
  let nav: import("playwright").Browser | null = null;
  return {
    contextoLimpio: async () => {
      nav ??= await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
      const ctx = await nav.newContext({ acceptDownloads: true });
      await ctx.route("https://app.finppi.com/**", (r) => r.fulfill({ body: html, contentType: "text/html" }));
      return ctx;
    },
    cerrarNavegador: async () => {
      await nav?.close();
      servidor.close();
    },
  };
});

/** PDF como el de Finppi: número, NIT y CUFE partido en líneas. */
const CUFE = "ab12".repeat(24);
async function pdfMinimo(numero: string): Promise<Buffer> {
  const { createElement: h } = await import("react");
  const { Document, Page, Text, renderToBuffer } = await import("@react-pdf/renderer");
  const lineas = [`Factura electronica ${numero}`, "NIT 901.456.789-1", "CUFE:", CUFE.slice(0, 48), CUFE.slice(48)];
  return renderToBuffer(h(Document, null, h(Page, { size: "LETTER" }, ...lineas.map((l) => h(Text, { key: l }, l)))));
}

const payload = {
  referencia: "LG-PRUEB2",
  modo: "real",
  nitEmisor: "901456789",
  tipoFactura: "Factura de venta nacional",
  moneda: "COP - Peso colombiano",
  fecha: new Date().toISOString().slice(0, 10),
  vencimiento: new Date().toISOString().slice(0, 10),
  tipoPago: "Contado",
  tipoOperacion: "Estándar",
  metodoPago: "Transferencia Crédito Bancario",
  cliente: {
    tipoPersona: "Juridica", tipoDocumento: "Nit", numeroDocumento: "800333444", nombres: "Flores La Montaña SAS",
    apellidos: "Flores La Montaña SAS", email: "andres@floreslamontana.co", celular: "3000000000", regimen: "Responsable de iva",
    responsabilidadFiscal: "No aplica (ninguna de las anteriores)", pais: "Colombia", ciudad: "LA CEJA / Antioquia",
    direccion: "Vereda San José", telefono: "6045550000",
  },
  crearCliente: true,
  items: [
    { producto: "SRV-MAN", descripcion: "Manejo en finca", precio: 261767.02, cantidad: 1, iva: "IVA-19" },
    { producto: "TER-REE", descripcion: "Certificado ICA", precio: 95654.9, cantidad: 2, iva: "Ninguno" },
  ],
  totales: { subtotal: 453076.82, iva: 49735.73, total: 502812.55, terceros: 191309.8 },
  original: { moneda: "USD", trmReferencia: 4012.37, totales: { subtotal: 112.92, iva: 12.4, total: 125.32, terceros: 47.68 } },
};

const job = (extra: Record<string, unknown>) =>
  ({ id: `job-${Math.random()}`, empresa_id: "emp", factura_id: "fac-1", tipo: "emitir", dry_run: false, payload, intentos: 1, punto_no_retorno: false, ...extra }) as never;

describe.skipIf(!hayNavegador)("bot contra Finppi simulado", () => {
  let flujos: typeof import("../src/flujos.ts");
  beforeAll(async () => {
    flujos = await import("../src/flujos.ts");
  });
  afterAll(async () => {
    await (await import("../src/navegador.ts")).cerrarNavegador();
  });

  it("healthcheck: verifica el NIT y lee el próximo consecutivo sin guardar", async () => {
    await flujos.healthcheck(job({ tipo: "healthcheck", factura_id: null }));
    expect(h.cuenta.estado).toBe("activa");
    expect((h.cuenta.instantanea as { proximaFactura: string }).proximaFactura).toBe("SETT1");
    // Lee las listas reales del panel de cliente sin crear a nadie.
    const op = (h.cuenta.instantanea as { opcionesCliente: Record<string, string[]> }).opcionesCliente;
    expect(op.regimen).toContain("No responsable de iva");
    expect(op.ciudades).toContain("MEDELLÍN / Antioquia");
    expect(h.logs.join("\n")).not.toContain(h.clave);
  }, 60_000);

  it("prueba sin emitir: llena todo, compara totales y no pulsa «Continuar»", async () => {
    h.logs.length = 0;
    const j = job({ dry_run: true });
    await flujos.emitir(j);
    const texto = h.logs.join("\n");
    expect(texto).toContain("Totales de Finppi = aprobados");
    expect(texto).toContain("Nada se emitió");
    expect(h.libro).toHaveLength(0);
  }, 90_000);

  it("totales distintos: aborta con VALUES_MISMATCH antes de enviar", async () => {
    h.logs.length = 0;
    const malo = { ...payload, totales: { ...payload.totales, total: payload.totales.total + 50 } };
    await expect(flujos.emitir(job({ payload: malo }))).rejects.toMatchObject({ codigo: "VALUES_MISMATCH" });
    expect(h.facturas["fac-1"].estado).toBe("fallida");
    expect(h.libro).toHaveLength(0);
    // Deja la estructura de la página para corregir selectores, sin la contraseña.
    expect(h.jobs[Object.keys(h.jobs).pop()!].resultado).toBeTruthy();
    expect(JSON.stringify(h.jobs)).not.toContain(h.clave);
  }, 90_000);

  it("emisión: punto de no retorno, aceptada, CUFE del PDF y archivos guardados", async () => {
    h.logs.length = 0;
    const j = job({});
    await flujos.emitir(j);
    const f = h.facturas["fac-1"];
    expect(f.estado).toBe("emitida");
    expect(f.numero).toBe("SETT1");
    expect(f.cufe).toBe(CUFE);
    expect(String(f.pdf_finppi_path)).toBe("emp/fe/fac-1/original.pdf");
    expect(Object.keys(h.archivos).filter((k) => !k.includes("/diagnostico/"))).toEqual(["emp/fe/fac-1/original.pdf", "emp/fe/fac-1/original.xml"]);
    expect(h.libro.find((x) => x.numero === "SETT1")?.estado).toBe("emitido");
    const orden = h.logs.map((l) => l.split(":")[0]);
    expect(orden.indexOf("enviar")).toBeLessThan(orden.indexOf("resultado"));
  }, 120_000);

  it("cliente nuevo: lo crea con el panel «+» y lo selecciona (en prueba sin emitir)", async () => {
    h.logs.length = 0;
    h.libro = [];
    const nuevo = { ...payload, cliente: { ...payload.cliente, numeroDocumento: "901999000", nombres: "Tecnomédica Andina SAS", apellidos: "Tecnomédica Andina SAS", ciudad: "MEDELLÍN / Antioquia" } };
    await flujos.emitir(job({ dry_run: true, payload: nuevo }));
    expect(h.logs.join("\n")).toContain("Cliente creado en Finppi: Tecnomédica Andina SAS");
  }, 90_000);

  it("cliente nuevo persona natural: llena nombres y apellidos", async () => {
    h.logs.length = 0;
    h.libro = [];
    const nuevo = {
      ...payload,
      cliente: { ...payload.cliente, tipoPersona: "Natural", tipoDocumento: "Cédula de ciudadanía", numeroDocumento: "1017000111", nombres: "Ana María", apellidos: "Gómez Ruiz", ciudad: "Medellin / Antioquia" },
    };
    await flujos.emitir(job({ dry_run: true, payload: nuevo }));
    expect(h.logs.join("\n")).toContain("Cliente creado en Finppi: Ana María");
  }, 90_000);

  it("reconciliar: si no la encuentra aceptada, pide revisión y nunca emite", async () => {
    h.facturas["fac-2"] = { referencia: "LG-NOEXIS", numero_esperado: "SETT9" };
    await flujos.reconciliar(job({ tipo: "reconciliar", factura_id: "fac-2" }));
    expect(h.facturas["fac-2"].estado).toBe("revision");
    expect(h.facturas["fac-2"].numero).toBeUndefined();
  }, 60_000);

  it("modo prueba: pulsa «Guardar», queda como borrador y la factura de prueba en LOGIKS", async () => {
    h.logs.length = 0;
    h.libro = [];
    h.facturas["fac-3"] = {};
    await flujos.emitir(job({ factura_id: "fac-3", payload: { ...payload, modo: "borrador" } }));
    const f = h.facturas["fac-3"];
    expect(f.estado).toBe("emitida");
    expect(f.simulada).toBe(true);
    expect(f.cufe).toBeUndefined();
    const texto = h.logs.join("\n");
    expect(texto).toContain("Modo prueba: se pulsa «Guardar»");
    expect(texto).toContain("Guardada en Finppi como borrador");
    expect(texto).toContain("El borrador NO consumió consecutivo");
    expect(texto).not.toContain("Punto de no retorno: «Enviar»");
    expect(h.libro).toHaveLength(0);
  }, 120_000);

  it("productos: lee todas las páginas del listado de Finppi (solo lectura)", async () => {
    h.logs.length = 0;
    await flujos.sincronizarProductos(job({ tipo: "productos", factura_id: null }));
    expect(h.productos).toHaveLength(12);
    expect(h.productos.map((p) => p.codigo)).toContain("SRV-MAN");
    expect(h.productos.map((p) => p.codigo)).toContain("P-011");
    expect(h.logs.join("\n")).toContain("12 productos leídos en Finppi");
  }, 60_000);

  it("producto nuevo: lo crea en Finppi antes de la factura y no duplica los existentes", async () => {
    h.logs.length = 0;
    h.libro = [];
    const conNuevo = {
      ...payload,
      productosNuevos: [
        { codigo: "LG-001", nombre: "Servicio de prueba LOGIKS", iva: "IVA-19" },
        { codigo: "SRV-MAN", nombre: "Agenciamiento y manejo de carga", iva: "IVA-19" },
      ],
      items: [{ producto: "LG-001", descripcion: "Servicio nuevo", precio: 100000, cantidad: 1, iva: "IVA-19" }],
      totales: { subtotal: 100000, iva: 19000, total: 119000, terceros: 0 },
    };
    await flujos.emitir(job({ dry_run: true, payload: conNuevo }));
    const texto = h.logs.join("\n");
    expect(texto).toContain("Producto LG-001 creado en Finppi");
    expect(texto).toContain("El producto SRV-MAN ya existe en Finppi");
    expect(texto).toContain("Totales de Finppi = aprobados");
    expect(h.marcados).toEqual(["LG-001", "SRV-MAN"]);
  }, 120_000);

  it("cero saltos: si Finppi ofrece un número que no sigue al libro, bloquea", async () => {
    h.libro = [{ numero: "SETT5", prefijo: "SETT", seq: 5, estado: "emitido" }];
    h.facturas["fac-1"] = {};
    await expect(flujos.emitir(job({}))).rejects.toMatchObject({ codigo: "CONSECUTIVE_GAP" });
    expect(h.facturas["fac-1"].estado).toBe("revision");
  }, 90_000);
});
