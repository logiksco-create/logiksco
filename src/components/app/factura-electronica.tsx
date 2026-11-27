"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleStop,
  BadgeCheck,
  Check,
  CircleAlert,
  FlaskConical,
  LoaderCircle,
  Mail,
  PlugZap,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";
import { FINPPI, TEXTO_CONSENTIMIENTO, ciudadFinppi, separarNombre, valorEnLista } from "@/domain/einvoice";
import { CIUDADES_FINPPI } from "@/domain/finppi-listas";
import type { DatosFiscales, OpcionesClienteFinppi, Presentacion } from "@/domain/types";
import { Combo } from "@/components/ui/combo";
import {
  conectarFinppi,
  desconectarFinppi,
  emitirFacturaElectronica,
  enviarFacturaCliente,
  guardarCondicionesFe,
  guardarDatosFiscales,
  guardarResolucion,
  probarConexionFinppi,
  cambiarPresentacionEmpresa,
  cambiarPresentacionFactura,
  cambiarModoEmision,
  descartarPrueba,
  detenerEnvio,
  traerProductosFinppi,
} from "@/server/acciones/fe";
import { AreaTexto, Boton, Campo, Entrada, Insignia, Selector } from "@/components/ui";
import { Dialogo } from "@/components/ui/dialogo";
import { cn } from "@/lib/formato";

type R = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

function Mensaje({ r }: { r: R }) {
  if (!r) return null;
  return r.ok ? (
    <p className="flex items-center gap-1.5 text-[13px] text-success">
      <Check className="size-4 shrink-0" /> {r.mensaje}
    </p>
  ) : (
    <p className="flex items-start gap-1.5 text-[13px] text-danger">
      <CircleAlert className="mt-0.5 size-4 shrink-0" /> {r.error}
    </p>
  );
}

/**
 * Envío sin reinicio: con `<form action>` React 19 limpia el formulario al
 * terminar, y un error de validación borraría lo escrito.
 */
function useEnvio(accion: (d: FormData) => void) {
  const [, iniciar] = useTransition();
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    iniciar(() => accion(datos));
  };
}

/* ------------------------------------------------------------------ */
/* Datos fiscales del cliente                                          */
/* ------------------------------------------------------------------ */

