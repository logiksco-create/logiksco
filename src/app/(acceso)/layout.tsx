import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/marca";
import { modoDemo } from "@/lib/env";

export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          {modoDemo && (
            <div className="mb-6 rounded-xl border border-brand/20 bg-brand-soft p-4 text-[13px] text-brand-fg">
              Estás en <strong>modo demo</strong>: no hace falta cuenta.{" "}
              <Link href="/app" className="font-semibold underline">
                Entrar a la demo
              </Link>
            </div>
          )}
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[#070b17] lg:block">
        <div className="bg-grid absolute inset-0 opacity-70" />
        <div className="absolute -top-20 -left-20 size-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(79,107,255,0.35),transparent)]" />
        <div className="absolute -right-20 -bottom-20 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(20,200,180,0.25),transparent)]" />
        <div className="relative flex h-full flex-col justify-end p-14 text-white">
          <ShieldCheck className="size-8 text-[#14c8b4]" />
          <p className="mt-5 max-w-md text-3xl font-semibold tracking-tight text-balance">
            Cada empresa, aislada. Cada acción, auditada. Cada correo, con respaldo.
          </p>
          <p className="mt-4 max-w-md text-white/55">
            Seguridad a nivel de fila en la base de datos, enlaces públicos con tokens de un solo uso y bitácora inmutable.
          </p>
        </div>
      </div>
    </div>
  );
}
