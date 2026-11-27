import { createClient } from "@supabase/supabase-js";
import { config } from "./config.ts";
import { enmascarar } from "./logica.ts";

/** Cliente con la llave de servicio: solo existe en el servidor del bot. */
export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface Job {
  id: string;
  empresa_id: string;
  factura_id: string | null;
  tipo: "emitir" | "healthcheck" | "reconciliar" | "productos";
  dry_run: boolean;
  payload: Record<string, unknown>;
  intentos: number;
  punto_no_retorno: boolean;
}

function revisar(error: { message: string } | null, que: string) {
  if (error) throw new Error(`${que}: ${error.message}`);
}

export async function reclamarJob(): Promise<Job | null> {
  const { data, error } = await db.rpc("fe_reclamar_job", { p_worker: config.workerId });
  if (error) {
    // Carrera con otro worker sobre la misma empresa: se reintenta luego.
    if (error.code === "23505") return null;
    throw new Error(`reclamar: ${error.message}`);
  }
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

/** Devuelve false si el sistema está en pausa global. */
export async function latido(version: string): Promise<boolean> {
  const { data, error } = await db.rpc("fe_latido", { p_worker: config.workerId, p_version: version });
  revisar(error, "latido");
  return data !== false;
}

export async function credenciales(empresaId: string): Promise<{ usuario: string; clave: string } | null> {
  const { data, error } = await db.rpc("fe_credenciales", { p_empresa: empresaId });
  revisar(error, "credenciales");
  return (data as { usuario: string; clave: string } | null) ?? null;
}

/** Log visible en LOGIKS (sin secretos). */
export async function log(job: Job, paso: string, mensaje: string, nivel: "info" | "aviso" | "error" = "info", secretos: string[] = []) {
  const limpio = enmascarar(mensaje, secretos).slice(0, 1000);
  console.log(`[${job.id.slice(0, 8)}] ${paso}: ${limpio}`);
  await db.from("fe_job_logs").insert({ job_id: job.id, empresa_id: job.empresa_id, paso, nivel, mensaje: limpio });
}

export async function actualizarJob(id: string, cambios: Record<string, unknown>) {
  const { error } = await db.from("fe_jobs").update(cambios).eq("id", id);
  revisar(error, "actualizar job");
}

export async function actualizarFactura(id: string, cambios: Record<string, unknown>) {
  const { error } = await db.from("facturas").update(cambios).eq("id", id);
  revisar(error, "actualizar factura");
}

export async function actualizarCuenta(empresaId: string, cambios: Record<string, unknown>) {
  const { error } = await db.from("fe_cuentas").update({ ...cambios, actualizado_el: new Date().toISOString() }).eq("empresa_id", empresaId);
  revisar(error, "actualizar cuenta");
}

export async function empresa(empresaId: string): Promise<{ nit: string; razon_social: string }> {
  const { data, error } = await db.from("empresas").select("nit, razon_social").eq("id", empresaId).single();
  revisar(error, "empresa");
  return data!;
}

export async function factura(id: string) {
  const { data, error } = await db.from("facturas").select("*").eq("id", id).single();
  revisar(error, "factura");
  return data as { id: string; empresa_id: string; estado: string; referencia: string | null; numero_esperado: string | null; enviar_al_emitir: boolean };
}

/** Último consecutivo emitido conocido de la serie (libro, §5A.1). */
export async function ultimoConsecutivo(empresaId: string, prefijo: string): Promise<string | null> {
  const { data, error } = await db
    .from("fe_consecutivos")
    .select("numero, seq")
    .eq("empresa_id", empresaId)
    .eq("prefijo", prefijo)
    .in("estado", ["emitido", "externo"])
    .order("seq", { ascending: false })
    .limit(1);
  revisar(error, "libro");
  return data?.[0]?.numero ?? null;
}

export async function registrarConsecutivo(fila: {
  empresa_id: string;
  numero: string;
  prefijo: string;
  seq: number;
  estado: "emitido" | "en_vuelo" | "desconocido" | "externo" | "salto";
  factura_id?: string;
  origen?: "logiks" | "externo";
  cufe?: string;
}) {
  const { error } = await db.from("fe_consecutivos").upsert({ ...fila, visto_el: new Date().toISOString() }, { onConflict: "empresa_id,numero" });
  revisar(error, "registrar consecutivo");
}

export async function subirArchivo(ruta: string, bytes: Uint8Array, tipo: string) {
  const { error } = await db.storage.from("documentos").upload(ruta, bytes, { contentType: tipo, upsert: false });
  if (error && !/exists/i.test(error.message)) throw new Error(`subir ${ruta}: ${error.message}`);
}

export async function pausarSistema(motivo: string) {
  await db.from("fe_sistema").update({ pausado: true, motivo }).eq("id", 1);
}

/** Trabajos en cola que estarán disponibles dentro de `ms` (para no apagarse antes). */
export async function trabajosProximos(ms: number): Promise<number> {
  const { count, error } = await db
    .from("fe_jobs")
    .select("id", { count: "exact", head: true })
    .eq("estado", "en_cola")
    .lte("disponible_el", new Date(Date.now() + ms).toISOString());
  revisar(error, "trabajos próximos");
  return count ?? 0;
}

/** Carga en el catálogo de LOGIKS los productos de Finppi que falten (por código). */
export async function cargarProductosFinppi(
  empresaId: string,
  productos: { codigo: string; nombre: string; tipo?: string; precio?: string }[],
): Promise<{ nuevos: number; existentes: number; omitidos: number }> {
  const { data: actuales, error } = await db
    .from("catalogos")
    .select("codigo, nombre")
    .eq("empresa_id", empresaId)
    .eq("tipo", "producto_finppi");
  revisar(error, "catálogo");
  const codigos = new Set((actuales ?? []).map((x) => x.codigo));
  const nombres = new Set((actuales ?? []).map((x) => String(x.nombre).toLowerCase()));
  const filas: Record<string, unknown>[] = [];
  let omitidos = 0;
  for (const p of productos) {
    if (codigos.has(p.codigo)) continue;
    // El catálogo no admite dos nombres iguales: se distingue con el código.
    let nombre = p.nombre || p.codigo;
    if (nombres.has(nombre.toLowerCase())) nombre = `${nombre} (${p.codigo})`;
    if (nombres.has(nombre.toLowerCase())) {
      omitidos++;
      continue;
    }
    nombres.add(nombre.toLowerCase());
    codigos.add(p.codigo);
    filas.push({ empresa_id: empresaId, tipo: "producto_finppi", codigo: p.codigo.slice(0, 30), nombre: nombre.slice(0, 120), datos: { tipoFinppi: p.tipo, precio: p.precio, origen: "finppi" } });
  }
  if (filas.length) {
    const { error: e2 } = await db.from("catalogos").insert(filas);
    revisar(e2, "cargar productos");
  }
  return { nuevos: filas.length, existentes: productos.length - filas.length - omitidos, omitidos };
}

/** Marca en el catálogo de LOGIKS que el producto ya existe en Finppi. */
export async function marcarProductoEnFinppi(empresaId: string, codigo: string) {
  const { data } = await db.from("catalogos").select("id, datos").eq("empresa_id", empresaId).eq("tipo", "producto_finppi").eq("codigo", codigo).maybeSingle();
  if (!data) return;
  const { error } = await db.from("catalogos").update({ datos: { ...(data.datos ?? {}), enFinppi: true } }).eq("id", data.id);
  revisar(error, "marcar producto");
}
