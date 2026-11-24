import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { modoDemo } from "@/lib/env";
import type { Repositorio, RepositorioPublico } from "./datos/repositorio";
import { DemoRepositorio, DemoRepositorioPublico } from "./datos/demo/repositorio-demo";
import { crearSemilla } from "./datos/demo/semilla";
import {
  SupabaseRepositorio,
  SupabaseRepositorioPublico,
  mapEmpresa,
} from "./datos/supabase/repositorio-supabase";
import { clienteServicio, clienteUsuario } from "./supabase/clientes";
import type { Rol } from "@/domain/types";

export const COOKIE_EMPRESA = "logiks_empresa";
export const COOKIE_USUARIO_DEMO = "logiks_demo_usuario";

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
  let { data: membresias } = await membresiasDe();

  // Primer ingreso tras verificar el correo: crea la empresa con los datos
  // que el administrador dejó al registrarse.
  if (!membresias?.length) {
    const meta = (claims.claims.user_metadata ?? {}) as Record<string, string>;
    if (meta.nit && meta.razon_social) {
      await db.rpc("registrar_empresa", {
        p_nit: meta.nit,
        p_razon_social: meta.razon_social,
        p_nombre: meta.nombre ?? "Administrador",
      });
      ({ data: membresias } = await membresiasDe());
    }
  }
  if (!membresias?.length) redirect("/registro");

  // Un usuario puede pertenecer a varias empresas y cambiar entre ellas.
  const activa =
    membresias.find((m) => (m.empresas as unknown as { id: string }).id === store.get(COOKIE_EMPRESA)?.value) ??
    membresias[0];

  return new SupabaseRepositorio(db, mapEmpresa(activa.empresas as never), {
    id: uid,
    nombre: activa.nombre,
    correo: (claims.claims.email as string) ?? "",
    roles: activa.roles as Rol[],
  });
});

export function repositorioPublico(): RepositorioPublico {
  return modoDemo ? new DemoRepositorioPublico() : new SupabaseRepositorioPublico(clienteServicio());
}

export function tieneRol(repo: Repositorio, ...roles: Rol[]) {
  return repo.usuario.roles.some((r) => r === "admin" || roles.includes(r));
}
