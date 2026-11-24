import Link from "next/link";
import { Ship } from "lucide-react";
import { contexto } from "@/server/contexto";
import { cargarTodo } from "@/server/consultas";
import { avance, hitoActual } from "@/domain/operacion";
import { fechaSalida } from "@/domain/alertas";
import { ESTADOS_DO, TIPOS_SERVICIO, type EstadoDO } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import { EstadoDOBadge, IconoServicio } from "@/components/estados";
import { Avatar, Progreso, Tabla, Tarjeta, Td, Th, Vacio } from "@/components/ui";
import { cn, fecha } from "@/lib/formato";

export const metadata = { title: "Operaciones" };

export default async function Operaciones({ searchParams }: PageProps<"/app/operaciones">) {
  const { estado } = await searchParams;
  const filtro = typeof estado === "string" ? estado : "";
  const repo = await contexto();
  const { operaciones, terceros, usuarios } = await cargarTodo(repo);
  const cliente = (id: string) => terceros.find((t) => t.id === id)?.razonSocial ?? "—";
  const usuario = (id: string) => usuarios.find((u) => u.id === id)?.nombre ?? "—";
  const visibles = operaciones.filter((o) => !filtro || o.estado === filtro);

  return (
    <>
      <Encabezado
        titulo="Operaciones"
        descripcion="Cada DO con sus hitos, documentos y la trazabilidad de lo comunicado."
      />

      <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {[["", "Todas"], ...Object.entries(ESTADOS_DO)].map(([v, l]) => {
          const n = v ? operaciones.filter((o) => o.estado === (v as EstadoDO)).length : operaciones.length;
          if (v && n === 0) return null;
          return (
            <Link
              key={v}
              href={v ? `/app/operaciones?estado=${v}` : "/app/operaciones"}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                filtro === v ? "bg-surface text-fg shadow-card ring-1 ring-border" : "text-muted hover:text-fg",
              )}
            >
              {l}
              <span className="rounded-md bg-surface-2 px-1.5 text-[11px] text-subtle tabular">{n}</span>
            </Link>
          );
        })}
      </nav>

      <Tarjeta>
        {visibles.length === 0 ? (
          <Vacio
            icono={<Ship />}
            titulo="Sin operaciones"
            descripcion="Los DO se abren desde una cotización aceptada con la Circular 170 al día."
          />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>DO</Th>
                <Th>Cliente</Th>
                <Th className="hidden md:table-cell">Ruta</Th>
                <Th className="hidden lg:table-cell">Salida</Th>
                <Th className="w-48">Avance</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((o) => {
                const actual = hitoActual(o);
                return (
                  <tr key={o.id} className="transition-colors hover:bg-surface-2">
                    <Td>
                      <div className="flex items-center gap-3">
                        <IconoServicio tipo={o.tipo} />
                        <div>
                          <Link href={`/app/operaciones/${o.id}`} className="font-mono text-[13px] font-medium hover:text-brand-fg">
                            {o.consecutivo}
                          </Link>
                          <p className="text-xs text-subtle">{TIPOS_SERVICIO[o.tipo]}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="max-w-56">
                      <p className="truncate font-medium">{cliente(o.clienteId)}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        <Avatar nombre={usuario(o.responsableId)} className="size-4 text-[7px]" />
                        {usuario(o.responsableId)}
                      </p>
                    </Td>
                    <Td className="hidden text-[13px] md:table-cell">
                      {o.origen}
                      <span className="block text-muted">→ {o.destino}</span>
                    </Td>
                    <Td className="hidden text-[13px] text-muted lg:table-cell">{fecha(fechaSalida(o))}</Td>
                    <Td>
                      <div className="mb-1.5 flex justify-between text-xs text-muted">
                        <span className="truncate">{actual ? actual.nombre : "Completado"}</span>
                        <span className="tabular">{Math.round(avance(o) * 100)}%</span>
                      </div>
                      <Progreso valor={avance(o)} />
                    </Td>
                    <Td>
                      <EstadoDOBadge estado={o.estado} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}
