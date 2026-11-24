import { describe, expect, it } from "vitest";
import {
  convertir,
  duplicarCotizacion,
  estadoEfectivo,
  formatearConsecutivo,
  puedeTransicionar,
  tarifasVencidas,
  totalesConceptos,
} from "./cotizacion";
import {
  habilitadoParaDO,
  requiereFormulario,
  situacion170,
  tocaRecordatorio,
} from "./cumplimiento";
import { calcularAlertas } from "./alertas";
import { diasEntre, sumarDias, sumarMeses } from "./fechas";
import type { Concepto, Cotizacion, Formulario170, Operacion, Tercero } from "./types";

const concepto = (p: Partial<Concepto>): Concepto => ({
  id: "c",
  bloque: "flete",
  descripcion: "Flete",
  moneda: "USD",
  unidad: "contenedor",
  cantidad: 1,
  costoUnitario: 0,
  ventaUnitaria: 0,
  ...p,
});

const cotizacion = (p: Partial<Cotizacion> = {}): Cotizacion => ({
  id: "q1",
  empresaId: "e1",
  consecutivo: "COT-2026-0001",
  version: 2,
  clienteId: "t1",
  comercialId: "u1",
  tipoServicio: "maritimo_fcl",
  incoterm: "FOB",
  origen: "Shanghái",
  destino: "Cartagena",
  mercancia: { descripcion: "Repuestos", piezas: 10, pesoKg: 1000, volumenM3: 20 },
  conceptos: [
    concepto({ id: "a", costoUnitario: 1000, ventaUnitaria: 1200, vigenciaTarifa: "2026-11-30" }),
    concepto({ id: "b", bloque: "destino", moneda: "COP", costoUnitario: 400_000, ventaUnitaria: 600_000 }),
  ],
  trm: 4000,
  monedaPresentacion: "COP",
  fechaEmision: "2026-11-01",
  vigenteHasta: "2026-11-20",
  estado: "enviada",
  terminos: "",
  tokenPublico: "tok",
  historial: [],
  ...p,
});

describe("fechas", () => {
  it("cuenta días y suma meses respetando fin de mes", () => {
    expect(diasEntre("2026-11-24", "2026-12-01")).toBe(7);
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2026-11-24", 12)).toBe("2027-11-24");
  });
});

describe("utilidad (RF-03)", () => {
  it("consolida COP y USD con la TRM", () => {
    const t = totalesConceptos(cotizacion().conceptos, "COP", 4000);
    expect(t.costo).toBe(4_000_000 + 400_000);
    expect(t.venta).toBe(4_800_000 + 600_000);
    expect(t.utilidad).toBe(1_000_000);
    expect(t.margen).toBeCloseTo(1_000_000 / 5_400_000);
  });

  it("convierte en ambos sentidos y rechaza TRM inválida", () => {
    expect(convertir(10, "USD", "COP", 4000)).toBe(40_000);
    expect(convertir(40_000, "COP", "USD", 4000)).toBe(10);
    expect(() => convertir(1, "USD", "COP", 0)).toThrow();
  });

  it("margen 0 cuando no hay venta", () => {
    expect(totalesConceptos([], "COP", 4000).margen).toBe(0);
  });
});

describe("estados (RF-04)", () => {
  it("solo permite transiciones válidas", () => {
    expect(puedeTransicionar("borrador", "enviada")).toBe(true);
    expect(puedeTransicionar("aceptada", "borrador")).toBe(false);
  });
  it("marca vencida una enviada fuera de vigencia, no una aceptada", () => {
    expect(estadoEfectivo(cotizacion(), "2026-11-21")).toBe("vencida");
    expect(estadoEfectivo(cotizacion({ estado: "aceptada" }), "2026-11-21")).toBe("aceptada");
    expect(estadoEfectivo(cotizacion(), "2026-11-20")).toBe("enviada");
  });
});

