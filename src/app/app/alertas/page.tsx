import { CircleCheck } from "lucide-react";
import { contexto } from "@/server/contexto";
import { cargarAlertas } from "@/server/consultas";
import type { Severidad } from "@/domain/types";
import { Encabezado } from "@/components/app/encabezado";
import { AlertaItem } from "@/components/app/alerta-item";
import { Tarjeta, TarjetaEncabezado, Vacio } from "@/components/ui";

export const metadata = { title: "Alertas" };

const grupos: { s: Severidad; titulo: string; descripcion: string }[] = [
  { s: "alta", titulo: "Prioridad alta", descripcion: "Atiéndelas hoy: afectan dinero o cumplimiento." },
  { s: "media", titulo: "Prioridad media", descripcion: "Seguimiento comercial y operativo." },
  { s: "baja", titulo: "Informativas", descripcion: "Para tener en el radar." },
];

export default async function Alertas() {
  const repo = await contexto();
  const alertas = await cargarAlertas(repo);

  return (
    <>
      <Encabezado
        titulo="Alertas"
        descripcion="Tarifas vencidas frente a la salida, hitos atrasados, cotizaciones y Circular 170 por vencer, cortes de facturación."
      />
      {alertas.length === 0 ? (
        <Tarjeta>
          <Vacio icono={<CircleCheck />} titulo="Todo en orden" descripcion="No hay alertas abiertas." />
        </Tarjeta>
      ) : (
        <div className="space-y-6">
          {grupos.map(({ s, titulo, descripcion }) => {
            const lista = alertas.filter((a) => a.severidad === s);
            if (!lista.length) return null;
            return (
              <Tarjeta key={s}>
                <TarjetaEncabezado titulo={`${titulo} · ${lista.length}`} descripcion={descripcion} />
                <div className="space-y-0.5 px-2 pb-3">
                  {lista.map((a) => (
                    <AlertaItem key={a.id} alerta={a} />
                  ))}
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </>
  );
}
