import Link from "next/link";
import { ChartColumn, Download, ShieldCheck, TrendingUp, Ship, Percent } from "lucide-react";
import { contexto } from "@/server/contexto";
import { periodoDe, puedeVer170, puedeVerFinanzas, reportesDe } from "@/server/reportes";
import { PERIODOS, type FilaVentas } from "@/domain/reportes";
import { Encabezado, Indicador } from "@/components/app/encabezado";
import { Insignia, Tabla, Tarjeta, TarjetaEncabezado, Td, Th, Vacio, clasesBoton } from "@/components/ui";
import { cn, dinero, dineroCorto, fecha, porcentaje } from "@/lib/formato";

export const metadata = { title: "Reportes" };

function Exportar({ reporte, periodo }: { reporte: string; periodo: string }) {
  return (
    <a
      href={`/app/reportes/exportar?reporte=${reporte}&periodo=${periodo}`}
      className={clasesBoton({ variante: "secundario", tamano: "sm" })}
    >
      <Download /> Excel
    </a>
  );
}

function TablaVentas({ filas, etiqueta }: { filas: FilaVentas[]; etiqueta: string }) {
  if (filas.length === 0) return <Vacio icono={<ChartColumn />} titulo="Sin operaciones en el periodo" />;
  const max = Math.max(...filas.map((f) => f.ventas));
  return (
    <Tabla>
      <thead>
        <tr>
          <Th>{etiqueta}</Th>
          <Th className="text-right">DO</Th>
          <Th className="text-right">Ventas</Th>
          <Th className="hidden text-right md:table-cell">Utilidad cotizada</Th>
          <Th className="text-right">Utilidad real</Th>
          <Th className="hidden text-right sm:table-cell">Margen</Th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.clave}>
            <Td className="max-w-60">
              <p className="truncate font-medium">{f.etiqueta}</p>
              <div className="mt-1.5 h-1 rounded-full bg-surface-2">
                <div className="h-1 rounded-full bg-brand" style={{ width: `${(f.ventas / max) * 100}%` }} />
              </div>
            </Td>
            <Td className="text-right tabular">{f.operaciones}</Td>
            <Td className="text-right font-medium tabular whitespace-nowrap">{dinero(f.ventas)}</Td>
            <Td className="hidden text-right text-muted tabular md:table-cell whitespace-nowrap">{dinero(f.utilidadCotizada)}</Td>
            <Td className={cn("text-right tabular whitespace-nowrap", f.utilidadReal < f.utilidadCotizada ? "text-warning" : "text-success")}>
              {dinero(f.utilidadReal)}
            </Td>
            <Td className="hidden text-right tabular sm:table-cell">{porcentaje(f.margenReal)}</Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

const SITUACION = {
  vigente: ["Vigente", "exito"],
  por_vencer: ["Por vencer", "alerta"],
  vencido: ["Vencida", "peligro"],
  en_tramite: ["En revisión", "info"],
  sin_formulario: ["Sin formulario", "neutro"],
} as const;

export default async function Reportes({ searchParams }: PageProps<"/app/reportes">) {
  const periodo = periodoDe((await searchParams).periodo);
  const repo = await contexto();
  const finanzas = puedeVerFinanzas(repo);
  const ver170 = puedeVer170(repo);
  const r = await reportesDe(repo, periodo);

  return (
    <>
      <Encabezado
        titulo="Reportes"
        descripcion={`${PERIODOS[periodo]} · del ${fecha(r.rango.desde === "0000-01-01" ? undefined : r.rango.desde)} al ${fecha(r.rango.hasta)}. Utilidad antes de impuestos, en COP.`}
      />

      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1 pb-1">
        {Object.entries(PERIODOS).map(([v, l]) => (
          <Link
            key={v}
            href={`/app/reportes?periodo=${v}`}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[13px] font-medium transition-colors",
              periodo === v ? "bg-surface text-fg shadow-card ring-1 ring-border" : "text-muted hover:text-fg",
            )}
          >
            {l}
          </Link>
        ))}
      </nav>

      {!finanzas && !ver170 ? (
        <Tarjeta>
          <Vacio icono={<ChartColumn />} titulo="Sin reportes para tu rol" descripcion="Los reportes financieros los ven Comercial, Contabilidad y Administración." />
        </Tarjeta>
      ) : (
        <div className="space-y-6">
          {finanzas && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <Indicador etiqueta="Operaciones abiertas" valor={r.total.operaciones} icono={<Ship />} />
                <Indicador etiqueta="Ventas" valor={dineroCorto(r.total.ventas)} icono={<TrendingUp />} tono="info" />
                <Indicador
                  etiqueta="Utilidad real"
                  valor={dineroCorto(r.total.utilidadReal)}
                  detalle={`Cotizada ${dineroCorto(r.total.utilidadCotizada)}`}
                  icono={<TrendingUp />}
                  tono="exito"
                />
                <Indicador
                  etiqueta="Margen real"
                  valor={porcentaje(r.total.ventas ? r.total.utilidadReal / r.total.ventas : 0)}
                  icono={<Percent />}
                  tono="alerta"
                />
              </div>

              <Tarjeta>
                <TarjetaEncabezado titulo="Ventas y utilidad por cliente" accion={<Exportar reporte="clientes" periodo={periodo} />} />
                <TablaVentas filas={r.porCliente} etiqueta="Cliente" />
              </Tarjeta>

              <div className="grid gap-6 xl:grid-cols-2">
                <Tarjeta>
                  <TarjetaEncabezado titulo="Por comercial" accion={<Exportar reporte="comerciales" periodo={periodo} />} />
                  <TablaVentas filas={r.porComercial} etiqueta="Comercial" />
                </Tarjeta>
                <Tarjeta>
                  <TarjetaEncabezado titulo="Por tipo de operación" accion={<Exportar reporte="tipos" periodo={periodo} />} />
                  <TablaVentas filas={r.porTipo} etiqueta="Tipo" />
                </Tarjeta>
              </div>

              <Tarjeta>
                <TarjetaEncabezado
                  titulo="Conversión de cotizaciones"
                  descripcion="Cotizaciones emitidas en el periodo, sin borradores"
                  accion={<Exportar reporte="conversion" periodo={periodo} />}
                />
                {r.conversion.length === 0 ? (
                  <Vacio icono={<Percent />} titulo="Sin cotizaciones enviadas en el periodo" />
                ) : (
                  <Tabla>
                    <thead>
                      <tr>
                        <Th>Comercial</Th>
                        <Th className="text-right">Enviadas</Th>
                        <Th className="text-right">Aceptadas</Th>
                        <Th className="text-right">Rechazadas</Th>
                        <Th className="text-right">Conversión</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.conversion.map((f) => (
                        <tr key={f.comercialId}>
                          <Td className="font-medium">{f.comercial}</Td>
                          <Td className="text-right tabular">{f.enviadas}</Td>
                          <Td className="text-right tabular text-success">{f.aceptadas}</Td>
                          <Td className="text-right tabular text-danger">{f.rechazadas}</Td>
                          <Td className="text-right font-medium tabular">{porcentaje(f.conversion)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                )}
              </Tarjeta>
            </>
          )}

          {ver170 && (
            <Tarjeta>
              <TarjetaEncabezado
                titulo="Clientes y Circular 170"
                descripcion="Estado actual, sin importar el periodo"
                accion={<Exportar reporte="circular170" periodo={periodo} />}
              />
              {r.estado170.length === 0 ? (
                <Vacio icono={<ShieldCheck />} titulo="Sin clientes" />
              ) : (
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Cliente</Th>
                      <Th className="hidden sm:table-cell">NIT</Th>
                      <Th>Estado</Th>
                      <Th className="hidden sm:table-cell">Vigente hasta</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.estado170.map((f) => (
                      <tr key={f.nit}>
                        <Td className="font-medium">{f.cliente}</Td>
                        <Td className="hidden text-muted sm:table-cell">{f.nit}</Td>
                        <Td>
                          <Insignia tono={SITUACION[f.situacion][1]}>{SITUACION[f.situacion][0]}</Insignia>
                        </Td>
                        <Td className="hidden text-muted sm:table-cell">{fecha(f.vigenteHasta)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
            </Tarjeta>
          )}
        </div>
      )}
    </>
  );
}
