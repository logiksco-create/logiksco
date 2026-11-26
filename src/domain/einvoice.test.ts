import { describe, expect, it } from "vitest";
import {
  bloqueosEmision,
  documentoLimpio,
  extraerCufe,
  faltantesFiscales,
  fiscalSugerido,
  leerValorFinppi,
  lineasEnCop,
  payloadEmision,
  referenciaFactura,
  totalesCoinciden,
  totalesCop,
  totalesOriginales,
  urlDian,
  vencimiento,
  verificarConsecutivo,
} from "./einvoice";
import type { DatosFiscales, LineaFactura } from "./types";

const lineas: LineaFactura[] = [
  { operacionId: "o1", descripcion: "Flete marítimo", tipo: "terceros", cantidad: 2, valorUnitario: 1250.5, ivaPct: 0, productoFinppi: "FLT", ivaFinppi: "Ninguno" },
  { operacionId: "o1", descripcion: "Agenciamiento", tipo: "propio", cantidad: 1, valorUnitario: 180, ivaPct: 19, productoFinppi: "AGE", ivaFinppi: "IVA-19" },
];

const fiscal: DatosFiscales = {
  tipoPersona: "Juridica",
  tipoDocumento: "Nit",
  numeroDocumento: "900123456",
  nombres: "Importadora Andina SAS",
  apellidos: "Importadora Andina SAS",
  email: "facturas@andina.co",
  celular: "3001234567",
  regimen: "Responsable de iva",
  responsabilidadFiscal: "No aplica (ninguna de las anteriores)",
  pais: "Colombia",
  ciudad: "MEDELLÍN / Antioquia",
  direccion: "Cra 43A # 1-50",
  telefono: "6045551234",
};

describe("facturación electrónica: USD → COP con TRM de referencia", () => {
  it("convierte cada precio unitario y calcula como Finppi", () => {
    const cop = lineasEnCop(lineas, "USD", 4012.37);
    expect(cop[0].precioCop).toBe(5017468.69); // 1250.5 × 4012.37 = 5017468.685 → mitad hacia arriba
    expect(cop[1].precioCop).toBe(722226.6);
    expect(cop[0].ivaCop).toBe(0);
    expect(cop[1].ivaCop).toBe(137223.05);
    const t = totalesCop(cop);
    expect(t.subtotal).toBe(10757163.98);
    expect(t.total).toBe(Math.round((t.subtotal + t.iva) * 100) / 100);
    expect(t.terceros).toBe(10034937.38);
    const o = totalesOriginales(cop);
    expect(o).toEqual({ subtotal: 2681, iva: 34.2, total: 2715.2, terceros: 2501 });
  });

  it("en COP la TRM no aplica", () => {
    const cop = lineasEnCop([{ ...lineas[1], valorUnitario: 500000 }], "COP", 4000);
    expect(cop[0].precioCop).toBe(500000);
  });

  it("tolerancia de $1 y NaN como fallo", () => {
    expect(totalesCoinciden(100, 100.9)).toBe(true);
    expect(totalesCoinciden(100, 101.5)).toBe(false);
    expect(totalesCoinciden(100, NaN)).toBe(false);
    expect(leerValorFinppi("$ 1.234.567,89")).toBe(1234567.89);
    expect(leerValorFinppi("$1,234,567.89")).toBe(1234567.89);
    expect(leerValorFinppi("$ 722.227")).toBe(722227);
    expect(leerValorFinppi("$NaN")).toBeNaN();
  });
});

describe("facturación electrónica: datos fiscales", () => {
  it("limpia el NIT y sugiere datos desde el cliente", () => {
    expect(documentoLimpio("900.123.456-7")).toBe("900123456");
    const s = fiscalSugerido({ nit: "900.123.456-7", razonSocial: "Andina SAS", contactos: [{ correo: "a@b.co", telefono: "300" }] });
    expect(s.numeroDocumento).toBe("900123456");
    expect(s.tipoDocumento).toBe("Nit");
    expect(s.email).toBe("a@b.co");
  });

  it("detecta faltantes y formatos de Finppi", () => {
    expect(faltantesFiscales(fiscal)).toEqual([]);
    expect(faltantesFiscales({ ...fiscal, ciudad: "Medellín" })).toContain("Ciudad con formato «MUNICIPIO / Departamento»");
    expect(faltantesFiscales({ ...fiscal, email: "malo" })).toContain("Correo de facturación válido");
    expect(faltantesFiscales({ ...fiscal, celular: "" })).toContain("Celular");
  });
});