describe("duplicar (RF-08 a RF-10)", () => {
  const otro: Tercero = {
    id: "t2",
    empresaId: "e1",
    tipo: "cliente",
    nit: "900",
    razonSocial: "Otro",
    ciudad: "Medellín",
    contactos: [{ id: "k2", nombre: "Ana", cargo: "Compras", correo: "a@x.co" }],
    acuerdo: { diaCorte: 25, plazoPagoDias: 30, moneda: "USD" },
  };
  let n = 0;
  const base = {
    id: "q2",
    consecutivo: "COT-2026-0002",
    tokenPublico: "tok2",
    comercialId: "u2",
    hoy: "2026-12-05",
    vigenciaDias: 15,
    generarIdConcepto: () => `n${++n}`,
  };

  it("crea un borrador nuevo con referencia al origen y conceptos nuevos", () => {
    const origen = cotizacion();
    const { cotizacion: d } = duplicarCotizacion(origen, base);
    expect(d).toMatchObject({
      id: "q2",
      version: 1,
      estado: "borrador",
      origenId: "q1",
      vigenteHasta: "2026-12-20",
      clienteId: "t1",
    });
    expect(d.conceptos.map((c) => c.id)).not.toContain("a");
    // No muta el origen.
    expect(origen.conceptos[0].id).toBe("a");
  });

  it("aplica condiciones del nuevo cliente y advierte tarifas vencidas", () => {
    const { cotizacion: d, advertencias } = duplicarCotizacion(cotizacion(), {
      ...base,
      cliente: otro,
    });
    expect(d.clienteId).toBe("t2");
    expect(d.contactoId).toBe("k2");
    expect(d.monedaPresentacion).toBe("USD");
    expect(advertencias.map((c) => c.descripcion)).toEqual(["Flete"]);
  });

  it("formatea consecutivos", () => {
    expect(formatearConsecutivo("OIK", 2026, 7)).toBe("OIK-2026-0007");
  });
});

describe("Circular 170 (RF-14, RF-18, RF-19)", () => {
  const f = (p: Partial<Formulario170>): Formulario170 => ({
    id: "f",
    empresaId: "e1",
    terceroId: "t1",
    version: 1,
    estado: "aprobado",
    vigenteHasta: "2027-01-01",
    datos: {} as Formulario170["datos"],
    ...p,
  });

  it("sin formulario exige diligenciarlo y bloquea el DO", () => {
    const s = situacion170([], "2026-11-24");
    expect(requiereFormulario(s)).toBe(true);
    expect(habilitadoParaDO(s)).toBe(false);
  });

  it("vigente, por vencer y vencido", () => {
    expect(situacion170([f({ vigenteHasta: "2027-06-01" })], "2026-11-24").tipo).toBe("vigente");
    const pv = situacion170([f({ vigenteHasta: "2026-12-09" })], "2026-11-24");
    expect(pv.tipo).toBe("por_vencer");
    expect(habilitadoParaDO(pv)).toBe(true);
    expect(tocaRecordatorio(pv)).toBe(true); // faltan 15 días
    const v = situacion170([f({ vigenteHasta: "2026-11-01" })], "2026-11-24");
    expect(v.tipo).toBe("vencido");
    expect(requiereFormulario(v)).toBe(true);
  });

  it("una actualización en revisión no exige volver a llenarla", () => {
    const s = situacion170(
      [f({ vigenteHasta: "2026-11-01" }), f({ id: "f2", version: 2, estado: "en_revision" })],
      "2026-11-24",
    );
    expect(s.tipo).toBe("en_tramite");
    expect(requiereFormulario(s)).toBe(false);
    expect(habilitadoParaDO(s)).toBe(false);
  });
});

describe("alertas (RF-30, RF-31)", () => {
  const op: Operacion = {
    id: "o1",
    empresaId: "e1",
    consecutivo: "OIK-2026-0001",
    cotizacionId: "q1",
    clienteId: "t1",
    responsableId: "u1",
    tipo: "maritimo_fcl",
    origen: "Shanghái",
    destino: "Cartagena",
    estado: "abierto",
    abiertoEl: "2026-11-10",
    trm: 4000,
    conceptos: cotizacion().conceptos,
    hitos: [
      { id: "h1", nombre: "Booking", estimada: "2026-12-01" },
      { id: "h2", nombre: "Carga lista", estimada: "2026-11-20" },
    ],
  };

  it("alerta tarifa vencida frente al booking y hito atrasado", () => {
    const alertas = calcularAlertas({
      hoy: "2026-11-24",
      cotizaciones: [],
      operaciones: [op],
      terceros: [],
      formularios: [],
    });
    expect(alertas[0].tipo).toBe("tarifa_vencida");
    expect(alertas.map((a) => a.tipo)).toContain("hito_atrasado");
  });

  it("no alerta si la operación está cerrada", () => {
    const alertas = calcularAlertas({
      hoy: "2026-11-24",
      cotizaciones: [],
      operaciones: [{ ...op, estado: "cerrado" }],
      terceros: [],
      formularios: [],
    });
    expect(alertas).toHaveLength(0);
  });

  it("detecta tarifas vencidas por fecha", () => {
    expect(tarifasVencidas(op.conceptos, "2026-11-30")).toHaveLength(0);
    expect(tarifasVencidas(op.conceptos, "2026-12-01")).toHaveLength(1);
  });
});
