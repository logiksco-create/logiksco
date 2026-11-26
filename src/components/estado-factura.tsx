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

export function EstadoFacturaBadge({ estado }: { estado: EstadoFactura }) {
  return (
    <Insignia tono={tono[estado]} punto>
      {ESTADOS_FACTURA[estado]}
    </Insignia>
  );
}
