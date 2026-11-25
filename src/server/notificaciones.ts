import "server-only";
import type { Comunicacion } from "@/domain/types";
import type { Repositorio } from "./datos/repositorio";
import { correo, type Adjunto } from "./correo";
import { plantillaCorreo } from "./correo/plantilla";

/**
 * Envía un correo al cliente o proveedor y lo deja en la trazabilidad
 * (RF-38). Si el envío falla, la comunicación se registra igual, sin id del
 * proveedor, para que el equipo vea que no salió.
 */
export async function notificar(
  repo: Repositorio,
  n: {
    entidad: Comunicacion["entidad"];
    entidadId: string;
    para: string[];
    asunto: string;
    titulo: string;
    parrafos: string[];
    boton?: { texto: string; url: string };
    adjuntos?: Adjunto[];
    resumen: string;
  },
): Promise<{ enviado: boolean }> {
  const para = n.para.filter(Boolean);
  let idProveedor: string | undefined;
  if (para.length && correo().activo) {
    try {
      const r = await correo().enviar({
        para,
        asunto: n.asunto,
        nombreRemitente: repo.empresa.razonSocial,
        responderA: repo.usuario.correo || undefined,
        adjuntos: n.adjuntos,
        etiquetas: { empresa: repo.empresa.id, entidad: n.entidad },
        html: plantillaCorreo({
          empresa: repo.empresa.razonSocial,
          color: repo.empresa.colorPrimario,
          logoUrl: repo.empresa.logoUrl,
          titulo: n.titulo,
          parrafos: n.parrafos,
          boton: n.boton,
        }),
      });
      idProveedor = r.id;
    } catch (e) {
      console.error("[correo]", e instanceof Error ? e.message : e);
    }
  }
  await repo.registrarComunicacion({
    entidad: n.entidad,
    entidadId: n.entidadId,
    direccion: "saliente",
    asunto: n.asunto,
    para,
    resumen: n.resumen,
    idProveedor,
  });
  return { enviado: !!idProveedor };
}
