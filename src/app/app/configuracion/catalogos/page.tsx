import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { contexto, tieneRol } from "@/server/contexto";
import { BotonTraerProductos } from "@/components/app/factura-electronica";
import { hitosDe } from "@/domain/operacion";
import { BLOQUES, TIPOS_CATALOGO, TIPOS_SERVICIO, type TipoCatalogo, type TipoServicio } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import { AgregarCatalogo, FormHitos, FormTerminos, QuitarCatalogo } from "@/components/app/catalogos";
import { Insignia, Tarjeta, TarjetaEncabezado } from "@/components/ui";
import { cn } from "@/lib/formato";

export const metadata = { title: "Catálogos" };

export default async function Catalogos({ searchParams }: PageProps<"/app/configuracion/catalogos">) {
  const { tipo: t } = await searchParams;
  const tipo: TipoCatalogo = typeof t === "string" && t in TIPOS_CATALOGO ? (t as TipoCatalogo) : "concepto";
  const repo = await contexto();
  const admin = repo.usuario.roles.includes("admin");
  const [entradas, cuentaFe] = await Promise.all([repo.catalogo(tipo), tipo === "producto_finppi" ? repo.cuentaFe() : Promise.resolve(null)]);
  const propias = entradas.filter((e) => !e.base);
  const base = entradas.filter((e) => e.base);

  return (
    <>
      <Encabezado
        antes={
          <Link href="/app/configuracion" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Configuración
          </Link>
        }
        titulo="Catálogos, hitos y términos"
        descripcion="Lo que se sugiere al cotizar y abrir DO. Los catálogos base los mantiene LOGIKS; agrega los tuyos."
      />

      <Tarjeta>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 pt-3">
          {(Object.keys(TIPOS_CATALOGO) as TipoCatalogo[]).map((k) => (
            <Link
              key={k}
              href={`/app/configuracion/catalogos?tipo=${k}`}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-[13px] font-medium",
                k === tipo ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {TIPOS_CATALOGO[k]}
            </Link>
          ))}
        </nav>
        <div className="space-y-5 p-5">
          {tipo === "producto_finppi" && (
            <p className="text-[13px] text-muted">
              Copia el <b>código exacto</b> de cada producto o servicio tal como aparece en Finppi (en la factura se ve como «CÓDIGO - Nombre»).
              El bot lo elige por ese código; si no existe en Finppi, la emisión se detiene sin emitir.
            </p>
          )}
          {tipo === "producto_finppi" && (tieneRol(repo, "contabilidad")) && <BotonTraerProductos activa={cuentaFe?.estado === "activa"} />}
          {admin && <AgregarCatalogo tipo={tipo} />}
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">De tu empresa · {propias.length}</p>
            {propias.length === 0 ? (
              <p className="text-[13px] text-muted">Aún no agregas ninguno.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {propias.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft py-1 pr-1.5 pl-3 text-[13px] text-brand-fg">
                    {e.nombre}
                    {e.codigo && <span className="font-mono text-xs opacity-70">{e.codigo}</span>}
                    {e.datos.bloque && <span className="text-xs opacity-70">· {BLOQUES[e.datos.bloque]}</span>}
                    {e.datos.iva && <span className="text-xs opacity-70">· {e.datos.iva}</span>}
                    {admin && <QuitarCatalogo id={e.id} nombre={e.nombre} />}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">Base de LOGIKS · {base.length}</p>
            <div className="flex flex-wrap gap-1.5">
              {base.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-[13px]">
                  {e.nombre}
                  {e.codigo && <span className="font-mono text-xs text-subtle">{e.codigo}</span>}
                  {e.datos.paraTerceros && <Insignia tono="info">terceros</Insignia>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Tarjeta>

      {admin && (
        <>
          <Tarjeta className="mt-6">
            <TarjetaEncabezado titulo="Hitos por tipo de operación" descripcion="Se crean al abrir cada DO" />
            <FormHitos
              tipos={(Object.keys(TIPOS_SERVICIO) as TipoServicio[]).map((k) => ({
                tipo: k,
                etiqueta: TIPOS_SERVICIO[k],
                hitos: hitosDe(k, repo.empresa.hitosPorTipo),
                propios: !!repo.empresa.hitosPorTipo?.[k]?.length,
              }))}
            />
          </Tarjeta>
          <Tarjeta className="mt-6">
            <TarjetaEncabezado titulo="Términos y condiciones por defecto" descripcion="Se proponen en cada cotización nueva y salen en el PDF" />
            <FormTerminos terminos={repo.empresa.terminos ?? ""} />
          </Tarjeta>
        </>
      )}
    </>
  );
}
