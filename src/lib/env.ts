import "server-only";

/**
 * Configuración del entorno. Sin las variables de Supabase la aplicación
 * arranca en modo demo, con datos en memoria y sin autenticación.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export const modoDemo = !env.supabaseUrl || !env.supabaseAnonKey;
