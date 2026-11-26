"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "@/lib/zod";
import { modoDemo } from "@/lib/env";
import { contexto, tieneRol } from "../contexto";
import { ErrorNegocio } from "../datos/errores";
import { crearFacturaMegafoco, crearTerceroMegafoco, megafocoDisponible } from "../megafoco";
import { vencimiento } from "@/domain/einvoice";
import { hoyISO } from "@/domain/fechas";
import { lineasDesdeOperaciones, operacionesFacturadas, payloadMegafoco } from "@/domain/facturacion";

type R = { ok: true; mensaje?: string } | { ok: false; error: string };

async function intentar(fn: () => Promise<string | void>): Promise<R> {
  try {
    const mensaje = await fn();
    revalidatePath("/app", "layout");
    return { ok: true, mensaje: mensaje ?? undefined };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Datos inválidos" };
    console.error(e);
    return { ok: false, error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
}

async function repoContable() {
  const repo = await contexto();
  if (!tieneRol(repo, "contabilidad")) throw new ErrorNegocio("Solo Contabilidad puede gestionar facturas");
  return repo;
}

/** RF-45 y RF-46: prefactura con los DO del cliente hasta su corte. */
export async function generarPrefactura(clienteId: string, operacionIds: string[]) {
  let nuevaId = "";
  const r = await intentar(async () => {
    const repo = await repoContable();
    const ids = z.array(z.string().min(1)).min(1, "Selecciona al menos un DO").parse(operacionIds);
    const [cliente, ops, facturas] = await Promise.all([repo.tercero(clienteId), repo.operaciones(), repo.facturas()]);
    if (!cliente) throw new ErrorNegocio("El cliente no existe");
    const ya = operacionesFacturadas(facturas);
    const elegidas = ops.filter((o) => ids.includes(o.id) && o.clienteId === clienteId);
    if (elegidas.length !== ids.length || elegidas.some((o) => ya.has(o.id))) {
      throw new ErrorNegocio("Algún DO ya fue facturado o no pertenece al cliente");
    }
    // Las condiciones de facturación vienen de la cotización del primer DO.
    const q = await repo.cotizacion(elegidas[0].cotizacionId);
    const cond = q?.facturacion;
    const moneda = cond?.monedaFactura ?? cliente.acuerdo?.moneda ?? "COP";
    const f = await repo.crearPrefactura({
      clienteId,
      moneda,
      trm: elegidas[0].trm,
      lineas: lineasDesdeOperaciones(elegidas, moneda),
      operaciones: ids,
    });
    const plazo = cond?.plazoDias ?? cliente.acuerdo?.plazoPagoDias ?? 0;
    const tipoPago = cond?.tipoPago ?? (plazo > 0 ? "Crédito" : "Contado");
    await repo.actualizarFactura(f.id, {
      tipoPago,
      metodoPago: cond?.metodoPago ?? "Acuerdo mutuo",
      tipoOperacion: cond?.tipoOperacion ?? "Estándar",
      vencimiento: vencimiento(hoyISO(), tipoPago, plazo),
    });
    nuevaId = f.id;
  });
  if (!r.ok) return r;
  redirect(`/app/facturacion/${nuevaId}`);
}

const linea = z.object({
  operacionId: z.string(),
  descripcion: z.string().trim().min(1).max(300),
  tipo: z.enum(["propio", "terceros"]),
  cantidad: z.number().positive(),
  valorUnitario: z.number().min(0),
  ivaPct: z.number().min(0).max(100),
  productoFinppi: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(30).optional()),
  ivaFinppi: z.enum(["Ninguno", "IVA-0", "IVA-5", "IVA-19"]).optional(),
});

export async function guardarLineas(id: string, lineas: z.input<typeof linea>[]) {
  return intentar(async () => {
    const repo = await repoContable();
    await repo.actualizarLineas(id, z.array(linea).min(1).parse(lineas));
    return "Prefactura guardada";
  });
}

/** RF-47 y RF-48: aprobar y enviar a Megafoco, que la emite con el bot de Finppi. */
export async function enviarAMegafoco(id: string) {
  return intentar(async () => {
    const repo = await repoContable();
    const f = await repo.factura(id);
    if (!f) throw new ErrorNegocio("La prefactura no existe");
    if (f.estado !== "borrador" && f.estado !== "aprobada" && f.estado !== "rechazada") {
      throw new ErrorNegocio("Esta factura ya fue enviada");
    }

    if (modoDemo) {
      // Simulación visible del flujo: en producción el estado llega por webhook.
      await repo.actualizarFactura(id, {
        estado: "emitida",
        megafocoId: `demo-${id.slice(0, 8)}`,
        numero: `FE-DEMO-${String((await repo.facturas()).filter((x) => x.numero).length + 1).padStart(4, "0")}`,
        cufe: randomBytes(48).toString("hex"),
        error: undefined,
      });
      return "Emitida (simulación del modo demo)";
    }

    const llave = await repo.llaveMegafoco();
    if (!llave) throw new ErrorNegocio("Conecta Megafoco en Configuración antes de enviar facturas.");
    if (!megafocoDisponible()) throw new ErrorNegocio("La integración con Megafoco aún no está habilitada en esta instalación.");

    await repo.actualizarFactura(id, { estado: "aprobada", error: undefined });
    const cliente = (await repo.tercero(f.clienteId))!;
    const ops = (await repo.operaciones()).filter((o) => f.operaciones.includes(o.id));
    try {
      await crearTerceroMegafoco(llave, {
        nit: cliente.nit,
        razon_social: cliente.razonSocial,
        correo: cliente.contactos[0]?.correo,
      });
      const r = await crearFacturaMegafoco(llave, payloadMegafoco(f, cliente, ops.map((o) => o.consecutivo)));
      await repo.actualizarFactura(id, { estado: "en_cola", megafocoId: r.id });
      return "Enviada a Megafoco. Te avisaremos cuando quede emitida.";
    } catch (e) {
      await repo.actualizarFactura(id, { error: e instanceof Error ? e.message : "Error al enviar" });
      throw e;
    }
  });
}

export async function conectarMegafoco(_: unknown, formData: FormData): Promise<R> {
  return intentar(async () => {
    const repo = await contexto();
    const llave = z.string().trim().min(16, "La llave de Megafoco no es válida").max(500).parse(formData.get("llave"));
    await repo.guardarLlaveMegafoco(llave);
    return "Megafoco conectado. La llave quedó cifrada.";
  });
}
