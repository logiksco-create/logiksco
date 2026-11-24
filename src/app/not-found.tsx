import Link from "next/link";
import { Compass } from "lucide-react";
import { clasesBoton } from "@/components/ui";

export default function NoEncontrado() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Compass className="size-10 text-brand-fg" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">No encontramos esta página</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">El enlace puede haber vencido o la carga cambió de ruta.</p>
      <Link href="/" className={`${clasesBoton({ variante: "secundario" })} mt-6`}>
        Volver al inicio
      </Link>
    </div>
  );
}
