import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Cliente con la sesión del usuario: todas las consultas pasan por RLS. */
export async function clienteUsuario() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) store.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy
          // se encarga de refrescar la sesión.
        }
      },
    },
  });
}

/**
 * Cliente de servicio: omite RLS. Úsalo SOLO en el servidor para flujos sin
 * sesión ya validados (enlace público con token, webhooks firmados).
 */
export function clienteServicio() {
  if (!env.supabaseServiceKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
