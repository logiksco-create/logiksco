import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Moneda } from "@/domain/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const monedaFmt = {
  COP: new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "USD",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

export function dinero(valor: number, moneda: Moneda = "COP"): string {
  return monedaFmt[moneda].format(valor);
}

/** Formato compacto para tableros: $ 12,4 M */
export function dineroCorto(valor: number, moneda: Moneda = "COP"): string {
  const abs = Math.abs(valor);
  const signo = valor < 0 ? "-" : "";
  const pref = moneda === "USD" ? "US$ " : "$ ";
  if (abs >= 1e9) return `${signo}${pref}${(abs / 1e9).toFixed(1).replace(".", ",")} MM`;
  if (abs >= 1e6) return `${signo}${pref}${(abs / 1e6).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1e3) return `${signo}${pref}${Math.round(abs / 1e3)} mil`;
  return dinero(valor, moneda);
}

export function numero(valor: number, decimales = 0): string {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: decimales,
  }).format(valor);
}

export function porcentaje(valor: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(valor);
}

const fechaFmt = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fechaCortaFmt = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fechaHoraFmt = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

/** "24 nov 2026" a partir de yyyy-mm-dd */
export function fecha(iso?: string): string {
  if (!iso) return "—";
  return fechaFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)).replace(".", "").replaceAll(" de ", " ");
}

export function fechaCorta(iso?: string): string {
  if (!iso) return "—";
  return fechaCortaFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)).replace(".", "").replace(" de ", " ");
}

/** Día y mes abreviado por separado, para chips de calendario. */
export function diaMes(iso: string): { dia: string; mes: string } {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return {
    dia: String(d.getUTCDate()),
    mes: new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" }).format(d).replace(".", ""),
  };
}

export function fechaHora(iso?: string): string {
  if (!iso) return "—";
  return fechaHoraFmt.format(new Date(iso));
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** "27 de noviembre" para textos dirigidos al cliente. */
export function fechaLegibleCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/** Pesos con centavos: valores fiscales que van a Finppi/DIAN. */
export function pesosExactos(valor: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}
