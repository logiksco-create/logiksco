import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularAlertas } from "@/domain/alertas";
import { situacion170, tocaRecordatorio } from "@/domain/cumplimiento";
import { resumenesDiarios } from "@/domain/tareas";
import { hoyISO } from "@/domain/fechas";
import type { Alerta } from "@/domain/types";
import { env } from "@/lib/env";
import { SupabaseRepositorio, mapEmpresa } from "./datos/supabase/repositorio-supabase";
import { correo } from "./correo";
import { plantillaCorreo } from "./correo/plantilla";
import { notificar } from "./notificaciones";
import { fecha } from "@/lib/formato";

const SISTEMA = { id: "00000000-0000-0000-0000-000000000000", nombre: "LOGIKS.CO", correo: "", roles: ["admin" as const] };

/**
 * Tarea diaria (RF-18, RF-31, RF-32), por empresa:
 *  1. Calcula las alertas y las guarda (idempotente por clave); las que ya no
 *     aplican quedan como atendidas.
 *  2. Envía a cada usuario un resumen con sus alertas NUEVAS según su rol.
 *  3. Envía al cliente el recordatorio de la 170 a 30, 15 y 5 días (una vez).
 * Sin proveedor de correo, los pasos 2 y 3 solo quedan registrados.
 */
export async function tareaDiaria(sv: SupabaseClient) {
  const hoy = hoyISO();
  const resultado = { empresas: 0, alertasNuevas: 0, alertasCerradas: 0, resumenes: 0, recordatorios170: 0, errores: [] as string[] };
  const { data: empresas, error } = await sv.from("empresas").select("*");
  if (error) throw new Error(error.message);

  for (const filaEmpresa of empresas ?? []) {
    try {
      const repo = new SupabaseRepositorio(sv, mapEmpresa(filaEmpresa), SISTEMA, () => sv, env.appUrl);
      const [cotizaciones, operaciones, terceros, formularios, usuarios, facturas] = await Promise.all([
        repo.cotizaciones(),
        repo.operaciones(),
        repo.terceros(),
        repo.formularios170(),
        repo.usuarios(),
        repo.facturas(),
      ]);
      const alertas = calcularAlertas({ hoy, cotizaciones, operaciones, terceros, formularios, facturas, bloquearDOSin170: repo.empresa.bloquearDOSin170 });

      // 1. Persistir
      const { data: abiertas } = await sv.from("alertas").select("clave").eq("empresa_id", repo.empresa.id).eq("estado", "abierta");
      const yaAbiertas = new Set((abiertas ?? []).map((a) => a.clave));
      const nuevas: Alerta[] = alertas.filter((a) => !yaAbiertas.has(a.id));
      if (alertas.length) {
        const { error: e } = await sv.from("alertas").upsert(
          alertas.map((a) => ({
            empresa_id: repo.empresa.id,
            clave: a.id,
            tipo: a.tipo,
            severidad: a.severidad,
            titulo: a.titulo,
            detalle: a.detalle,
            href: a.href,
            estado: "abierta",
            actualizado_el: new Date().toISOString(),
          })),
          { onConflict: "empresa_id,clave" },
        );
        if (e) throw new Error(e.message);
      }
      const vigentes = new Set(alertas.map((a) => a.id));
      const cerrar = [...yaAbiertas].filter((c) => !vigentes.has(c));
      if (cerrar.length) {
        await sv.from("alertas").update({ estado: "atendida" }).eq("empresa_id", repo.empresa.id).in("clave", cerrar);
      }
      resultado.alertasNuevas += nuevas.length;
      resultado.alertasCerradas += cerrar.length;

      // 2. Resumen diario por usuario
      if (correo().activo) {
        for (const { usuario, alertas: suyas } of resumenesDiarios(usuarios, nuevas)) {
          await correo()
            .enviar({
              para: [usuario.correo],
              asunto: `${suyas.length} alerta${suyas.length > 1 ? "s" : ""} nueva${suyas.length > 1 ? "s" : ""} en LOGIKS.CO`,
              nombreRemitente: "LOGIKS.CO",
              html: plantillaCorreo({
                empresa: repo.empresa.razonSocial,
                color: repo.empresa.colorPrimario,
                logoUrl: repo.empresa.logoUrl,
                titulo: `Buenos días, ${usuario.nombre.split(" ")[0]}`,
                parrafos: suyas.slice(0, 15).map((a) => `• ${a.titulo}: ${a.detalle}`),
                boton: { texto: "Ver alertas", url: `${env.appUrl}/app/alertas` },
              }),
            })
            .then(() => resultado.resumenes++)
            .catch((e) => resultado.errores.push(`resumen ${repo.empresa.id}: ${e instanceof Error ? e.message : e}`));
        }
      }

      // 3. Recordatorios de la 170 al cliente (una sola vez por umbral)
      for (const t of terceros.filter((x) => x.tipo === "cliente")) {
        const s = situacion170(formularios.filter((f) => f.terceroId === t.id), hoy);
        if (!tocaRecordatorio(s) || !("formulario" in s) || !("diasRestantes" in s)) continue;
        const clave = `rec170-${t.id}-${s.formulario.vigenteHasta}-${s.diasRestantes}`;
        const { data: marcada } = await sv
          .from("alertas")
          .upsert(
            { empresa_id: repo.empresa.id, clave, tipo: "recordatorio_170", severidad: "baja", titulo: `Recordatorio 170 a ${t.razonSocial}`, estado: "atendida", entidad: "tercero", entidad_id: t.id },
            { onConflict: "empresa_id,clave", ignoreDuplicates: true },
          )
          .select("id");
        if (!marcada?.length) continue; // ya se envió
        const { count } = await sv.from("usuarios_cliente").select("usuario_id", { count: "exact", head: true }).eq("tercero_id", t.id).eq("activo", true);
        await notificar(repo, {
          entidad: "tercero",
          entidadId: t.id,
          para: t.contactos.map((k) => k.correo),
          asunto: `Tu formulario de la Circular 170 vence en ${s.diasRestantes} días`,
          titulo: "Actualiza tu conocimiento del cliente",
          parrafos: [
            `Tu formulario de conocimiento del cliente (Circular 170 de la DIAN) con ${repo.empresa.razonSocial} vence el ${fecha(s.formulario.vigenteHasta)}.`,
            "La actualización llega prellenada: solo confirmas o corriges y firmas.",
            count ? "Puedes hacerlo desde el portal." : "Tu comercial te enviará el enlace para actualizarlo.",
          ],
          boton: count ? { texto: "Actualizar en el portal", url: `${env.appUrl}/portal/circular-170` } : undefined,
          resumen: `Recordatorio automático: la Circular 170 vence en ${s.diasRestantes} días (${s.formulario.vigenteHasta}).`,
        });
        resultado.recordatorios170++;
      }
      resultado.empresas++;
    } catch (e) {
      resultado.errores.push(`${filaEmpresa.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return resultado;
}