describe("facturación electrónica: emisión", () => {
  it("bloquea sin TRM, sin producto o con datos fiscales incompletos", () => {
    const base = { moneda: "USD" as const, lineas, fiscal, metodoPago: "Acuerdo mutuo", tipoOperacion: "Estándar", tipoPago: "Contado", fecha: "2026-11-26", hoy: "2026-11-26" };
    expect(bloqueosEmision({ ...base, trmReferencia: 4012.37 })).toEqual([]);
    expect(bloqueosEmision({ ...base })[0]).toMatch(/TRM/);
    expect(bloqueosEmision({ ...base, trmReferencia: 4000, lineas: [{ ...lineas[0], productoFinppi: undefined }] })[0]).toMatch(/producto/);
    expect(bloqueosEmision({ ...base, trmReferencia: 4000, fecha: "2026-12-01" })[0]).toMatch(/futura/);
  });

  it("arma los valores aprobados para el bot", () => {
    const p = payloadEmision({
      referencia: "LG-ABC234",
      nitEmisor: "901.555.444-1",
      fecha: "2026-11-26",
      vencimiento: vencimiento("2026-11-26", "Crédito", 30),
      tipoPago: "Crédito",
      tipoOperacion: "Estándar",
      metodoPago: "Transferencia Crédito Bancario",
      cliente: fiscal,
      crearCliente: true,
      lineas,
      moneda: "USD",
      trmReferencia: 4000,
    });
    expect(p.vencimiento).toBe("2026-12-26");
    expect(p.moneda).toBe("COP - Peso colombiano");
    expect(p.nitEmisor).toBe("901555444");
    expect(p.items[0]).toEqual({ producto: "FLT", descripcion: "Flete marítimo", precio: 5002000, cantidad: 2, iva: "Ninguno" });
    expect(p.totales.total).toBe(10004000 + 720000 + 136800);
    expect(p.original.totales.total).toBe(2715.2);
  });

  it("referencia con alfabeto sin ambigüedades", () => {
    expect(referenciaFactura(() => 0)).toBe("LG-222222");
    expect(referenciaFactura((n) => n - 1)).toMatch(/^LG-[2-9A-Z]{6}$/);
  });
});

describe("facturación electrónica: DIAN y consecutivos", () => {
  const cufe = "a".repeat(40) + "0123456789abcdef".repeat(3) + "b".repeat(8);
  it("extrae el CUFE aunque venga partido en líneas", () => {
    expect(cufe).toHaveLength(96);
    expect(extraerCufe(`Factura ATFE65\nCUFE: ${cufe}\nTotal`)).toBe(cufe);
    expect(extraerCufe(`CUFE:\n${cufe.slice(0, 50)}\n${cufe.slice(50)}`)).toBe(cufe);
    expect(extraerCufe(`C U F E\n${cufe.slice(0, 32)}\n${cufe.slice(32, 64)}\n${cufe.slice(64)}\nTotal`)).toBe(cufe);
    expect(extraerCufe(`CUFE: ${cufe.slice(0, 48)} ${cufe.slice(48)} Total`)).toBe(cufe);
    expect(extraerCufe(`${cufe.slice(0, 40)}\nabc`)).toBeNull();
    expect(extraerCufe("sin cufe")).toBeNull();
    expect(urlDian(cufe)).toContain(`documentkey=${cufe}`);
  });

  it("cero saltos: exige el siguiente del último conocido", () => {
    expect(verificarConsecutivo("ATFE65", null)).toEqual({ ok: true });
    expect(verificarConsecutivo("ATFE66", "ATFE65")).toEqual({ ok: true });
    const salto = verificarConsecutivo("ATFE67", "ATFE65");
    expect(salto.ok).toBe(false);
    if (!salto.ok && salto.motivo === "salto") expect(salto.faltantes).toEqual(["ATFE66"]);
    expect(verificarConsecutivo("ATFE64", "ATFE65")).toMatchObject({ ok: false, motivo: "retroceso" });
    expect(verificarConsecutivo("FV10", "ATFE65")).toMatchObject({ ok: false, motivo: "otra_serie" });
  });
});

import { enLetras } from "./letras";
describe("valor en letras", () => {
  it("dólares y pesos con centavos", () => {
    expect(enLetras(2515.21, "USD")).toBe("DOS MIL QUINIENTOS QUINCE DÓLARES CON VEINTIÚN CENTAVOS");
    expect(enLetras(20037580.3, "COP")).toBe("VEINTE MILLONES TREINTA Y SIETE MIL QUINIENTOS OCHENTA PESOS CON TREINTA CENTAVOS M/CTE");
    expect(enLetras(1, "USD")).toBe("UN DÓLAR");
    expect(enLetras(100, "USD")).toBe("CIEN DÓLARES");
    expect(enLetras(21000, "COP")).toBe("VEINTIÚN MIL PESOS M/CTE");
    expect(enLetras(1000000, "COP")).toBe("UN MILLÓN DE PESOS M/CTE");
    expect(enLetras(4993.96, "USD")).toBe("CUATRO MIL NOVECIENTOS NOVENTA Y TRES DÓLARES CON NOVENTA Y SEIS CENTAVOS");
    expect(enLetras(101, "USD")).toBe("CIENTO UN DÓLARES");
  });
});
