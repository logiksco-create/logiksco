import Link from "next/link";
import { ArrowLeft, Building2, Hash, KeyRound, ListTree, Package, ShieldCheck } from "lucide-react";
import { contexto } from "@/server/contexto";
import { modoDemo } from "@/lib/env";
import { ESTADOS_CUENTA_FE, ESTADOS_TRABAJO_FE } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import {
  AccionesConexion,
  EstadoBot,
  FormConexionFinppi,
  FormResolucion,
  RefrescoEnVivo,
  SelectorPresentacion,
  SelectorModoEmision,
  BotonTraerProductos,
} from "@/components/app/factura-electronica";
import { Insignia, Tarjeta, TarjetaEncabezado, clasesBoton } from "@/components/ui";
import { fechaHora } from "@/lib/formato";

export const metadata = { title: "Facturación electrónica" };

export default async function ConfiguracionFe() {
  const repo = await contexto();
  const [cuenta, trabajos, bot, productos] = await Promise.all([
    repo.cuentaFe(),
    repo.trabajosFe(),
    repo.estadoBotFe(),
    repo.catalogo("producto_finppi"),
  ]);
  const admin = repo.usuario.roles.includes("admin");
  const contable = admin || repo.usuario.roles.includes("contabilidad");
  const ultimo = trabajos[0];
  const probando = trabajos.some((j) => j.estado === "en_cola" || j.estado === "corriendo");
  const s = cuenta?.instantanea ?? {};
  const conectada = !!cuenta?.tieneCredenciales;

  return (
    <>
      <RefrescoEnVivo activo={probando || cuenta?.estado === "pendiente"} />
      <Encabezado
        antes={
          <Link href="/app/configuracion" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
            <ArrowLeft className="size-3.5" /> Configuración
          </Link>
        }
        titulo="Facturación electrónica"
        descripcion="LOGIKS arma la factura (en USD o COP), el bot la transcribe en Finppi en pesos y la DIAN la valida."
        acciones={<EstadoBot latidoEl={bot.latidoEl} pausado={bot.pausado} demo={modoDemo} bajoDemanda={!!process.env.GITHUB_BOT_TOKEN} />}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Tarjeta de conexión (§9D) */}
          <Tarjeta className="overflow-hidden">
            <div className="bg-gradient-to-br from-[#0a0f1f] to-[#1a2550] p-5 text-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-white/60">Conexión con Finppi</p>
                <Insignia tono={cuenta?.estado === "activa" ? "exito" : cuenta?.estado === "pendiente" ? "marca" : conectada ? "peligro" : "neutro"} punto>
                  {cuenta ? ESTADOS_CUENTA_FE[cuenta.estado] : "Sin conectar"}
                </Insignia>
              </div>
              {s.razonSocial ? (
                <>
                  <p className="mt-2 text-lg font-semibold">{s.razonSocial}</p>
                  <p className="font-mono text-xs text-white/60">NIT {s.nit}</p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-[13px]">
                    <div className="rounded-lg bg-white/[0.06] p-2.5">
                      <p className="flex items-center gap-1 text-white/50"><Hash className="size-3" /> Próxima factura</p>
                      <p className="font-mono text-base font-semibold">{s.proximaFactura ?? "—"}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.06] p-2.5">
                      <p className="flex items-center gap-1 text-white/50"><Building2 className="size-3" /> Clientes</p>
                      <p className="font-semibold">{s.clientes ?? "—"}</p>
                    </div>
                    <div className="rounded-lg bg-white/[0.06] p-2.5">
                      <p className="flex items-center gap-1 text-white/50"><Package className="size-3" /> Productos</p>
                      <p className="font-semibold">{s.productos ?? "—"}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-white/50">
                    Leído {fechaHora(s.leidoEl)}. El número es una referencia: cambia si alguien emite directamente en Finppi.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[13.5px] text-white/70">
                  {probando ? "Conectando con Finppi y verificando tu empresa…" : "Aún no hay lectura de tu cuenta."}
                </p>
              )}
            </div>
            <div className="space-y-3 p-5">
              {cuenta?.usuarioPista && (
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <KeyRound className="size-4" /> Usuario {cuenta.usuarioPista} · contraseña ••••••••
                  {cuenta.consentimientoEl && ` · autorizado ${fechaHora(cuenta.consentimientoEl)}`}
                </p>
              )}
              {contable && <AccionesConexion admin={admin} conectada={conectada} />}
              {ultimo && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs text-subtle">
                    {ultimo.tipo === "productos" ? "Productos de Finppi" : "Última prueba"} · {fechaHora(ultimo.creadoEl)} · {ESTADOS_TRABAJO_FE[ultimo.estado]}
                  </p>
                  <ol className="space-y-1 text-[13px]">
                    {ultimo.logs.map((l, i) => (
                      <li key={i} className={l.nivel === "error" ? "text-danger" : l.nivel === "aviso" ? "text-warning" : ""}>
                        {l.mensaje}
                      </li>
                    ))}
                    {ultimo.error && <li className="text-danger">{ultimo.error}</li>}
                  </ol>
                </div>
              )}
            </div>
          </Tarjeta>

          <Tarjeta>
            <TarjetaEncabezado
              titulo="Modo de emisión"
              descripcion="Mientras pruebas, el bot hace todo el proceso pero pulsa «Guardar» en Finppi en vez de «Enviar»."
            />
            <div className="p-5 pt-0">
              <SelectorModoEmision valor={cuenta?.modoEmision === "real" ? "real" : "borrador"} editable={admin} />
            </div>
          </Tarjeta>

          {admin ? (
            <Tarjeta>
              <TarjetaEncabezado
                titulo={conectada ? "Cambiar credenciales" : "Conectar Finppi"}
                descripcion="Usa el usuario con el que entras a app.finppi.com. Al guardar, el bot entra, verifica tu NIT y lee tu próximo consecutivo sin emitir nada."
              />
              <div className="p-5 pt-0">
                <FormConexionFinppi reconectar={conectada} />
              </div>
            </Tarjeta>
          ) : (
            <Tarjeta className="p-5 text-[13px] text-muted">Solo el Administrador conecta la cuenta de Finppi.</Tarjeta>
          )}
        </div>

        <aside className="space-y-6">
          <Tarjeta>
            <TarjetaEncabezado
              titulo="Productos y servicios"
              descripcion="Códigos exactos de Finppi que usarás en las facturas"
              accion={
                <Link href="/app/configuracion/catalogos?tipo=producto_finppi" className={clasesBoton({ variante: "secundario", tamano: "sm" })}>
                  <ListTree /> Editar
                </Link>
              }
            />
            {contable && (
              <div className="px-5 pb-3">
                <BotonTraerProductos activa={cuenta?.estado === "activa"} />
              </div>
            )}
            <ul className="divide-y divide-border border-t border-border text-[13px]">
              {productos.length === 0 && <li className="px-5 py-3 text-muted">Aún no hay productos.</li>}
              {productos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-subtle">{p.codigo}</span> {p.nombre}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{p.datos.iva}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
          <Tarjeta>
            <TarjetaEncabezado titulo="Textos de la factura" descripcion="Se imprimen en tu PDF de factura LOGIKS" />
            <div className="p-5 pt-0">
              <div className="mb-5">
                <SelectorPresentacion
                  valor={cuenta?.presentacion ?? "usd"}
                  editable={contable}
                  etiqueta="En facturas en dólares, el cliente ve"
                />
                <p className="mt-1.5 text-xs text-subtle">Por defecto de la empresa; cada factura puede cambiarlo. A la DIAN siempre va en pesos.</p>
              </div>
              <FormResolucion texto={cuenta?.resolucion ?? ""} condiciones={cuenta?.condiciones ?? ""} editable={contable} />
            </div>
          </Tarjeta>
          <div className="flex gap-2.5 rounded-xl border border-border bg-surface-2 p-4 text-[13px] text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <p>
              La contraseña se guarda cifrada en la bóveda de Supabase y solo el bot la lee. Cambiarla en Finppi corta el acceso de
              inmediato. El bot nunca usa «Guardar», «Duplicar» ni «Reenviar» de Finppi, y se detiene si el consecutivo no es el esperado.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
