import { FormIngreso } from "@/components/publico/auth";

export const metadata = { title: "Ingresar" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { siguiente } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
      <p className="mt-1 mb-8 text-sm text-muted">Ingresa a la operación de tu empresa.</p>
      <FormIngreso siguiente={typeof siguiente === "string" ? siguiente : undefined} />
    </>
  );
}
