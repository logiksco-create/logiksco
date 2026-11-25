"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle, Rocket, UserPlus } from "lucide-react";
import { TIPOS_SERVICIO, type Empresa } from "@/domain/types";
import { guardarPasoBienvenida, invitarUsuario } from "@/server/acciones/configuracion";
import { Boton, Campo, Entrada, Tarjeta } from "@/components/ui";
import { cn } from "@/lib/formato";

const PASOS = ["Tu empresa", "Consecutivos", "Servicios", "Tu equipo"];
type R = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

function Error({ r }: { r: R }) {
  return r && !r.ok ? <p className="text-[13px] text-danger">{r.error}</p> : null;
}

/** Asistente de bienvenida (PRD «Registro y arranque»): 4 pasos, menos de 30 minutos. */
export function Bienvenida({ empresa }: { empresa: Empresa }) {
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const siguiente = (r: R) => {
    if (r?.ok) setPaso((p) => p + 1);
    return r;
  };
  const [e1, a1, p1] = useActionState(async (p: R, fd: FormData) => siguiente(await guardarPasoBienvenida(1, p, fd)), null);
  const [e2, a2, p2] = useActionState(async (p: R, fd: FormData) => siguiente(await guardarPasoBienvenida(2, p, fd)), null);
  const [e3, a3, p3] = useActionState(async (p: R, fd: FormData) => siguiente(await guardarPasoBienvenida(3, p, fd)), null);
  const [e4, a4, p4] = useActionState(invitarUsuario, null);
  const [invitados, setInvitados] = useState<string[]>([]);
  const [terminando, iniciar] = useTransition();
  const [color, setColor] = useState(empresa.colorPrimario);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-accent text-white">
          <Rocket className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Bienvenido a LOGIKS.CO</h1>
        <p className="mt-1 text-sm text-muted">Cuatro pasos y quedas listo para enviar tu primera cotización.</p>
      </div>

      <ol className="mb-6 grid grid-cols-4 gap-2">
        {PASOS.map((p, i) => (
          <li key={p} className="text-center">
            <div className={cn("mx-auto h-1.5 rounded-full", i + 1 <= paso ? "bg-brand" : "bg-border")} />
            <p className={cn("mt-2 text-xs", i + 1 === paso ? "font-medium text-fg" : "text-subtle")}>{p}</p>
          </li>
        ))}
      </ol>

      <Tarjeta className="p-6">
        {paso === 1 && (
          <form action={a1} className="space-y-4">
            <h2 className="font-semibold">¿Cómo se ve tu empresa?</h2>
            <Campo etiqueta="Razón social">
              <Entrada name="razonSocial" defaultValue={empresa.razonSocial} required />
            </Campo>
            <Campo etiqueta="Ciudad">
              <Entrada name="ciudad" defaultValue={empresa.ciudad} placeholder="Rionegro, Antioquia" />
            </Campo>
            <Campo etiqueta="Color de marca" ayuda="Aparece en tus cotizaciones, correos y portal de clientes">
              <div className="flex items-center gap-3">
                <input type="color" name="colorPrimario" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-border p-1" />
                <span className="h-10 flex-1 rounded-lg" style={{ background: `linear-gradient(90deg, #0a0f1f, ${color})` }} />
              </div>
            </Campo>
            <Error r={e1} />
            <Boton disabled={p1} className="w-full" tamano="lg">
              {p1 ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Continuar
            </Boton>
          </form>
        )}

        {paso === 2 && (
          <form action={a2} className="space-y-4">
            <h2 className="font-semibold">Consecutivos</h2>
            <p className="text-[13px] text-muted">Así se numeran tus cotizaciones y operaciones. Ej.: COT-2026-0001 y DO-2026-0001.</p>
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Prefijo de cotizaciones">
                <Entrada name="prefijoCotizacion" defaultValue={empresa.prefijoCotizacion} className="font-mono uppercase" maxLength={6} required />
              </Campo>
              <Campo etiqueta="Prefijo de DO">
                <Entrada name="prefijoDO" defaultValue={empresa.prefijoDO} className="font-mono uppercase" maxLength={6} required />
              </Campo>
            </div>
            <Error r={e2} />
            <Boton disabled={p2} className="w-full" tamano="lg">
              {p2 ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Continuar
            </Boton>
          </form>
        )}

        {paso === 3 && (
          <form action={a3} className="space-y-4">
            <h2 className="font-semibold">¿Qué servicios prestas?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(TIPOS_SERVICIO).map(([v, l]) => (
                <label key={v} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" name="servicios" value={v} defaultChecked={!empresa.servicios?.length || empresa.servicios.includes(v as never)} className="size-4 accent-[var(--brand)]" />
                  {l}
                </label>
              ))}
            </div>
            <Error r={e3} />
            <Boton disabled={p3} className="w-full" tamano="lg">
              {p3 ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Continuar
            </Boton>
          </form>
        )}

        {paso === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold">Invita a tu equipo</h2>
            <p className="text-[13px] text-muted">Puedes hacerlo después desde Configuración.</p>
            <form
              action={async (fd) => {
                await a4(fd);
                const c = String(fd.get("correo") ?? "");
                if (c) setInvitados((x) => [...x, c]);
              }}
              className="grid gap-3 sm:grid-cols-[1fr_1fr_150px_auto]"
            >
              <Entrada name="nombre" placeholder="Nombre" required aria-label="Nombre" />
              <Entrada name="correo" type="email" placeholder="Correo" required aria-label="Correo" />
              <select name="roles" defaultValue="comercial" className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" aria-label="Rol">
                <option value="comercial">Comercial</option>
                <option value="operaciones">Operaciones</option>
                <option value="cumplimiento">Cumplimiento</option>
                <option value="contabilidad">Contabilidad</option>
                <option value="admin">Administrador</option>
              </select>
              <Boton variante="secundario" disabled={p4}>
                {p4 ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Invitar
              </Boton>
            </form>
            <Error r={e4} />
            {invitados.length > 0 && e4?.ok && (
              <ul className="space-y-1 text-[13px] text-success">
                {invitados.map((c) => (
                  <li key={c} className="flex items-center gap-1.5">
                    <Check className="size-4" /> {c}
                  </li>
                ))}
              </ul>
            )}
            <Boton
              className="w-full"
              tamano="lg"
              disabled={terminando}
              onClick={() =>
                iniciar(async () => {
                  const r = await guardarPasoBienvenida(5, null, new FormData());
                  if (r?.ok) router.push("/app/cotizaciones/nueva");
                })
              }
            >
              {terminando ? <LoaderCircle className="animate-spin" /> : <Rocket />} Terminar y crear mi primera cotización
            </Boton>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
