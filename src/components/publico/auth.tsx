"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { definirClave, ingresar, recuperarClave, registrar } from "@/server/acciones/auth";
import { Boton, Campo, Entrada } from "@/components/ui";

export function FormIngreso({ siguiente }: { siguiente?: string }) {
  const [estado, accion, pendiente] = useActionState(ingresar, null);
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="siguiente" value={siguiente ?? "/app"} />
      <Campo etiqueta="Correo">
        <Entrada name="correo" type="email" required autoComplete="email" />
      </Campo>
      <Campo etiqueta="Contraseña">
        <Entrada name="clave" type="password" required autoComplete="current-password" />
      </Campo>
      <p className="-mt-2 text-right text-[13px]">
        <Link href="/recuperar" className="text-muted hover:text-fg">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
      {estado && !estado.ok && <p className="text-[13px] text-danger">{estado.error}</p>}
      <Boton className="w-full" tamano="lg" disabled={pendiente}>
        {pendiente && <LoaderCircle className="animate-spin" />} Ingresar
      </Boton>
      <p className="text-center text-[13px] text-muted">
        ¿Tu empresa aún no usa LOGIKS?{" "}
        <Link href="/registro" className="font-medium text-brand-fg hover:underline">
          Crea una cuenta
        </Link>
      </p>
    </form>
  );
}

export function FormRegistro() {
  const [estado, accion, pendiente] = useActionState(registrar, null);
  if (estado?.ok) {
    return (
      <div className="py-6 text-center">
        <CircleCheck className="mx-auto size-10 text-success" />
        <p className="mt-3 font-semibold">Revisa tu correo</p>
        <p className="mt-1 text-sm text-muted">{estado.mensaje}</p>
      </div>
    );
  }
  return (
    <form action={accion} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="NIT de la empresa">
          <Entrada name="nit" required placeholder="901456789-1" />
        </Campo>
        <Campo etiqueta="Razón social">
          <Entrada name="razonSocial" required autoComplete="organization" />
        </Campo>
      </div>
      <Campo etiqueta="Tu nombre">
        <Entrada name="nombre" required autoComplete="name" />
      </Campo>
      <Campo etiqueta="Correo de trabajo">
        <Entrada name="correo" type="email" required autoComplete="email" />
      </Campo>
      <Campo etiqueta="Contraseña" ayuda="Mínimo 10 caracteres">
        <Entrada name="clave" type="password" required minLength={10} autoComplete="new-password" />
      </Campo>
      {estado && !estado.ok && <p className="text-[13px] text-danger">{estado.error}</p>}
      <Boton className="w-full" tamano="lg" disabled={pendiente}>
        {pendiente && <LoaderCircle className="animate-spin" />} Crear cuenta y empezar prueba
      </Boton>
      <p className="text-center text-xs text-subtle">14 días gratis con todas las funciones. Sin tarjeta.</p>
    </form>
  );
}

export function FormClave() {
  const [estado, accion, pendiente] = useActionState(definirClave, null);
  return (
    <form action={accion} className="space-y-4">
      <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 10 caracteres">
        <Entrada name="clave" type="password" required minLength={10} autoComplete="new-password" />
      </Campo>
      <Campo etiqueta="Confirmar contraseña">
        <Entrada name="confirmar" type="password" required minLength={10} autoComplete="new-password" />
      </Campo>
      {estado && !estado.ok && <p className="text-[13px] text-danger">{estado.error}</p>}
      <Boton className="w-full" tamano="lg" disabled={pendiente}>
        {pendiente && <LoaderCircle className="animate-spin" />} Guardar y entrar
      </Boton>
    </form>
  );
}

export function FormRecuperar() {
  const [estado, accion, pendiente] = useActionState(recuperarClave, null);
  if (estado?.ok) return <p className="rounded-xl bg-success-soft p-4 text-sm text-success">{estado.mensaje}</p>;
  return (
    <form action={accion} className="space-y-4">
      <Campo etiqueta="Correo">
        <Entrada name="correo" type="email" required autoComplete="email" />
      </Campo>
      {estado && !estado.ok && <p className="text-[13px] text-danger">{estado.error}</p>}
      <Boton className="w-full" tamano="lg" disabled={pendiente}>
        {pendiente && <LoaderCircle className="animate-spin" />} Enviar enlace
      </Boton>
    </form>
  );
}
