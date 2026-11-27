import { describe, expect, it } from "vitest";
import {
  debePausar,
  desenlace,
  enmascarar,
  esOpcionDeProducto,
  esperaReintento,
  fechaComoCampo,
  mismoNit,
  numeroDeFila,
} from "../src/logica";

describe("bot Finppi: decisiones críticas", () => {
  it("nunca reintenta después del punto de no retorno", () => {
    expect(desenlace("TIMEOUT", true)).toEqual({ job: "desconocido", factura: "estado_desconocido", reconciliar: true });
    expect(desenlace("SELECTOR_NOT_FOUND", true)).toMatchObject({ job: "desconocido" });
    expect(desenlace("PDF_INVALID", true)).toEqual({ job: "revision", factura: "revision" });
  });

  it("antes de «Enviar» solo reintenta por red o tiempo", () => {
    expect(desenlace("TIMEOUT", false)).toEqual({ job: "fallido", factura: "fallida", reintentar: true });
    expect(desenlace("VALUES_MISMATCH", false)).toEqual({ job: "fallido", factura: "fallida", reintentar: false });
    expect(desenlace("CONSECUTIVE_GAP", false)).toEqual({ job: "revision", factura: "revision" });
    expect(esperaReintento(1)).toBe(60_000);
    expect(esperaReintento(3)).toBe(1_800_000);
    expect(esperaReintento(4)).toBeNull();
  });

  it("pausa global con dos selectores perdidos seguidos", () => {
    expect(debePausar(["SELECTOR_NOT_FOUND", "SELECTOR_NOT_FOUND"])).toBe(true);
    expect(debePausar(["SELECTOR_NOT_FOUND", null])).toBe(false);
    expect(debePausar(["SELECTOR_NOT_FOUND"])).toBe(false);
  });

  it("verifica la empresa por NIT", () => {
    expect(mismoNit("OIKOR COLOMBIA SAS  NIT: 901.456.789-1", "901456789")).toBe(true);
    expect(mismoNit("OTRA SAS NIT 900.111.222", "901456789")).toBe(false);
  });

  it("fechas en el formato del campo", () => {
    expect(fechaComoCampo("2026-12-26", "2026-11-26")).toBe("2026-12-26");
    expect(fechaComoCampo("2026-12-26", "26/11/2026")).toBe("26/12/2026");
    expect(fechaComoCampo("2026-12-26", "26-11-2026")).toBe("26-12-2026");
  });

  it("no deja credenciales ni correos en los logs", () => {
    expect(enmascarar("login con clave S3creta! falló", ["S3creta!"])).toBe("login con clave •••• falló");
    expect(enmascarar("usuario facturacion@empresa.co")).toBe("usuario fa***@empresa.co");
  });

  it("lee números y productos del listado", () => {
    expect(numeroDeFila("ATFE ", " 65")).toBe("ATFE65");
    expect(esOpcionDeProducto("SRV-FLT - Flete internacional", "SRV-FLT")).toBe(true);
    expect(esOpcionDeProducto("SRV-FLT2 - Otro", "SRV-FLT")).toBe(false);
  });
});

describe("normalizar textos de Finppi", () => {
  it("ignora tildes, mayúsculas, espacios y asterisco", async () => {
    const { normalizar } = await import("../src/logica.ts");
    expect(normalizar("MEDELLÍN /  Antioquia")).toBe(normalizar("Medellin / Antioquia"));
    expect(normalizar("Regimen*")).toBe("regimen");
  });
});

describe("cliente en el listado de Finppi", () => {
  it("reconoce el nombre cortado con «...»", async () => {
    const { mismoCliente } = await import("../src/adapters/finppi/finppi.ts");
    expect(mismoCliente("Luis Miguel Ortiz R...", "Luis Miguel Ortiz Restrepo")).toBe(true);
    expect(mismoCliente("Luis Miguel Ortiz Restrepo", "Luis Miguel Ortiz Restrepo")).toBe(true);
    expect(mismoCliente("Luis Fernando Gó...", "Luis Miguel Ortiz Restrepo")).toBe(false);
    expect(mismoCliente("Lu...", "Luis Miguel Ortiz Restrepo")).toBe(false);
  });
});