export function FormDatosFiscales({
  terceroId,
  inicial,
  alGuardar,
  opciones,
}: {
  terceroId: string;
  inicial: DatosFiscales;
  alGuardar?: () => void;
  /** Listas reales de Finppi (si el healthcheck ya las leyó). */
  opciones?: OpcionesClienteFinppi;
}) {
  const lista = (real: string[] | undefined, respaldo: readonly string[]) => (real?.length ? real : [...respaldo]);
  const tiposDoc = lista(opciones?.tipoDocumento, FINPPI.tipoDocumento);
  const regimenes = lista(opciones?.regimen, FINPPI.regimen);
  const responsabilidades = lista(opciones?.responsabilidadFiscal, FINPPI.responsabilidadFiscal);
  const ciudades = opciones?.ciudades?.length ? opciones.ciudades : CIUDADES_FINPPI;
  const inicialEn = (v: string, l: string[]) => valorEnLista(v, l) ?? v;
  // Solo se guarda una ciudad de la lista de Finppi.
  const [ciudad, setCiudad] = useState(ciudadFinppi(inicial.ciudad, ciudades) ?? "");
  const [estado, accion, pendiente] = useActionState(guardarDatosFiscales.bind(null, terceroId), null);
  const enviar = useEnvio(accion);
  const [persona, setPersona] = useState(inicial.tipoPersona);
  const [nombres, setNombres] = useState(inicial.nombres);
  const [apellidos, setApellidos] = useState(inicial.apellidos);
  // Persona natural: nombres y apellidos van separados en Finppi.
  const cambiarPersona = (p: DatosFiscales["tipoPersona"]) => {
    setPersona(p);
    if (p === "Natural" && (!apellidos.trim() || apellidos.trim() === nombres.trim())) {
      const s = separarNombre(nombres);
      setNombres(s.nombres);
      setApellidos(s.apellidos);
    } else if (p === "Juridica" && !apellidos.trim()) setApellidos(nombres);
  };
  useEffect(() => {
    if (estado?.ok) alGuardar?.();
  }, [estado, alGuardar]);
  return (
    <form onSubmit={enviar} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tipo de persona">
          <Selector name="tipoPersona" value={persona} onChange={(e) => cambiarPersona(e.target.value as DatosFiscales["tipoPersona"])}>
            <option value="Juridica">Jurídica</option>
            <option value="Natural">Natural</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Tipo de documento">
          <Selector name="tipoDocumento" defaultValue={inicialEn(inicial.tipoDocumento, tiposDoc)}>
            {tiposDoc.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Número de documento" ayuda="Sin puntos ni dígito de verificación">
          <Entrada name="numeroDocumento" defaultValue={inicial.numeroDocumento} required className="font-mono" inputMode="numeric" />
        </Campo>
        <Campo etiqueta={persona === "Juridica" ? "Razón social" : "Nombres"}>
          <Entrada name="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required />
        </Campo>
        <Campo
          etiqueta="Apellidos"
          ayuda={persona === "Juridica" ? "En empresas, repite la razón social" : "Solo los apellidos, sin repetir los nombres"}
        >
          <Entrada name="apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
        </Campo>
        <Campo etiqueta="Correo de facturación" ayuda="Varios separados por coma. Finppi envía la factura aquí.">
          <Entrada name="email" defaultValue={inicial.email} required />
        </Campo>
        <Campo etiqueta="Celular">
          <Entrada name="celular" defaultValue={inicial.celular} required inputMode="tel" />
        </Campo>
        <Campo etiqueta="Teléfono de la ubicación">
          <Entrada name="telefono" defaultValue={inicial.telefono} required inputMode="tel" />
        </Campo>
        <Campo etiqueta="Régimen">
          <Selector name="regimen" defaultValue={inicialEn(inicial.regimen, regimenes)}>
            {regimenes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Responsabilidad fiscal">
          <Selector name="responsabilidadFiscal" defaultValue={inicialEn(inicial.responsabilidadFiscal, responsabilidades)}>
            {responsabilidades.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="País">
          <Entrada name="pais" defaultValue={inicial.pais} required />
        </Campo>
        <Campo etiqueta="Ciudad" ayuda={ciudad ? "De la lista de Finppi" : inicial.ciudad ? `«${inicial.ciudad}» no está en Finppi: búscala en la lista` : "Escribe para buscar el municipio"}>
          <Combo
            valor={ciudad}
            opciones={ciudades.map((c) => ({ valor: c, etiqueta: c }))}
            alElegir={(o) => setCiudad(o.valor)}
            placeholder="Busca el municipio…"
            ariaLabel="Ciudad"
          />
          <input type="hidden" name="ciudad" value={ciudad} />
        </Campo>
        <Campo etiqueta="Dirección principal" className="sm:col-span-2">
          <Entrada name="direccion" defaultValue={inicial.direccion} required />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Mensaje r={estado} />
        <Boton disabled={pendiente} className="ml-auto">
          {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar datos fiscales
        </Boton>
      </div>
    </form>
  );
}

/** Chip de completitud y botón para completar en un diálogo. */
export function CompletarDatosFiscales({
  terceroId,
  inicial,
  faltantes,
  compacto,
  opciones,
}: {
  terceroId: string;
  inicial: DatosFiscales;
  faltantes: string[];
  compacto?: boolean;
  opciones?: OpcionesClienteFinppi;
}) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  const listo = faltantes.length === 0;
  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg p-3 text-[13px]",
          listo ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
          compacto && "p-2.5",
        )}
      >
        {listo ? <BadgeCheck className="size-4 shrink-0" /> : <CircleAlert className="size-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          {listo ? "Cliente listo para factura electrónica" : `Faltan ${faltantes.length} dato${faltantes.length > 1 ? "s" : ""} para Finppi: ${faltantes.slice(0, 3).join(", ")}${faltantes.length > 3 ? "…" : ""}`}
        </span>
        <button type="button" onClick={() => setAbierto(true)} className="font-medium underline-offset-2 hover:underline">
          {listo ? "Ver" : "Completar"}
        </button>
      </div>
      <Dialogo
        abierto={abierto}
        cerrar={() => setAbierto(false)}
        titulo="Datos para facturación electrónica"
        descripcion="Exactamente lo que pide Finppi para crear al cliente y emitir."
      >
        <FormDatosFiscales
          terceroId={terceroId}
          inicial={inicial}
          opciones={opciones}
          alGuardar={() => {
            setAbierto(false);
            router.refresh();
          }}
        />
      </Dialogo>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Factura: condiciones, emisión, refresco y envío                     */
/* ------------------------------------------------------------------ */

export function CondicionesFe({
  facturaId,
  moneda,
  inicial,
  trmOficial,
  editable,
}: {
  facturaId: string;
  moneda: "COP" | "USD";
  inicial: { trmReferencia?: number; tipoPago: "Contado" | "Crédito"; plazoDias: number; metodoPago: string; tipoOperacion: string };
  trmOficial?: { valor: number; fecha: string; oficial: boolean };
  editable: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(guardarCondicionesFe.bind(null, facturaId), null);
  const enviar = useEnvio(accion);
  const [trm, setTrm] = useState(inicial.trmReferencia ? String(inicial.trmReferencia) : "");
  const [tipoPago, setTipoPago] = useState(inicial.tipoPago);
  return (
    <form onSubmit={enviar} className="space-y-3.5">
      <fieldset disabled={!editable} className="space-y-3.5">
        {moneda === "USD" && (
          <Campo
            etiqueta="TRM de referencia"
            ayuda={
              trmOficial?.oficial ? (
                <button type="button" className="text-brand-fg hover:underline" onClick={() => setTrm(String(trmOficial.valor))}>
                  Oficial del {trmOficial.fecha.split("-").reverse().join("/")}: {trmOficial.valor.toLocaleString("es-CO")} · usar
                </button>
              ) : (
                "La escribes tú: convierte los dólares a pesos para la DIAN"
              )
            }
          >
            <Entrada
              name="trmReferencia"
              value={trm}
              onChange={(e) => setTrm(e.target.value)}
              inputMode="decimal"
              placeholder="4012.37"
              className="font-mono tabular"
              required
            />
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Tipo de pago">
            <Selector name="tipoPago" value={tipoPago} onChange={(e) => setTipoPago(e.target.value as "Contado" | "Crédito")}>
              {FINPPI.tipoPago.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Plazo (días)">
            <Entrada name="plazoDias" type="number" min={0} max={365} defaultValue={inicial.plazoDias} disabled={tipoPago === "Contado"} />
          </Campo>
        </div>
        <Campo etiqueta="Método de pago">
          <Selector name="metodoPago" defaultValue={inicial.metodoPago}>
            {FINPPI.metodoPago.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Tipo de operación">
          <Selector name="tipoOperacion" defaultValue={inicial.tipoOperacion}>
            {FINPPI.tipoOperacion.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
        {tipoPago === "Contado" && <input type="hidden" name="plazoDias" value="0" />}
      </fieldset>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Mensaje r={estado} />
          <Boton variante="secundario" tamano="sm" disabled={pendiente} className="ml-auto">
            {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar condiciones
          </Boton>
        </div>
      )}
    </form>
  );
}

export interface ResumenEmision {
  cliente: string;
  correo: string;
  moneda: "COP" | "USD";
  totalOriginal: string;
  totalCop: string;
  trm?: string;
  proximo?: string;
  bloqueos: string[];
  simulacion: boolean;
  /** «borrador»: modo prueba (Guardar en Finppi). */
  modo: "borrador" | "real";
}

export function BotonEmitir({ facturaId, resumen, reintento }: { facturaId: string; resumen: ResumenEmision; reintento?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [confirmo, setConfirmo] = useState(false);
  const [enviar, setEnviar] = useState(true);
  const [crearCliente, setCrearCliente] = useState(true);
  const [r, setR] = useState<R>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const bloqueada = resumen.bloqueos.length > 0;

  const ejecutar = (dryRun: boolean) =>
    iniciar(async () => {
      const x = await emitirFacturaElectronica(facturaId, { dryRun, enviarAlEmitir: enviar, crearCliente, confirmo });
      setR(x);
      if (x?.ok) {
        if (!dryRun) setAbierto(false);
        router.refresh();
      }
    });

  return (
    <>
      <Boton className="w-full" tamano="lg" onClick={() => { setR(null); setAbierto(true); }}>
        <ShieldCheck /> {reintento ? "Reintentar emisión" : "Emitir factura electrónica"}
      </Boton>
      {r && !abierto && <Mensaje r={r} />}
      <Dialogo
        abierto={abierto}
        cerrar={() => setAbierto(false)}
        titulo="Confirmar emisión ante la DIAN"
        descripcion="El bot transcribe estos valores en Finppi y la DIAN la valida. No se puede deshacer."
        ancho="max-w-lg"
      >
        <div className="space-y-4 p-5">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="bg-gradient-to-br from-[#0a0f1f] to-[#1a2550] p-4 text-white">
              <p className="text-[12px] text-white/60">{resumen.cliente}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular">{resumen.totalOriginal}</p>
              {resumen.moneda === "USD" && (
                <p className="mt-1 font-mono text-[12px] text-white/70">
                  = {resumen.totalCop} · TRM {resumen.trm}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 p-4 text-[13px]">
              <div>
                <dt className="text-subtle">Va a la DIAN en</dt>
                <dd className="font-medium">Pesos colombianos</dd>
              </div>
              <div>
                <dt className="text-subtle">Número</dt>
                <dd className="font-mono font-medium">{resumen.proximo ?? "El siguiente de Finppi"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-subtle">Finppi enviará la factura a</dt>
                <dd className="font-medium break-all">{resumen.correo || "—"}</dd>
              </div>
            </dl>
          </div>

          {bloqueada ? (
            <div className="space-y-1.5 rounded-lg bg-danger-soft p-3 text-[13px] text-danger">
              <p className="font-medium">Antes de emitir:</p>
              <ul className="list-disc space-y-1 pl-5">
                {resumen.bloqueos.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-2.5 text-[13px]">
              <label className="flex items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={crearCliente} onChange={(e) => setCrearCliente(e.target.checked)} />
                <span>Si el cliente no existe en Finppi, créalo con sus datos fiscales.</span>
              </label>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={enviar} onChange={(e) => setEnviar(e.target.checked)} />
                <span>
                  Al quedar emitida, enviar al cliente el PDF de LOGIKS y el archivo de la DIAN.
                </span>
              </label>
              <label className="flex items-start gap-2.5 rounded-lg border border-border p-3">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
                <span>
                  <b>Entiendo</b> que la emisión no se puede deshacer y que debo verificar que la DIAN la haya aceptado.
                </span>
              </label>
              {resumen.modo === "borrador" && !resumen.simulacion && (
                <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft p-2.5 text-xs text-warning">
                  <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <b>Modo prueba:</b> el bot hace todo el proceso en Finppi pero pulsa «Guardar» (borrador). No va a la DIAN, no genera
                    CUFE y no se envía al cliente. La factura queda marcada como prueba y puedes descartarla.
                  </span>
                </p>
              )}
              {resumen.simulacion && (
                <p className="rounded-lg bg-warning-soft p-2.5 text-xs text-warning">
                  Modo demo: la emisión se simula al instante con un CUFE ficticio. Nada llega a Finppi ni a la DIAN.
                </p>
              )}
            </div>
          )}

          <Mensaje r={r} />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Boton variante="secundario" onClick={() => ejecutar(true)} disabled={pendiente || bloqueada}>
              {pendiente ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Probar sin emitir
            </Boton>
            <Boton onClick={() => ejecutar(false)} disabled={pendiente || bloqueada || !confirmo}>
              {pendiente ? <LoaderCircle className="animate-spin" /> : <Send />} {resumen.modo === "borrador" ? "Guardar en Finppi (prueba)" : "Emitir ahora"}
            </Boton>
          </div>
        </div>
      </Dialogo>
    </>
  );
}

/** Mientras el bot trabaja, la página se actualiza sola. */
export function RefrescoEnVivo({ activo, cada = 3000 }: { activo: boolean; cada?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => router.refresh(), cada);
    return () => clearInterval(t);
  }, [activo, cada, router]);
  return null;
}

export function BotonEnviarCliente({ facturaId, yaEnviada }: { facturaId: string; yaEnviada?: boolean }) {
  const [r, setR] = useState<R>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="space-y-2">
      <Boton
        variante={yaEnviada ? "secundario" : "primario"}
        className="w-full"
        disabled={pendiente}
        onClick={() => iniciar(async () => setR(await enviarFacturaCliente(facturaId)))}
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <Mail />} {yaEnviada ? "Reenviar al cliente" : "Enviar al cliente"}
      </Boton>
      <Mensaje r={r} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conexión con Finppi                                                  */
/* ------------------------------------------------------------------ */

export function FormConexionFinppi({ reconectar }: { reconectar: boolean }) {
  const [estado, accion, pendiente] = useActionState(conectarFinppi, null);
  const enviar = useEnvio(accion);
  const [acepto, setAcepto] = useState(false);
  return (
    <form onSubmit={enviar} className="space-y-4" autoComplete="off">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Correo de Finppi">
          <Entrada name="usuario" type="email" required autoComplete="off" placeholder="facturacion@tuempresa.co" />
        </Campo>
        <Campo etiqueta="Contraseña de Finppi" ayuda="Se cifra y nunca se vuelve a mostrar">
          <Entrada name="clave" type="password" required autoComplete="new-password" />
        </Campo>
      </div>
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="mb-2 text-[13px] font-semibold">Autorización y responsabilidad del usuario</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted">
          {TEXTO_CONSENTIMIENTO.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        <label className="mt-3 flex items-start gap-2.5 text-[13px]">
          <input type="checkbox" name="acepto" value="si" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>Leí y acepto la autorización (versión 1.0).</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Mensaje r={estado} />
        <Boton disabled={pendiente || !acepto} className="ml-auto">
          {pendiente ? <LoaderCircle className="animate-spin" /> : <PlugZap />} {reconectar ? "Actualizar y probar conexión" : "Guardar y probar conexión"}
        </Boton>
      </div>
    </form>
  );
}

export function AccionesConexion({ admin, conectada }: { admin: boolean; conectada: boolean }) {
  const [r, setR] = useState<R>(null);
  const [pendiente, iniciar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {conectada && (
          <Boton variante="secundario" tamano="sm" disabled={pendiente} onClick={() => iniciar(async () => setR(await probarConexionFinppi()))}>
            {pendiente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Actualizar datos de Finppi
          </Boton>
        )}
        {admin && conectada && (
          <Boton
            variante="secundario"
            tamano="sm"
            disabled={pendiente}
            className={confirmar ? "border-danger/40 text-danger" : undefined}
            onClick={() => {
              if (!confirmar) return setConfirmar(true);
              iniciar(async () => setR(await desconectarFinppi()));
              setConfirmar(false);
            }}
          >
            <Unplug /> {confirmar ? "¿Seguro? Borra las credenciales" : "Desconectar"}
          </Boton>
        )}
      </div>
      <Mensaje r={r} />
    </div>
  );
}

export function FormResolucion({ texto, condiciones, editable }: { texto: string; condiciones: string; editable: boolean }) {
  const [estado, accion, pendiente] = useActionState(guardarResolucion, null);
  const enviar = useEnvio(accion);
  return (
    <form onSubmit={enviar} className="space-y-3">
      <Campo etiqueta="Información tributaria y resolución" ayuda="Encabezado de la factura: régimen, responsabilidades, actividad económica y resolución DIAN.">
        <AreaTexto
          name="resolucion"
          rows={4}
          defaultValue={texto}
          disabled={!editable}
          placeholder="Responsable de IVA · No somos autorretenedores · Actividad económica 5229 · Resolución DIAN N.º 18764000000000 del 2026-01-01, prefijo FE del 1 al 10000."
        />
      </Campo>
      <Campo etiqueta="Condiciones y notas legales" ayuda="Pie de la factura: TRM de pago, intereses de mora, responsabilidad sobre la carga.">
        <AreaTexto
          name="condiciones"
          rows={4}
          defaultValue={condiciones}
          disabled={!editable}
          placeholder="Las facturas en dólares se pagan a la TRM del día de pago… La mora causa intereses a la tasa máxima legal… Las mercancías viajan por cuenta y riesgo del cliente…"
        />
      </Campo>
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Mensaje r={estado} />
          <Boton variante="secundario" tamano="sm" disabled={pendiente} className="ml-auto">
            {pendiente ? <LoaderCircle className="animate-spin" /> : <Save />} Guardar
          </Boton>
        </div>
      )}
    </form>
  );
}

export function EstadoBot({ latidoEl, pausado, demo, bajoDemanda }: { latidoEl?: string; pausado: boolean; demo: boolean; bajoDemanda?: boolean }) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setAhora(Date.now());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  if (demo) return <Insignia tono="alerta" punto>Bot simulado (demo)</Insignia>;
  if (pausado) return <Insignia tono="peligro" punto>Bot en pausa de seguridad</Insignia>;
  const vivo = !!latidoEl && ahora !== null && ahora - new Date(latidoEl).getTime() < 3 * 60_000;
  if (bajoDemanda) {
    return vivo ? (
      <Insignia tono="exito" punto>Bot trabajando</Insignia>
    ) : (
      <Insignia tono="info" punto>Bot bajo demanda · se enciende al confirmar</Insignia>
    );
  }
  return vivo ? (
    <Insignia tono="exito" punto>Bot en línea</Insignia>
  ) : (
    <Insignia tono="neutro" punto>Bot sin conexión</Insignia>
  );
}

/* ------------------------------------------------------------------ */
/* Monedas que ve el cliente                                           */
/* ------------------------------------------------------------------ */

const OPCIONES_PRESENTACION: { valor: Presentacion; titulo: string; detalle: string }[] = [
  { valor: "usd", titulo: "Solo USD", detalle: "El cliente no ve pesos" },
  { valor: "ambas", titulo: "USD y COP", detalle: "Con el equivalente fiscal" },
  { valor: "cop", titulo: "Solo COP", detalle: "Valores en pesos" },
];

/**
 * Selector de cómo se presenta al cliente una factura en dólares. Se usa
 * por factura y como valor por defecto de la empresa.
 */
export function SelectorPresentacion({
  valor,
  facturaId,
  editable,
  etiqueta = "El cliente ve el PDF en",
}: {
  valor: Presentacion;
  /** Sin factura, guarda el valor por defecto de la empresa. */
  facturaId?: string;
  editable: boolean;
  etiqueta?: string;
}) {
  const [actual, setActual] = useState(valor);
  const [r, setR] = useState<R>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const elegir = (v: Presentacion) => {
    if (!editable || v === actual) return;
    const anterior = actual;
    setActual(v);
    iniciar(async () => {
      const x = facturaId ? await cambiarPresentacionFactura(facturaId, v) : await cambiarPresentacionEmpresa(v);
      if (!x?.ok) setActual(anterior);
      setR(x?.ok && facturaId ? null : x);
      router.refresh();
    });
  };
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        {etiqueta}
        {pendiente && <LoaderCircle className="size-3.5 animate-spin text-subtle" />}
      </p>
      <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-2 p-1">
        {OPCIONES_PRESENTACION.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={actual === o.valor}
            disabled={!editable}
            onClick={() => elegir(o.valor)}
            className={cn(
              "rounded-md px-2 py-1.5 text-left transition-colors disabled:cursor-default",
              actual === o.valor ? "bg-surface shadow-sm ring-1 ring-border" : "text-muted hover:text-fg",
            )}
          >
            <span className="block text-[12.5px] font-medium">{o.titulo}</span>
            <span className="block text-[11px] text-subtle">{o.detalle}</span>
          </button>
        ))}
      </div>
      <Mensaje r={r} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modo de emisión (prueba / real) y descartar pruebas                 */
/* ------------------------------------------------------------------ */

export function SelectorModoEmision({ valor, editable }: { valor: "borrador" | "real"; editable: boolean }) {
  const [actual, setActual] = useState(valor);
  const [confirmar, setConfirmar] = useState(false);
  const [r, setR] = useState<R>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const guardar = (v: "borrador" | "real") =>
    iniciar(async () => {
      const x = await cambiarModoEmision(v);
      setR(x);
      if (x?.ok) setActual(v);
      setConfirmar(false);
      router.refresh();
    });
  const opciones = [
    { v: "borrador" as const, titulo: "Prueba", detalle: "El bot hace todo y pulsa «Guardar» en Finppi. No va a la DIAN." },
    { v: "real" as const, titulo: "Real", detalle: "El bot pulsa «Enviar»: la factura va a la DIAN." },
  ];
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Modo de emisión" className="grid gap-2 sm:grid-cols-2">
        {opciones.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={actual === o.v}
            disabled={!editable || pendiente}
            onClick={() => (o.v === "real" && actual !== "real" ? setConfirmar(true) : o.v !== actual && guardar(o.v))}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors disabled:cursor-default",
              actual === o.v
                ? o.v === "real"
                  ? "border-success/40 bg-success-soft"
                  : "border-warning/40 bg-warning-soft"
                : "border-border hover:border-border-strong",
            )}
          >
            <span className="flex items-center gap-2 text-[13.5px] font-semibold">
              {o.v === "real" ? <ShieldCheck className="size-4" /> : <FlaskConical className="size-4" />} {o.titulo}
              {actual === o.v && <Insignia tono={o.v === "real" ? "exito" : "alerta"}>activo</Insignia>}
            </span>
            <span className="mt-1 block text-xs text-muted">{o.detalle}</span>
          </button>
        ))}
      </div>
      {confirmar && (
        <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger">
          <p>
            <b>¿Pasar a modo real?</b> Desde ahora, al confirmar una factura el bot la enviará a la DIAN y no se puede deshacer. Hazlo
            solo cuando las pruebas con «Guardar» salieron bien. El servidor del bot además debe tener la emisión habilitada.
          </p>
          <div className="flex gap-2">
            <Boton tamano="sm" onClick={() => guardar("real")} disabled={pendiente}>
              {pendiente ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />} Sí, pasar a real
            </Boton>
            <Boton tamano="sm" variante="secundario" onClick={() => setConfirmar(false)}>
              Seguir en prueba
            </Boton>
          </div>
        </div>
      )}
      <Mensaje r={r} />
    </div>
  );
}

export function BotonDescartarPrueba({ facturaId }: { facturaId: string }) {
  const [r, setR] = useState<R>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <Boton
        variante="secundario"
        className={cn("w-full", confirmar && "border-danger/40 text-danger")}
        disabled={pendiente}
        onClick={() => {
          if (!confirmar) return setConfirmar(true);
          iniciar(async () => {
            const x = await descartarPrueba(facturaId);
            setR(x);
            setConfirmar(false);
            router.refresh();
          });
        }}
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        {confirmar ? "¿Seguro? Vuelve a prefactura" : "Descartar prueba"}
      </Boton>
      <Mensaje r={r} />
    </div>
  );
}

/** Detiene el envío que espera en la cola (antes de que el bot lo tome). */
export function BotonDetenerEnvio({ facturaId }: { facturaId: string }) {
  const [r, setR] = useState<R>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <Boton
        variante="secundario"
        tamano="sm"
        className={cn(confirmar && "border-danger/40 text-danger")}
        disabled={pendiente}
        onClick={() => {
          if (!confirmar) return setConfirmar(true);
          iniciar(async () => {
            const x = await detenerEnvio(facturaId);
            setR(x);
            setConfirmar(false);
            router.refresh();
          });
        }}
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <CircleStop />}
        {confirmar ? "¿Seguro? Vuelve a prefactura" : "Detener envío"}
      </Boton>
      <Mensaje r={r} />
    </div>
  );
}

/** El bot lee los productos de Finppi (solo lectura) y los carga al catálogo. */
export function BotonTraerProductos({ activa }: { activa: boolean }) {
  const [r, setR] = useState<R>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-1.5">
      <Boton
        variante="secundario"
        tamano="sm"
        disabled={pendiente || !activa}
        title={activa ? undefined : "Primero conecta y verifica tu cuenta de Finppi"}
        onClick={() =>
          iniciar(async () => {
            setR(await traerProductosFinppi());
            router.refresh();
          })
        }
      >
        {pendiente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Traer de Finppi
      </Boton>
      <Mensaje r={r} />
    </div>
  );
}
