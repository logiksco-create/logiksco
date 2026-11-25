import "server-only";

/**
 * TRM del día (RF-03) desde la fuente oficial: Superintendencia Financiera,
 * publicada en datos.gov.co. Se cachea una hora; si la fuente no responde se
 * usa un valor de respaldo y la interfaz lo indica.
 */
export interface TRM {
  valor: number;
  fecha: string; // yyyy-mm-dd
  oficial: boolean;
}

const URL_TRM = "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";
const RESPALDO = Number(process.env.TRM_RESPALDO ?? 4000);

export async function trmDelDia(): Promise<TRM> {
  try {
    const r = await fetch(URL_TRM, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`datos.gov.co ${r.status}`);
    const [d] = (await r.json()) as { valor?: string; vigenciadesde?: string }[];
    const valor = Number(d?.valor);
    if (!Number.isFinite(valor) || valor < 1000 || valor > 20000) throw new Error("TRM fuera de rango");
    return { valor: Math.round(valor * 100) / 100, fecha: String(d.vigenciadesde).slice(0, 10), oficial: true };
  } catch (e) {
    console.error("[trm]", e instanceof Error ? e.message : e);
    return { valor: RESPALDO, fecha: "", oficial: false };
  }
}
