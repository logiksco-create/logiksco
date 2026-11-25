import "server-only";

/**
 * Envío de correo transaccional. Con RESEND_API_KEY usa Resend; sin ella
 * no envía nada (la comunicación igual queda en la trazabilidad).
 * Para cambiar de proveedor, implementa `Correo` y cámbialo en `correo()`.
 */
export interface Adjunto {
  nombre: string;
  contenido: Uint8Array;
}

export interface MensajeCorreo {
  para: string[];
  asunto: string;
  html: string;
  /** Nombre visible del remitente (la empresa). */
  nombreRemitente: string;
  responderA?: string;
  adjuntos?: Adjunto[];
  etiquetas?: Record<string, string>;
}

export interface Correo {
  readonly activo: boolean;
  enviar(m: MensajeCorreo): Promise<{ id?: string }>;
}

class Resend implements Correo {
  readonly activo = true;
  constructor(
    private readonly llave: string,
    private readonly remitente: string,
  ) {}

  async enviar(m: MensajeCorreo) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.llave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${m.nombreRemitente.replace(/[<>"]/g, "")} <${this.remitente}>`,
        to: m.para,
        subject: m.asunto,
        html: m.html,
        reply_to: m.responderA,
        attachments: m.adjuntos?.map((a) => ({ filename: a.nombre, content: Buffer.from(a.contenido).toString("base64") })),
        tags: m.etiquetas && Object.entries(m.etiquetas).map(([name, value]) => ({ name, value: value.replace(/[^\w-]/g, "_") })),
      }),
    });
    const d = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!r.ok) throw new Error(`Resend ${r.status}: ${d.message ?? "error"}`);
    return { id: d.id };
  }
}

class SinCorreo implements Correo {
  readonly activo = false;
  async enviar(m: MensajeCorreo) {
    console.info(`[correo] sin proveedor configurado; no se envió «${m.asunto}»`);
    return {};
  }
}

let instancia: Correo | undefined;
export function correo(): Correo {
  if (!instancia) {
    const llave = process.env.RESEND_API_KEY;
    instancia = llave
      ? new Resend(llave, process.env.CORREO_REMITENTE ?? "notificaciones@logiks.co")
      : new SinCorreo();
  }
  return instancia;
}
