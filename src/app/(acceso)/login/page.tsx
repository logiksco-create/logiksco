import { FormIngreso } from "@/components/publico/auth";

export const metadata = { title: "Ingresar" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { siguiente, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Ingresa a la operación de tu empresa.</p>
      {error === "enlace" && (
        <p className="mb-6 rounded-xl bg-warning-soft p-3 text-[13px] text-warning">
          El enlace venció o ya se usó. Ingresa o pide uno nuevo en «¿Olvidaste tu contraseña?».
        </p>
      )}
      <FormIngreso siguiente={typeof siguiente === "string" ? siguiente : undefined} />
    </>
  );
}
