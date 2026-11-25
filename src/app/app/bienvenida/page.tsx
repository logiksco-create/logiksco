import { redirect } from "next/navigation";
import { contexto } from "@/server/contexto";
import { Bienvenida } from "@/components/app/bienvenida";

export const metadata = { title: "Bienvenida" };

export default async function PaginaBienvenida() {
  const repo = await contexto();
  if (repo.empresa.configurada !== false || !repo.usuario.roles.includes("admin")) redirect("/app");
  return <Bienvenida empresa={repo.empresa} />;
}
