// Función serverless de Vercel: guarda el código y link de seguimiento de una orden.
// Solo escribe en la tabla despachos_seguimiento de Supabase. No habla con Mercado Libre.
//
// Usa las mismas variables de entorno que ordenes.js: SUPABASE_URL y SUPABASE_SERVICE_KEY.

function supabaseHeaders(extra) {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Solo POST" });
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: "Faltan variables de Supabase en Vercel" });
    return;
  }

  const { orden, codigo, link } = req.body || {};
  if (!orden) {
    res.status(400).json({ error: "Falta el número de orden" });
    return;
  }

  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/despachos_seguimiento?on_conflict=orden_id`, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      orden_id: String(orden),
      codigo: codigo || "",
      link: link || "",
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    res.status(500).json({ error: `Supabase respondió ${r.status}` });
    return;
  }
  res.status(200).json({ ok: true });
}
