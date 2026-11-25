import { contexto } from "@/server/contexto";
import { Encabezado } from "@/components/app/encabezado";
import { FormEmpresa, GestionUsuarios } from "@/components/app/configuracion";
import { FormMegafoco } from "@/components/app/facturacion";
import Link from "next/link";
import { ListTree } from "lucide-react";
import { Tarjeta, TarjetaEncabezado, clasesBoton } from "@/components/ui";

export const metadata = { title: "Configuración" };

export default async function Configuracion() {
  const repo = await contexto();
  const [usuarios, megafoco] = await Promise.all([repo.usuarios(), repo.megafocoConectado()]);
  const admin = repo.usuario.roles.includes("admin");

  return (
    <>
      <Encabezado
        acciones={
          <Link href="/app/configuracion/catalogos" className={clasesBoton({ variante: "secundario", tamano: "sm" })}>
            <ListTree /> Catálogos, hitos y términos
          </Link>
        }
        titulo="Configuración"
        descripcion={admin ? "Datos de la empresa, consecutivos, reglas de la Circular 170 y usuarios." : "Solo el Administrador puede cambiar la configuración."}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Tarjeta>
            <TarjetaEncabezado titulo="Empresa" descripcion="Se usa en cotizaciones, PDF y correos" />
            <FormEmpresa empresa={repo.empresa} editable={admin} />
          </Tarjeta>
          <Tarjeta>
            <TarjetaEncabezado titulo="Megafoco" descripcion="Contabilidad y factura electrónica" />
            <FormMegafoco conectado={megafoco} editable={admin} />
          </Tarjeta>
        </div>
        <Tarjeta className="self-start overflow-hidden">
          <TarjetaEncabezado titulo="Usuarios y roles" descripcion="Una persona puede tener varios roles" />
          <GestionUsuarios usuarios={usuarios} yoId={repo.usuario.id} editable={admin} />
        </Tarjeta>
      </div>
    </>
  );
}
