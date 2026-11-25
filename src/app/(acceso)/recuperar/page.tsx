import { FormRecuperar } from "@/components/publico/auth";

export const metadata = { title: "Recuperar contraseña" };

export default function Recuperar() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Recupera tu contraseña</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Te enviamos un enlace para definir una nueva.</p>
      <FormRecuperar />
    </>
  );
}
