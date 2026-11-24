import Link from "next/link";
import { FileText, Plus, Search } from "lucide-react";
import { contexto } from "@/server/contexto";
import { cargarTodo } from "@/server/consultas";
import { estadoEfectivo, totalesCotizacion } from "@/domain/cotizacion";
import { ESTADOS_COTIZACION, TIPOS_SERVICIO, type EstadoCotizacion } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import { EstadoCotizacionBadge, IconoServicio } from "@/components/estados";
import { BotonDuplicar } from "@/components/app/acciones-cotizacion";
import { BotonLink, Entrada, Tabla, Tarjeta, Td, Th, Vacio } from "@/components/ui";
import { cn, dinero, fecha, porcentaje } from "@/lib/formato";

export const metadata = { title: "Cotizaciones" };

export default async function Cotizaciones({ searchParams }: PageProps<"/app/cotizaciones">) {
  const { estado: filtroRaw, q: buscarRaw } = await searchParams;
  const filtro = typeof filtroRaw === "string" ? filtroRaw : "";
  const buscar = typeof buscarRaw === "string" ? buscarRaw.trim().toLowerCase() : "";

  const repo = await contexto();
  const { cotizaciones, terceros, hoy } = await cargarTodo(repo);
  const nombre = (id: string) => terceros.find((t) => t.id === id)?.razonSocial ?? "—";

  const filas = cotizaciones.map((q) => ({ q, estado: estadoEfectivo(q, hoy), t: totalesCotizacion(q) }));
  const conteo = (e: string) => filas.filter((f) => f.estado === e).length;
  const visibles = filas.filter(
    ({ q, estado }) =>
      (!filtro || estado === filtro) &&
      (!buscar ||
        q.consecutivo.toLowerCase().includes(buscar) ||
        nombre(q.clienteId).toLowerCase().includes(buscar) ||
        q.mercancia.descripcion.toLowerCase().includes(buscar) ||
        `${q.origen} ${q.destino}`.toLowerCase().includes(buscar)),
  );

  const pestanas: { valor: string; etiqueta: string; n: number }[] = [
    { valor: "", etiqueta: "Todas", n: filas.length },
    ...(Object.keys(ESTADOS_COTIZACION) as EstadoCotizacion[]).map((e) => ({
      valor: e,
      etiqueta: ESTADOS_COTIZACION[e],
      n: conteo(e),
    })),
  ].filter((p) => p.valor === "" || p.n > 0);

  const href = (estado: string) => {
    const p = new URLSearchParams();
    if (estado) p.set("estado", estado);
    if (buscar) p.set("q", buscar);
    const s = p.toString();
    return `/app/cotizaciones${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <Encabezado
        titulo="Cotizaciones"
        descripcion="Crea, duplica y envía cotizaciones con utilidad calculada al instante."
        acciones={
          <BotonLink href="/app/cotizaciones/nueva">
            <Plus /> Nueva cotización
          </BotonLink>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {pestanas.map((p) => (
            <Link
              key={p.valor}
              href={href(p.valor)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                filtro === p.valor
                  ? "bg-surface text-fg shadow-card ring-1 ring-border"
                  : "text-muted hover:text-fg",
              )}
            >
              {p.etiqueta}
              <span className="rounded-md bg-surface-2 px-1.5 text-[11px] text-subtle tabular">{p.n}</span>
            </Link>
          ))}
        </nav>
        <form className="relative w-full lg:w-72">
          {filtro && <input type="hidden" name="estado" value={filtro} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Entrada name="q" defaultValue={buscar} placeholder="Buscar cliente, ruta, mercancía…" className="pl-9" />
        </form>
      </div>

      <Tarjeta>
        {visibles.length === 0 ? (
          <Vacio
            icono={<FileText />}
            titulo="No hay cotizaciones con estos filtros"
            descripcion="Cambia el filtro o crea una cotización nueva."
            accion={
              <BotonLink href="/app/cotizaciones/nueva" variante="secundario">
                <Plus /> Nueva cotización
              </BotonLink>
            }
          />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Cotización</Th>
                <Th>Cliente</Th>
                <Th className="hidden md:table-cell">Servicio y ruta</Th>
                <Th className="text-right">Venta</Th>
                <Th className="hidden text-right sm:table-cell">Margen</Th>
                <Th className="hidden lg:table-cell">Vigencia</Th>
                <Th>Estado</Th>
                <Th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visibles.map(({ q, estado, t }) => (
                <tr key={q.id} className="group transition-colors hover:bg-surface-2">
                  <Td>
                    <Link href={`/app/cotizaciones/${q.id}`} className="font-mono text-[13px] font-medium hover:text-brand-fg">
                      {q.consecutivo}
                    </Link>
                    {q.version > 1 && <span className="ml-1.5 text-xs text-subtle">v{q.version}</span>}
                    <p className="text-xs text-subtle">{fecha(q.fechaEmision)}</p>
                  </Td>
                  <Td className="max-w-56">
                    <p className="truncate font-medium">{nombre(q.clienteId)}</p>
                    <p className="truncate text-xs text-muted">{q.mercancia.descripcion}</p>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <div className="flex items-center gap-3">
                      <IconoServicio tipo={q.tipoServicio} />
                      <div className="min-w-0">
                        <p className="text-[13px]">{TIPOS_SERVICIO[q.tipoServicio]}</p>
                        <p className="max-w-56 truncate text-xs text-muted">
                          {q.origen} → {q.destino}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-right font-medium tabular whitespace-nowrap">{dinero(t.venta, q.monedaPresentacion)}</Td>
                  <Td className="hidden text-right tabular sm:table-cell">
                    <span className={cn(t.margen < 0.1 ? "text-warning" : "text-success")}>{porcentaje(t.margen)}</span>
                  </Td>
                  <Td className="hidden text-[13px] text-muted lg:table-cell">{fecha(q.vigenteHasta)}</Td>
                  <Td>
                    <EstadoCotizacionBadge estado={estado} />
                  </Td>
                  <Td className="text-right">
                    <BotonDuplicar id={q.id} compacto className="opacity-60 group-hover:opacity-100" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
