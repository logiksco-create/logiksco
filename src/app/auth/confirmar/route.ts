import { NextResponse, type NextRequest } from "next/server";
import { clienteUsuario } from "@/server/supabase/clientes";

/**
 * Destino del enlace de verificación de correo de Supabase (flujo PKCE).
 * Canjea el código por una sesión y entra a la app; al primer ingreso se
 * crea la empresa con los datos del registro (ver server/contexto.ts).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const codigo = url.searchParams.get("code");
  const siguiente = url.searchParams.get("siguiente") ?? "/app";
  const destino = siguiente.startsWith("/app") && !siguiente.startsWith("//") ? siguiente : "/app";

  if (codigo) {
    const db = await clienteUsuario();
    const { error } = await db.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(new URL(destino, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=enlace", url.origin));
}
