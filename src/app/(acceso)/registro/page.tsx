import { FormRegistro } from "@/components/publico/auth";

export const metadata = { title: "Crear cuenta" };

export default function Registro() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Registra tu empresa</h1>
      <p className="mt-1 mb-8 text-sm text-muted">En menos de 30 minutos estarás enviando tu primera cotización.</p>
      <FormRegistro />
    </>
  );
}
