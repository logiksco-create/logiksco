import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { clienteUsuario } from "@/server/supabase/clientes";

const TIPOS: EmailOtpType[] = ["email", "signup", "invite", "recovery", "email_change", "magiclink"];

/**
 * Destino de los enlaces de los correos de Supabase:
 *  - token_hash + type (plantillas propias): funciona desde cualquier dispositivo.
 *  - code (flujo PKCE): mismo navegador donde se pidió.
 * Invitación y recuperación llevan a definir la contraseña.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const db = await clienteUsuario();
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const codigo = url.searchParams.get("code");
  const siguiente = url.searchParams.get("siguiente") ?? "/app";
  const destino = siguiente.startsWith("/app") && !siguiente.startsWith("//") ? siguiente : "/app";

  let ok = false;
  if (tokenHash && tipo && TIPOS.includes(tipo)) {
    ok = !(await db.auth.verifyOtp({ token_hash: tokenHash, type: tipo })).error;
  } else if (codigo) {
    ok = !(await db.auth.exchangeCodeForSession(codigo)).error;
  }
  if (!ok) return NextResponse.redirect(new URL("/login?error=enlace", url.origin));
  const ir = tipo === "invite" || tipo === "recovery" ? "/auth/clave" : destino;
  return NextResponse.redirect(new URL(ir, url.origin));
}
