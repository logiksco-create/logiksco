import "server-only";

/** Escapa texto para HTML (todo contenido dinámico pasa por aquí). */
export function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Plantilla HTML de correo con la marca de la empresa. Tablas e inline CSS
 * para que se vea bien en Outlook y Gmail.
 */
export function plantillaCorreo(o: {
  empresa: string;
  color: string;
  titulo: string;
  parrafos: string[];
  boton?: { texto: string; url: string };
  pie?: string;
  /** Logo público (https). Los data: URI se omiten: muchos clientes de correo los bloquean. */
  logoUrl?: string;
}): string {
  const color = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#3b5bfd";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0d1326">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e7ef">
${
  o.logoUrl?.startsWith("https://")
    ? `<tr><td style="background:#ffffff;padding:20px 28px;border-bottom:1px solid #e4e7ef"><img src="${esc(o.logoUrl)}" alt="${esc(o.empresa)}" height="40" style="display:block;height:40px;max-width:200px;border:0"></td></tr>`
    : `<tr><td style="background:#0a0f1f;padding:20px 28px;color:#ffffff;font-size:16px;font-weight:600">${esc(o.empresa)}</td></tr>`
}
<tr><td style="height:3px;background:${color}"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(o.titulo)}</h1>
${o.parrafos.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#33394d">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
${
  o.boton
    ? `<p style="margin:24px 0 8px"><a href="${esc(o.boton.url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px">${esc(o.boton.texto)}</a></p>`
    : ""
}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e4e7ef;font-size:12px;color:#8a92a6">${esc(o.pie ?? `${o.empresa} · Enviado con LOGIKS.CO`)}</td></tr>
</table></td></tr></table></body></html>`;
}
