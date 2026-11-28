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

  // Solo se acepta desde la propia app (no desde otros sitios).
  const origen = req.headers?.origin || "";
  const host = req.headers?.host || "";
  if (origen && !origen.includes(host)) {
    res.status(403).json({ error: "Origen no permitido" });
    return;
  }

  const { orden, codigo, link, transporte } = req.body || {};
  if (!orden || !/^\d{5,20}$/.test(String(orden))) {
    res.status(400).json({ error: "Número de orden inválido" });
    return;
  }
  if (String(codigo || "").length > 60) {
    res.status(400).json({ error: "Código demasiado largo" });
    return;
  }
  if (link && (!/^https:\/\//.test(String(link)) || String(link).length > 300)) {
    res.status(400).json({ error: "El link tiene que empezar con https:// y tener menos de 300 caracteres" });
    return;
  }

  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/despachos_seguimiento?on_conflict=orden_id`, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      orden_id: String(orden),
      codigo: codigo || "",
      link: link || "",
      transporte: String(transporte || "").slice(0, 60),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) {
    res.status(500).json({ error: `Supabase respondió ${r.status}` });
    return;
  }
  res.status(200).json({ ok: true });
}
