import { FileCheck2, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { contexto, tieneRol } from "@/server/contexto";
import { cargarTodo, situacionCliente } from "@/server/consultas";
import { RECORDATORIOS_170 } from "@/domain/cumplimiento";
import { Encabezado, Indicador } from "@/components/app/encabezado";
import { Estado170Badge, Situacion170Badge } from "@/components/estados";
import { Revision170 } from "@/components/app/revision-170";
import { Insignia, Tabla, Tarjeta, TarjetaEncabezado, Td, Th, Vacio } from "@/components/ui";
import { dinero, fecha, fechaHora } from "@/lib/formato";
import { TIPOS_SOPORTE_170 } from "@/domain/types";
import { ListaArchivos } from "@/components/app/lista-archivos";

export const metadata = { title: "Circular 170" };

export default async function Cumplimiento() {
  const repo = await contexto();
  const { terceros, formularios, hoy } = await cargarTodo(repo);
  const clientes = terceros.filter((t) => t.tipo === "cliente");
  const filas = clientes.map((t) => ({ t, s: situacionCliente(formularios, t.id, hoy) }));
  const enRevision = formularios.filter((f) => f.estado === "en_revision");
  const soportes = await Promise.all(enRevision.map((f) => repo.soportes170(f.id)));
  const puedeRevisar = tieneRol(repo, "cumplimiento");
  const nombre = (id: string) => terceros.find((t) => t.id === id)?.razonSocial ?? "—";
  const n = (tipo: string) => filas.filter((f) => f.s.tipo === tipo).length;

  return (
    <>
      <Encabezado
        titulo="Circular 170"
        descripcion={`Conocimiento del cliente (DIAN). Vigencia de ${repo.empresa.vigencia170Meses} meses; recordatorios a ${RECORDATORIOS_170.join(", ")} días del vencimiento.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador etiqueta="Vigentes" valor={n("vigente")} icono={<ShieldCheck />} tono="exito" detalle="Pueden abrir DO" />
        <Indicador etiqueta="Por vencer" valor={n("por_vencer")} icono={<ShieldAlert />} tono="alerta" detalle={`En los próximos ${RECORDATORIOS_170[0]} días`} />
        <Indicador etiqueta="En revisión" valor={enRevision.length} icono={<FileCheck2 />} tono="info" detalle="Esperan a Cumplimiento" />
        <Indicador etiqueta="Vencidas o sin formulario" valor={n("vencido") + n("sin_formulario")} icono={<ShieldQuestion />} detalle="DO bloqueado" />
      </div>

      <Tarjeta className="mt-6">
        <TarjetaEncabezado
          titulo="Formularios por revisar"
          descripcion={puedeRevisar ? "Aprueba, devuelve con observaciones o rechaza." : "Solo el rol Cumplimiento puede revisar. Cambia a Camila en el menú para probarlo."}
        />
        {enRevision.length === 0 ? (
          <Vacio icono={<FileCheck2 />} titulo="Nada pendiente" descripcion="Los formularios que envíen los clientes aparecerán aquí." />
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {enRevision.map((f, i) => (
              <li key={f.id} className="grid gap-5 p-5 lg:grid-cols-[1fr_380px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{nombre(f.terceroId)}</p>
                    <Insignia tono="neutro">Versión {f.version}</Insignia>
                    <Estado170Badge estado={f.estado} />
                  </div>
                  <p className="mt-0.5 text-xs text-subtle">Diligenciado en línea {fechaHora(f.diligenciadoEl)}</p>
                  <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
                    {[
                      ["NIT", f.datos.nit],
                      ["Domicilio", `${f.datos.domicilio}, ${f.datos.ciudad}`],
                      ["Actividad económica", f.datos.actividadEconomica],
                      ["Capital social", dinero(f.datos.capitalSocial)],
                      ["Origen de recursos", f.datos.origenRecursos],
                      ["Forma de pago", `${f.datos.formaPago} · ${f.datos.entidadFinanciera}`],
                      ["Representante legal", f.datos.representantes.map((r) => `${r.nombre} (${r.documento})`).join(", ")],
                      ["Beneficiarios", f.datos.beneficiarios],
                      ["PEP", f.datos.esPEP ? "Sí" : "No"],
                      ["Tratamiento de datos", f.datos.autorizaDatos ? "Autorizado (Ley 1581)" : "No autorizado"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-subtle">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-5 mb-2 text-xs font-medium tracking-wide text-subtle uppercase">Soportes</p>
                  <ListaArchivos
                    archivos={soportes[i]}
                    clase="170"
                    tipos={TIPOS_SOPORTE_170}
                    descargable={puedeRevisar}
                    vacio="El cliente aún no ha cargado soportes."
                  />
                </div>
                {puedeRevisar && (
                  <div className="lg:border-l lg:border-border lg:pl-5">
                    <Revision170 id={f.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta className="mt-6">
        <TarjetaEncabezado titulo="Estado por cliente" descripcion="Expediente sin borrado: cada actualización es una versión nueva." />
        <Tabla>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Estado</Th>
              <Th className="hidden sm:table-cell">Aprobado</Th>
              <Th className="hidden sm:table-cell">Vigente hasta</Th>
              <Th className="hidden md:table-cell">Versiones</Th>
              <Th className="w-24">Expediente</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ t, s }) => {
              const fs = formularios.filter((f) => f.terceroId === t.id);
              const ref = "formulario" in s ? s.formulario : undefined;
              return (
                <tr key={t.id}>
                  <Td>
                    <p className="font-medium">{t.razonSocial}</p>
                    <p className="text-xs text-muted">NIT {t.nit}</p>
                  </Td>
                  <Td>
                    <Situacion170Badge s={s} />
                  </Td>
                  <Td className="hidden text-[13px] text-muted sm:table-cell">{fecha(ref?.aprobadoEl)}</Td>
                  <Td className="hidden text-[13px] text-muted sm:table-cell">{fecha(ref?.vigenteHasta)}</Td>
                  <Td className="hidden tabular md:table-cell">{fs.length || "—"}</Td>
                  <Td>
                    {ref ? (
                      <a href={`/app/cumplimiento/${ref.id}/pdf`} target="_blank" rel="noopener" className="text-[13px] font-medium text-brand-fg hover:underline">
                        PDF v{ref.version}
                      </a>
                    ) : (
                      <span className="text-xs text-subtle">—</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      </Tarjeta>
    </>
  );
}
