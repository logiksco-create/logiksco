import type { Alerta, Rol, TipoAlerta, Usuario } from "./types";

/** Quién recibe cada tipo de alerta en el resumen diario (RF-31). */
export const ROLES_POR_ALERTA: Record<TipoAlerta, Rol[]> = {
  tarifa_vencida: ["operaciones", "comercial"],
  hito_atrasado: ["operaciones"],
  eta_proxima: ["operaciones"],
  cotizacion_por_vencer: ["comercial"],
  f170_por_vencer: ["cumplimiento", "comercial"],
  corte_facturacion: ["contabilidad"],
  factura_rechazada: ["contabilidad"],
  aceptacion_por_verificar: ["comercial"],
  cotizacion_sin_enviar: ["comercial"],
  f170_por_pedir: ["comercial"],
  f170_por_revisar: ["cumplimiento"],
  listo_para_do: ["operaciones", "comercial"],
  do_sin_programar: ["operaciones"],
  do_por_facturar: ["contabilidad"],
};

/** Alertas que le tocan a un usuario según sus roles (el admin ve todas). */
export function alertasDeUsuario(u: Usuario, alertas: Alerta[]): Alerta[] {
  if (u.roles.includes("admin")) return alertas;
  return alertas.filter((a) => ROLES_POR_ALERTA[a.tipo].some((r) => u.roles.includes(r)));
}

/** Resumen diario por usuario con solo las alertas nuevas. */
export function resumenesDiarios(usuarios: Usuario[], nuevas: Alerta[]) {
  return usuarios
    .filter((u) => u.correo && u.activo !== false)
    .map((u) => ({ usuario: u, alertas: alertasDeUsuario(u, nuevas) }))
    .filter((r) => r.alertas.length > 0);
}
