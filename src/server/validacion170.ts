import "server-only";
import { z } from "@/lib/zod";
import type { Datos170 } from "@/domain/types";

/** Campos mínimos del numeral 5.2.1 de la Circular 170 (RF-15). */
const esquema170 = z.object({
  razonSocial: z.string().trim().min(3, "Razón social requerida").max(200),
  nit: z.string().trim().min(5, "NIT requerido").max(20),
  domicilio: z.string().trim().min(5, "Dirección requerida").max(200),
  ciudad: z.string().trim().min(2, "Ciudad requerida").max(80),
  actividadEconomica: z.string().trim().min(3, "Actividad económica requerida").max(200),
  capitalSocial: z.coerce.number().min(0, "Capital inválido"),
  origenRecursos: z.string().trim().min(3, "Indica el origen de los recursos").max(300),
  formaPago: z.string().trim().min(3, "Indica la forma de pago").max(120),
  entidadFinanciera: z.string().trim().min(3, "Indica la entidad financiera y ciudad").max(200),
  rlNombre: z.string().trim().min(3, "Nombre del representante legal").max(120),
  rlDocumento: z.string().trim().min(5, "Documento del representante legal").max(40),
  beneficiarios: z.string().trim().min(3, "Indica los beneficiarios").max(500),
  esPEP: z.enum(["si", "no"], { message: "Indica si es PEP" }),
  autorizaDatos: z.literal("on", { message: "Debes autorizar el tratamiento de datos (Ley 1581 de 2012)" }),
  firma: z.string().trim().min(3, "Escribe tu nombre como firma"),
});

export function parsearFormulario170(formData: FormData): Datos170 {
  const d = esquema170.parse(Object.fromEntries(formData));
  return {
    razonSocial: d.razonSocial,
    nit: d.nit,
    domicilio: d.domicilio,
    ciudad: d.ciudad,
    actividadEconomica: d.actividadEconomica,
    capitalSocial: d.capitalSocial,
    origenRecursos: d.origenRecursos,
    formaPago: d.formaPago,
    entidadFinanciera: d.entidadFinanciera,
    representantes: [{ nombre: d.rlNombre, documento: d.rlDocumento, cargo: "Representante legal" }],
    beneficiarios: d.beneficiarios,
    esPEP: d.esPEP === "si",
    autorizaDatos: true,
  };
}
