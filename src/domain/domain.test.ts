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
import type { Alerta, Concepto, Cotizacion, Formulario170, Operacion, Tercero } from "./types";

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

import { nombreSeguro, rutaArchivo, rutaPertenece, validarArchivo } from "./archivos";

describe("archivos (RF-16, RF-28)", () => {
  it("valida tipo y tamaño", () => {
    expect(validarArchivo({ nombre: "bl.pdf", mime: "application/pdf", tamano: 1000 })).toBeNull();
    expect(validarArchivo({ nombre: "x.exe", mime: "application/x-msdownload", tamano: 10 })).toMatch(/no permitido/);
    expect(validarArchivo({ nombre: "g.pdf", mime: "application/pdf", tamano: 16 * 1024 * 1024 })).toMatch(/15 MB/);
  });
  it("limpia nombres y rutas", () => {
    expect(nombreSeguro("../../etc/Factura Señor #1.pdf")).toBe("Factura_Senor_1.pdf");
    const r = rutaArchivo("e1", "do", "o1", "abc", "BL final.pdf");
    expect(r).toBe("e1/do/o1/abc-BL_final.pdf");
    expect(rutaPertenece(r, "e1", "do", "o1")).toBe(true);
    expect(rutaPertenece(r, "e2", "do", "o1")).toBe(false);
    expect(rutaPertenece("e1/do/o1/../x", "e1", "do", "o1")).toBe(false);
  });
});

import { aCSV, calcularReportes, rangoPeriodo } from "./reportes";

