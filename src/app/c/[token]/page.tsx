import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, ShieldCheck } from "lucide-react";
import { repositorioPublico } from "@/server/contexto";
import { estadoEfectivo, totalesConceptos, totalesPorBloque } from "@/domain/cotizacion";
import { requiereFormulario, situacion170 } from "@/domain/cumplimiento";
import { convertir } from "@/domain/cotizacion";
import { hoyISO } from "@/domain/fechas";
import { BLOQUES, TIPOS_SERVICIO, type Bloque } from "@/domain/types";
import { Decision, Exito, Formulario170 } from "@/components/publico/formularios";
import { Isotipo } from "@/components/marca";
import { Tarjeta } from "@/components/ui";
import { dinero, fecha, numero } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Cotización",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Vista del cliente final (RF-12). Sin cuenta: acceso por token.
 * Nunca se muestran costos, proveedores ni utilidad.
 */
export default async function VistaCliente({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const repo = repositorioPublico();
  const v = await repo.cotizacionPorToken(token);
  if (!v) notFound();
  await repo.marcarVista(token);

  const { cotizacion: q, empresa, cliente, formularios } = v;
  const hoy = hoyISO();
  const estado = estadoEfectivo(q, hoy);
  const mon = q.monedaPresentacion;
  const total = totalesConceptos(q.conceptos, mon, q.trm).venta;
  const porBloque = totalesPorBloque(q.conceptos, mon, q.trm);
  const bloques = (Object.keys(BLOQUES) as Bloque[]).filter((b) => porBloque[b]);
  const sit = situacion170(formularios, hoy);
  const contacto = cliente.contactos.find((c) => c.id === q.contactoId) ?? cliente.contactos[0];
  const ultimo170 = [...formularios].sort((a, b) => b.version - a.version)[0];

  let panel: React.ReactNode;
  if (estado === "enviada" || estado === "vista") {
    panel = <Decision token={token} contacto={contacto} />;
  } else if (estado === "aceptada" && requiereFormulario(sit)) {
    panel = <Formulario170 token={token} intro previo={ultimo170?.datos} />;
  } else if (estado === "aceptada") {
    panel =
      sit.tipo === "en_tramite" ? (
        <Exito titulo="Formulario en revisión" texto="Tu cotización está aceptada y tu formulario 170 está en revisión por nuestro oficial de cumplimiento." />
      ) : (
        <Exito titulo="Cotización aceptada" texto="Todo está en orden. Te avisaremos cada novedad de tu operación por correo." />
      );
  } else if (estado === "vencida") {
    panel = (
      <div className="py-6 text-center">
        <Clock className="mx-auto size-8 text-warning" />
        <p className="mt-3 font-semibold">Esta cotización venció el {fecha(q.vigenteHasta)}</p>
        <p className="mt-1 text-sm text-muted">Escríbenos y te enviamos una actualizada con tarifas vigentes.</p>
      </div>
    );
  } else {
    panel = <Exito titulo="Respuesta registrada" texto="Esta cotización ya tiene una respuesta." />;
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="relative overflow-hidden bg-[#0a0f1f] text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="pointer-events-none absolute -top-40 right-0 size-[500px] rounded-full bg-[#3b5bfd]/25 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 pt-6 pb-24 sm:px-6">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold tracking-tight">{empresa.razonSocial}</p>
            <p className="text-xs text-white/50">NIT {empresa.nit}</p>
          </div>
          <p className="mt-10 text-sm text-white/60">Cotización para {cliente.razonSocial}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {q.origen} <span className="text-[#14c8b4]">→</span> {q.destino}
          </h1>
          <p className="mt-3 font-mono text-sm text-white/60">
            {q.consecutivo} · v{q.version} · válida hasta {fecha(q.vigenteHasta)}
          </p>
        </div>
      </header>

      <main className="relative mx-auto -mt-16 grid max-w-5xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Tarjeta className="grid gap-px overflow-hidden bg-border sm:grid-cols-3">
            {[
              ["Servicio", TIPOS_SERVICIO[q.tipoServicio], `Incoterm ${q.incoterm}`],
              ["Mercancía", q.mercancia.descripcion, `${numero(q.mercancia.piezas)} piezas`],
              ["Peso y volumen", `${numero(q.mercancia.pesoKg)} kg`, `${numero(q.mercancia.volumenM3, 1)} m³`],
            ].map(([k, v, d]) => (
              <div key={k} className="bg-surface p-5">
                <p className="text-xs text-subtle">{k}</p>
                <p className="mt-1.5 text-sm font-medium">{v}</p>
                <p className="text-xs text-muted">{d}</p>
              </div>
            ))}
          </Tarjeta>

          <Tarjeta>
            <div className="px-5 pt-5 pb-2">
              <h2 className="font-semibold">Detalle de la cotización</h2>
            </div>
            <div className="divide-y divide-border">
              {bloques.map((b) => (
                <div key={b} className="px-5 py-4">
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{BLOQUES[b]}</p>
                  <ul className="space-y-1.5">
                    {q.conceptos
                      .filter((c) => c.bloque === b)
                      .map((c) => (
                        <li key={c.id} className="flex justify-between gap-4 text-sm">
                          <span>
                            {c.descripcion}
                            {c.cantidad !== 1 && <span className="text-muted"> × {numero(c.cantidad, 2)}</span>}
                          </span>
                          <span className="shrink-0 tabular">
                            {dinero(convertir(c.ventaUnitaria * c.cantidad, c.moneda, mon, q.trm), mon)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-b-xl border-t border-border bg-surface-2 px-5 py-4">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-semibold tabular">{dinero(total, mon)}</span>
            </div>
          </Tarjeta>

          {q.terminos && (
            <div className="px-1 text-xs leading-relaxed text-muted">
              <p className="mb-1 font-medium text-fg">Términos y condiciones</p>
              {q.terminos}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Tarjeta className="p-5 shadow-pop">{panel}</Tarjeta>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-subtle">
            <ShieldCheck className="size-3.5" /> Enlace seguro · <Isotipo className="size-4" /> LOGIKS.CO
          </p>
        </aside>
      </main>
    </div>
  );
}
