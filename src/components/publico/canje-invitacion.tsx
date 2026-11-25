"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { LoaderCircle } from "lucide-react";

/**
 * Las invitaciones enviadas por el correo de Supabase traen la sesión en el
 * fragmento de la URL (#access_token=…), que el servidor no recibe. Aquí se
 * canjea en el navegador y se pasa a definir la contraseña.
 */
export function CanjeInvitacion() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const access_token = h.get("access_token");
    const refresh_token = h.get("refresh_token");
    if (!access_token || !refresh_token) {
      queueMicrotask(() => setError(true));
      return;
    }
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    sb.auth.setSession({ access_token, refresh_token }).then(({ error: e }) => {
      history.replaceState(null, "", window.location.pathname); // no dejar tokens en la barra
      if (e) setError(true);
      else router.replace("/auth/clave");
    });
  }, [router]);

  return error ? (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">El enlace venció</h1>
      <p className="mt-2 text-sm text-muted">Pide a quien te invitó que te envíe una nueva invitación.</p>
    </div>
  ) : (
    <div className="flex items-center gap-3 text-sm text-muted">
      <LoaderCircle className="size-5 animate-spin" /> Validando tu invitación…
    </div>
  );
}