describe("reportes (RF-53)", () => {
  it("calcula rangos de periodo", () => {
    expect(rangoPeriodo("mes", "2026-11-24")).toEqual({ desde: "2026-11-01", hasta: "2026-11-24" });
    expect(rangoPeriodo("trimestre", "2026-11-24").desde).toBe("2026-09-01");
  });
  it("agrupa ventas y utilidad por cliente y tipo", () => {
    const q = cotizacion({ estado: "aceptada", fechaEmision: "2026-11-02" });
    const op: Operacion = {
      id: "o1", empresaId: "e1", consecutivo: "DO-1", cotizacionId: q.id, clienteId: "t1", responsableId: "u1",
      tipo: "maritimo_fcl", origen: "A", destino: "B", estado: "abierto", abiertoEl: "2026-11-05", trm: 4000,
      conceptos: q.conceptos, hitos: [],
    };
    const r = calcularReportes({
      hoy: "2026-11-24", periodo: "mes", operaciones: [op, { ...op, id: "o2", abiertoEl: "2026-09-01" }],
      cotizaciones: [q], terceros: [], usuarios: [], formularios: [],
    });
    expect(r.total.operaciones).toBe(1);
    expect(r.porTipo[0].ventas).toBe(5_400_000);
    expect(r.porCliente[0].utilidadReal).toBe(1_000_000);
    expect(r.conversion[0]).toMatchObject({ enviadas: 1, aceptadas: 1, conversion: 1 });
  });
  it("exporta CSV para Excel con BOM, ; y comillas", () => {
    const csv = aCSV(["Cliente", "Ventas"], [['Flores "La Montaña"; SAS', 1234.5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Flores ""La Montaña""; SAS";1234,5');
  });
});

import { fechaCorte, lineasDesdeOperaciones, pendientesPorCliente, totalesFactura } from "./facturacion";
import type { Factura } from "./types";

describe("facturación (RF-45, RF-46)", () => {
  const op: Operacion = {
    id: "o1", empresaId: "e1", consecutivo: "DO-1", cotizacionId: "q1", clienteId: "t1", responsableId: "u1",
    tipo: "maritimo_fcl", origen: "A", destino: "B", estado: "entregado", abiertoEl: "2026-11-10", trm: 4000,
    conceptos: [
      concepto({ id: "a", descripcion: "Flete", costoUnitario: 900, ventaUnitaria: 1000, cantidad: 2 }),
      concepto({ id: "b", descripcion: "THC destino", moneda: "COP", ventaUnitaria: 500_000, paraTerceros: true }),
    ],
    hitos: [],
  };
  const cliente = { id: "t1", empresaId: "e1", tipo: "cliente", nit: "1", razonSocial: "C", ciudad: "", contactos: [], acuerdo: { diaCorte: 25, plazoPagoDias: 30, moneda: "COP" } } as Tercero;

  it("calcula la fecha de corte vigente", () => {
    expect(fechaCorte(25, "2026-11-24")).toBe("2026-10-25");
    expect(fechaCorte(25, "2026-11-25")).toBe("2026-11-25");
    expect(fechaCorte(31, "2026-11-30")).toBe("2026-11-30");
  });

  it("separa propios y terceros, convierte moneda y sugiere IVA solo a propios", () => {
    const l = lineasDesdeOperaciones([op], "COP");
    expect(l[0]).toMatchObject({ tipo: "propio", valorUnitario: 4_000_000, cantidad: 2, ivaPct: 19 });
    expect(l[1]).toMatchObject({ tipo: "terceros", valorUnitario: 500_000, ivaPct: 0 });
    expect(totalesFactura(l)).toEqual({ propios: 8_000_000, terceros: 500_000, iva: 1_520_000, total: 10_020_000 });
  });

  it("lista todos los DO no facturados y sugiere los avanzados dentro del corte", () => {
    const hoy = "2026-11-26";
    const p = pendientesPorCliente([op], [], [cliente], hoy)[0];
    expect(p.operaciones).toHaveLength(1);
    expect(p.sugeridas).toEqual(["o1"]);
    const f = { estado: "emitida", operaciones: ["o1"] } as Factura;
    expect(pendientesPorCliente([op], [f], [cliente], hoy)).toHaveLength(0);
    // Abierto o después del corte: aparece, pero no viene marcado.
    const abierto = pendientesPorCliente([{ ...op, estado: "abierto" }], [], [cliente], hoy)[0];
    expect(abierto.operaciones).toHaveLength(1);
    expect(abierto.sugeridas).toEqual([]);
    expect(pendientesPorCliente([{ ...op, abiertoEl: "2026-11-26" }], [], [cliente], hoy)[0].sugeridas).toEqual([]);
  });
});

import { cotizacionParaCliente, operacionParaCliente } from "./portal";

describe("portal del cliente (RF-36)", () => {
  it("nunca expone costos, proveedores ni utilidad", () => {
    const q = cotizacionParaCliente(cotizacion({ conceptos: [concepto({ costoUnitario: 900, ventaUnitaria: 1000, proveedorId: "p1", proveedorNombre: "Naviera" })] }));
    const json = JSON.stringify(q);
    expect(q.conceptos[0].costoUnitario).toBe(0);
    expect(json).not.toContain("Naviera");
    expect(json).not.toContain("p1");
    expect(q.conceptos[0].ventaUnitaria).toBe(1000);
    const o = operacionParaCliente({ ...({} as Operacion), conceptos: q.conceptos, costosReales: { a: 1 }, hitos: [] });
    expect(o.costosReales).toBeUndefined();
  });
});

import { estadoSegunHitos } from "./operacion";

describe("estado del DO por hitos (RF-26)", () => {
  const base = { estado: "abierto", hitos: [{ id: "1", nombre: "Salida" }, { id: "2", nombre: "Arribo" }, { id: "3", nombre: "Entrega" }] } as unknown as Operacion;
  it("avanza con los hitos reales y no retrocede", () => {
    expect(estadoSegunHitos(base)).toBe("abierto");
    expect(estadoSegunHitos({ ...base, hitos: [{ id: "1", nombre: "Salida", real: "2026-11-01" }] })).toBe("en_transito");
    expect(estadoSegunHitos({ ...base, hitos: [{ id: "3", nombre: "Entrega", real: "2026-11-01" }] })).toBe("entregado");
    expect(estadoSegunHitos({ ...base, estado: "entregado" })).toBe("entregado");
    expect(estadoSegunHitos({ ...base, estado: "cerrado", hitos: [{ id: "1", nombre: "Salida", real: "2026-11-01" }] })).toBe("cerrado");
  });
});

import { alertasDeUsuario, resumenesDiarios } from "./tareas";

describe("resumen diario de alertas (RF-31)", () => {
  const a = (tipo: Alerta["tipo"]): Alerta => ({ id: tipo, tipo, severidad: "alta", titulo: tipo, detalle: "", href: "/", fecha: "2026-11-25" });
  const todas = [a("tarifa_vencida"), a("f170_por_vencer"), a("factura_rechazada")];
  it("reparte por rol; el admin recibe todo", () => {
    expect(alertasDeUsuario({ id: "1", nombre: "", correo: "x", roles: ["operaciones"] }, todas).map((x) => x.tipo)).toEqual(["tarifa_vencida"]);
    expect(alertasDeUsuario({ id: "2", nombre: "", correo: "x", roles: ["cumplimiento"] }, todas).map((x) => x.tipo)).toEqual(["f170_por_vencer"]);
    expect(alertasDeUsuario({ id: "3", nombre: "", correo: "x", roles: ["admin"] }, todas)).toHaveLength(3);
  });
  it("omite usuarios sin correo o sin alertas", () => {
    const r = resumenesDiarios(
      [
        { id: "1", nombre: "A", correo: "", roles: ["admin"] },
        { id: "2", nombre: "B", correo: "b@x.co", roles: ["contabilidad"] },
        { id: "3", nombre: "C", correo: "c@x.co", roles: ["operaciones"] },
      ],
      [a("factura_rechazada")],
    );
    expect(r.map((x) => x.usuario.id)).toEqual(["2"]);
  });
});

import { esImagenValida, validarLogo } from "./archivos";

describe("logo de la empresa", () => {
  it("acepta solo PNG/JPG de hasta 1 MB y verifica la firma del archivo", () => {
    expect(validarLogo({ mime: "image/png", tamano: 2000 })).toBeNull();
    expect(validarLogo({ mime: "image/svg+xml", tamano: 2000 })).toMatch(/PNG o JPG/);
    expect(validarLogo({ mime: "image/jpeg", tamano: 2 * 1024 * 1024 })).toMatch(/1 MB/);
    expect(esImagenValida(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(esImagenValida(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(esImagenValida(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
