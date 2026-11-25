import { FormClave } from "@/components/publico/auth";

export const metadata = { title: "Define tu contraseña" };

export default function Clave() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Define tu contraseña</h1>
      <p className="mt-1 mb-8 text-sm text-muted">La usarás para entrar a LOGIKS.CO.</p>
      <FormClave />
    </>
  );
}
