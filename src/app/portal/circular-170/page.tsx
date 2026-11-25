import { contextoPortal } from "@/server/contexto";
import { situacion170 } from "@/domain/cumplimiento";
import { hoyISO } from "@/domain/fechas";
import { ESTADOS_170 } from "@/domain/types";
import { enviar170Portal } from "@/server/acciones/portal";
import { Formulario170 } from "@/components/publico/formularios";
import { Situacion170Badge } from "@/components/estados";
import { Tarjeta, TarjetaEncabezado } from "@/components/ui";
import { fecha } from "@/lib/formato";

export const metadata = { title: "Circular 170" };

export default async function Circular170Cliente() {
  const repo = await contextoPortal();
  const formularios = await repo.formularios170();
  const sit = situacion170(formularios, hoyISO());
  const ultimo = [...formularios].sort((a, b) => b.version - a.version)[0];
  const enRevision = ultimo?.estado === "en_revision";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Tarjeta className="p-5 sm:p-6">
        {enRevision ? (
          <div className="py-8 text-center">
            <p className="text-lg font-semibold">Tu formulario está en revisión</p>
            <p className="mt-1 text-sm text-muted">Te avisaremos por correo cuando nuestro oficial de cumplimiento lo revise.</p>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-semibold tracking-tight">Actualiza tu información</h1>
            <p className="mb-6 text-sm text-muted">
              Llega prellenado con tu última versión: confirma o corrige y firma.
              {ultimo?.estado === "devuelto" && ultimo.observaciones ? ` Observaciones: ${ultimo.observaciones}` : ""}
            </p>
            <Formulario170 accion={enviar170Portal} previo={ultimo?.datos} />
          </>
        )}
      </Tarjeta>
      <aside className="space-y-6">
        <Tarjeta>
          <TarjetaEncabezado titulo="Estado" />
          <div className="space-y-3 px-5 pb-5 text-[13px]">
            <Situacion170Badge s={sit} />
            {"formulario" in sit && sit.formulario.vigenteHasta && <p className="text-muted">Vigente hasta {fecha(sit.formulario.vigenteHasta)}</p>}
          </div>
        </Tarjeta>
        <Tarjeta>
          <TarjetaEncabezado titulo="Historial" />
          <ul className="space-y-2 px-5 pb-5 text-[13px]">
            {formularios.length === 0 && <li className="text-muted">Aún no has diligenciado el formulario.</li>}
            {[...formularios].reverse().map((f) => (
              <li key={f.id} className="flex justify-between">
                <span>Versión {f.version}</span>
                <span className="text-muted">
                  {ESTADOS_170[f.estado]} {f.aprobadoEl ? `· ${fecha(f.aprobadoEl)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </aside>
    </div>
  );
}
