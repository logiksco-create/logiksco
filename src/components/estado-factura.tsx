import { ESTADOS_FACTURA, type EstadoFactura } from "@/domain/types";
import { Insignia, type Tono } from "./ui";

const tono: Record<EstadoFactura, Tono> = {
  borrador: "neutro",
  aprobada: "info",
  en_cola: "marca",
  enviando: "marca",
  fallida: "peligro",
  estado_desconocido: "alerta",
  revision: "alerta",
  emitida: "exito",
  rechazada: "peligro",
};

/** `prueba`: el «Guardar» del modo prueba deja un borrador en Finppi; nunca se muestra como emitida. */
export function EstadoFacturaBadge({ estado, prueba }: { estado: EstadoFactura; prueba?: boolean }) {
  if (prueba && estado === "emitida") {
    return (
      <Insignia tono="alerta" punto>
        Borrador de prueba
      </Insignia>
    );
  }
  return (
    <Insignia tono={tono[estado]} punto>
      {ESTADOS_FACTURA[estado]}
    </Insignia>
  );
}
