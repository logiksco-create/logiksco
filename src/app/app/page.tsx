import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CircleCheck, ListTodo, FileText, PlaneLanding, PlaneTakeoff, Ship, TrendingUp } from "lucide-react";
import { contexto } from "@/server/contexto";
import { cargarAlertas, cargarFlujo, cargarTodo, metricasComerciales } from "@/server/consultas";
import { esMio } from "@/domain/flujo";
import { EmbudoFlujo, TarjetaPaso } from "@/components/app/flujo";
import { Encabezado, Indicador } from "@/components/app/encabezado";
import { AlertaItem } from "@/components/app/alerta-item";
import { EstadoDOBadge, IconoServicio } from "@/components/estados";
import { Avatar, Progreso, Tarjeta, TarjetaEncabezado, Vacio } from "@/components/ui";
import { avance, hitoActual } from "@/domain/operacion";
import { diasEntre } from "@/domain/fechas";
import { diaMes, dineroCorto, porcentaje } from "@/lib/formato";

export const metadata = { title: "Inicio" };

function saludo() {
  const h = Number(
    new Intl.DateTimeFormat("es-CO", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }).format(new Date()),
  );
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function Inicio() {
  const repo = await contexto();
  // Empresa recién registrada: primero el asistente de bienvenida.
  if (repo.empresa.configurada === false && repo.usuario.roles.includes("admin")) redirect("/app/bienvenida");
  const [datos, alertas, m, flujo] = await Promise.all([cargarTodo(repo), cargarAlertas(repo), metricasComerciales(repo), cargarFlujo(repo)]);
  const mios = flujo.filter((p) => esMio(p, repo.usuario));
  const mostrar = (mios.length ? mios : flujo.filter((p) => p.detenido)).slice(0, 6);
  const { operaciones, terceros, usuarios, hoy } = datos;
  const activas = operaciones.filter((o) => o.estado !== "cerrado" && o.estado !== "entregado");
  const cliente = (id: string) => terceros.find((t) => t.id === id)?.razonSocial ?? "—";
  const usuario = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "—";

  // Salidas y llegadas de los próximos 7 días (RF-33).
  const proximos = activas
    .flatMap((o) =>
      o.hitos
        .filter((h) => (h.nombre === "ETD" || h.nombre === "ETA") && !h.real && h.estimada)
        .map((h) => ({ op: o, hito: h, dias: diasEntre(hoy, h.estimada!) })),
    )
    .filter((x) => x.dias >= 0 && x.dias <= 7)
    .sort((a, b) => a.dias - b.dias);

  return (
    <>
      <Encabezado
        titulo={`${saludo()}, ${repo.usuario.nombre.split(" ")[0]}`}
        descripcion={`Así va la operación de ${repo.empresa.razonSocial} hoy.`}
      />

      <Tarjeta className="mb-6">
        <TarjetaEncabezado
          titulo={mios.length ? `Tus siguientes pasos · ${mios.length}` : "Tus siguientes pasos"}
          descripcion={
            mios.length
              ? "Negocios que esperan algo de ti, los detenidos primero."
              : flujo.some((p) => p.detenido)
                ? "No tienes pendientes. Estos negocios del equipo están detenidos."
                : "Nada pendiente de tu parte. Todos los negocios avanzan."
          }
          accion={
            <Link href="/app/flujo" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-fg hover:underline">
              Ver el flujo <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <div className="px-5 pb-5">
          <EmbudoFlujo pasos={flujo} href={(e) => (e ? `/app/flujo?ver=todos&etapa=${e}` : "/app/flujo")} />
          {mostrar.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted">
              <ListTodo className="size-4" /> Cuando un cliente necesite algo de ti, aparecerá aquí.
            </p>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {mostrar.map((p) => (
                <TarjetaPaso key={p.id} p={p} usuarios={usuarios} mostrarEtapa />
              ))}
            </div>
          )}
        </div>
      </Tarjeta>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador
          etiqueta="Operaciones activas"
          valor={activas.length}
          detalle={`${operaciones.filter((o) => o.estado === "en_transito").length} en tránsito`}
          icono={<Ship />}
        />
        <Indicador
          etiqueta="Cotizaciones por responder"
          valor={m.pendientes}
          detalle={`${dineroCorto(m.valorPendiente)} en juego`}
          icono={<FileText />}
          tono="info"
        />
        <Indicador
          etiqueta="Ventas aceptadas"
          valor={dineroCorto(m.ventas)}
          detalle={`Utilidad ${dineroCorto(m.utilidad)} · margen ${porcentaje(m.margen)}`}
          icono={<TrendingUp />}
          tono="exito"
        />
        <Indicador
          etiqueta="Tasa de conversión"
          valor={porcentaje(m.conversion)}
          detalle={`${m.aceptadas} aceptadas de ${m.enviadas} enviadas · 30 días`}
          icono={<CircleCheck />}
          tono="alerta"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Tarjeta className="xl:col-span-2">
          <TarjetaEncabezado
            titulo="Operaciones en curso"
            descripcion="Avance según hitos con fecha real"
            accion={
              <Link href="/app/operaciones" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-fg hover:underline">
                Ver todas <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {activas.length === 0 ? (
            <Vacio icono={<Ship />} titulo="Sin operaciones activas" />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {activas.map((o) => {
                const actual = hitoActual(o);
                return (
                  <li key={o.id}>
                    <Link
                      href={`/app/operaciones/${o.id}`}
                      className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:grid-cols-[auto_1fr_180px_auto]"
                    >
                      <IconoServicio tipo={o.tipo} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <span className="font-mono text-[13px] whitespace-nowrap">{o.consecutivo}</span>
                          <span className="truncate text-muted">· {cliente(o.clienteId)}</span>
                        </p>
                        <p className="truncate text-[13px] text-muted">
                          {o.origen} → {o.destino}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <div className="mb-1.5 flex justify-between text-xs text-muted">
                          <span>{actual ? `Sigue: ${actual.nombre}` : "Completado"}</span>
                          <span className="tabular">{Math.round(avance(o) * 100)}%</span>
                        </div>
                        <Progreso valor={avance(o)} />
                      </div>
                      <div className="hidden items-center gap-2 sm:flex">
                        <EstadoDOBadge estado={o.estado} />
                        <Avatar nombre={usuario(o.responsableId)} className="size-7 text-[10px]" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta>
          <TarjetaEncabezado
            titulo="Alertas abiertas"
            descripcion={`${alertas.filter((a) => a.severidad === "alta").length} de prioridad alta`}
            accion={
              <Link href="/app/alertas" className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-fg hover:underline">
                Ver todas <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          <div className="space-y-0.5 px-2 pb-3">
            {alertas.length === 0 ? (
              <Vacio icono={<CircleCheck />} titulo="Todo en orden" descripcion="No hay alertas abiertas." />
            ) : (
              alertas.slice(0, 5).map((a) => <AlertaItem key={a.id} alerta={a} compacta />)
            )}
          </div>
        </Tarjeta>
      </div>

      <Tarjeta className="mt-6">
        <TarjetaEncabezado titulo="Próximos 7 días" descripcion="Salidas (ETD) y llegadas (ETA) estimadas" />
        {proximos.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">No hay salidas ni llegadas programadas esta semana.</p>
        ) : (
          <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
            {proximos.map(({ op, hito, dias }) => (
              <li key={hito.id}>
                <Link
                  href={`/app/operaciones/${op.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 transition-colors hover:border-border-strong"
                >
                  <span className="flex size-10 flex-col items-center justify-center rounded-lg bg-surface text-center shadow-card">
                    <span className="text-[10px] uppercase text-subtle">{diaMes(hito.estimada!).mes}</span>
                    <span className="text-sm leading-none font-semibold tabular">{diaMes(hito.estimada!).dia}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      {hito.nombre === "ETD" ? (
                        <PlaneTakeoff className="size-3.5 text-brand-fg" />
                      ) : (
                        <PlaneLanding className="size-3.5 text-accent" />
                      )}
                      {hito.nombre === "ETD" ? "Salida" : "Llegada"} · {op.consecutivo}
                    </span>
                    <span className="block truncate text-xs text-muted">{cliente(op.clienteId)}</span>
                  </span>
                  <span className="text-xs font-medium text-muted">
                    {dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} d`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
