import "server-only";

/**
 * Despierta el bot de facturación electrónica que corre BAJO DEMANDA en
 * GitHub Actions (.github/workflows/bot-finppi.yml). Si no está configurado
 * (o el bot corre en un servidor propio), no hace nada.
 *
 * GITHUB_BOT_TOKEN: token de grano fino con permiso «Actions: lectura y
 *                   escritura» SOLO sobre el repositorio.
 * GITHUB_BOT_REPO:  dueño/repositorio (por defecto logiksco-create/logiksco).
 */
export async function despertarBot(motivo: string): Promise<boolean> {
  const token = process.env.GITHUB_BOT_TOKEN;
  const repo = process.env.GITHUB_BOT_REPO ?? "logiksco-create/logiksco";
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/bot-finppi.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: process.env.GITHUB_BOT_RAMA ?? "main", inputs: { motivo: motivo.slice(0, 60) } }),
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) console.error("[bot] GitHub respondió", r.status);
    return r.ok;
  } catch (e) {
    console.error("[bot] no se pudo despertar:", e instanceof Error ? e.message : e);
    return false;
  }
}
