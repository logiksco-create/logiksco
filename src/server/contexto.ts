import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, modoDemo } from "@/lib/env";
import type { Repositorio, RepositorioPortal, RepositorioPublico } from "./datos/repositorio";
import { DemoRepositorio, DemoRepositorioPortal, DemoRepositorioPublico, accesosDemo } from "./datos/demo/repositorio-demo";
import { crearSemilla } from "./datos/demo/semilla";
import {
  SupabaseRepositorio,
  SupabaseRepositorioPublico,
  mapEmpresa,
  repositorioPortalDe,
} from "./datos/supabase/repositorio-supabase";
import { clienteServicio, clienteUsuario } from "./supabase/clientes";
import type { Rol } from "@/domain/types";

export const COOKIE_EMPRESA = "logiks_empresa";
export const COOKIE_USUARIO_DEMO = "logiks_demo_usuario";
export const COOKIE_PORTAL = "logiks_portal_cliente";

/**
 * Resuelve el repositorio de la petición actual: usuario autenticado + empresa
 * activa. Se memoiza por petición con `cache`.
 */
export const contexto = cache(async (): Promise<Repositorio> => {
  const store = await cookies();

  if (modoDemo) {
    const usuarios = crearSemilla().usuarios;
    const elegido = store.get(COOKIE_USUARIO_DEMO)?.value;
    return new DemoRepositorio(usuarios.find((u) => u.id === elegido) ?? usuarios[0]);
  }

  const db = await clienteUsuario();
  const { data: claims } = await db.auth.getClaims();
  const uid = claims?.claims.sub;
  if (!uid) redirect("/login");

  const membresiasDe = () =>
    db.from("usuarios_empresa").select("roles, nombre, empresas(*)").eq("usuario_id", uid).eq("activo", true);
  let { data: membresias, error: errorMembresias } = await membresiasDe();
  if (errorMembresias) console.error("[contexto] membresías:", errorMembresias.message);

  // Usuarios del cliente: su lugar es el portal.
  if (!membresias?.length) {
    const { count } = await db.from("usuarios_cliente").select("usuario_id", { count: "exact", head: true }).eq("usuario_id", uid).eq("activo", true);
    if (count) redirect("/portal");
  }

  // Primer ingreso tras verificar el correo: crea la empresa con los datos
  // que el administrador dejó al registrarse. Se leen del usuario en Supabase
  // (el token puede no traerlos).
  if (!membresias?.length) {
    const { data: datosUsuario } = await db.auth.getUser();
    const meta = (datosUsuario.user?.user_metadata ?? {}) as Record<string, string>;
    if (meta.nit && meta.razon_social) {
      const { data: empresaId, error: errorRegistro } = await db.rpc("registrar_empresa", {
        p_nit: meta.nit,
        p_razon_social: meta.razon_social,
        p_nombre: meta.nombre ?? "Administrador",
      });
      if (errorRegistro) console.error("[contexto] registrar_empresa:", errorRegistro.message);
      if (empresaId) {
        // Consulta distinta a la primera: Next.js reutiliza dentro de la misma
        // petición la respuesta de un GET idéntico, que estaría vacía.
        ({ data: membresias, error: errorMembresias } = await membresiasDe().eq("empresa_id", empresaId));
        if (errorMembresias) console.error("[contexto] membresías tras registro:", errorMembresias.message);
      }
    }
  }
  if (!membresias?.length) {
    console.error("[contexto] usuario sin empresa tras el primer ingreso");
    redirect("/registro");
  }

  // Un usuario puede pertenecer a varias empresas y cambiar entre ellas.
  const activa =
    membresias.find((m) => (m.empresas as unknown as { id: string }).id === store.get(COOKIE_EMPRESA)?.value) ??
    membresias[0];

  return new SupabaseRepositorio(
    db,
    mapEmpresa(activa.empresas as never),
    {
      id: uid,
      nombre: activa.nombre,
      correo: (claims.claims.email as string) ?? "",
      roles: activa.roles as Rol[],
    },
    clienteServicio,
    env.appUrl,
  );
});

export function repositorioPublico(): RepositorioPublico {
  return modoDemo ? new DemoRepositorioPublico() : new SupabaseRepositorioPublico(clienteServicio());
}

export function tieneRol(repo: Repositorio, ...roles: Rol[]) {
  return repo.usuario.roles.some((r) => r === "admin" || roles.includes(r));
}

/** Contexto del portal del cliente (RF-35). */
export const contextoPortal = cache(async (): Promise<RepositorioPortal> => {
  const store = await cookies();
  const preferido = store.get(COOKIE_PORTAL)?.value;
  if (modoDemo) {
    const accesos = accesosDemo();
    return new DemoRepositorioPortal(accesos.find((a) => a.usuarioId === preferido) ?? accesos[0]);
  }
  const db = await clienteUsuario();
  const { data } = await db.auth.getClaims();
  const uid = data?.claims.sub;
  if (!uid) redirect("/login?siguiente=/portal");
  const repo = await repositorioPortalDe(db, clienteServicio(), uid, preferido);
  if (!repo) redirect("/app");
  return repo;
});
