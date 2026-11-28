// Función serverless de Vercel: marca una venta como despachada en Mercado Libre
// e informa el código y el link de seguimiento al comprador.
//
// ATENCIÓN: esto cambia el estado real de la orden y le avisa al comprador.
// Solo se llama desde el botón "Avisar despacho" del panel, después de confirmar.
//
// Endpoint: POST /shipments/{id}/seller_notifications (confirmado: responde 405 a GET).
// Cuerpo: basado en la documentación de ME1 (status, tracking_number, tracking_url, payload).
// Si ML rechaza el cuerpo, no cambia nada y devuelve el error.

const API = "https://api.mercadolibre.com";

function supabaseHeaders(extra) {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function leerToken() {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ml_tokens?id=eq.1&select=*`, {
    headers: supabaseHeaders(),
  });
  const rows = await r.json();
  if (!rows.length) throw new Error("Falta la fila de ml_tokens en Supabase");
  return rows[0];
}

async function guardarToken(fila) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/ml_tokens?id=eq.1`, {
    method: "PATCH",
    headers: supabaseHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(fila),
  });
}

async function accessToken() {
  const fila = await leerToken();
  const vence = fila.expires_at ? new Date(fila.expires_at).getTime() : 0;
  if (fila.access_token && Date.now() < vence) return fila.access_token;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.MELI_CLIENT_ID,
    client_secret: process.env.MELI_CLIENT_SECRET,
    refresh_token: fila.refresh_token,
  });
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!r.ok) throw new Error(`ML rechazó la renovación del token (${r.status})`);
  const tok = await r.json();
  await guardarToken({
    refresh_token: tok.refresh_token,
    access_token: tok.access_token,
    expires_at: new Date(Date.now() + (tok.expires_in - 300) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return tok.access_token;
}

async function mlFetch(method, path, body) {
  const token = await accessToken();
  const r = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) throw new Error(`ML respondió ${r.status} en ${path}: ${typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// Marca en Supabase el estado logrado. Solo se llama si ML aceptó el aviso.
async function marcarSupabase(orden, campos) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/despachos_seguimiento?on_conflict=orden_id`, {
    method: "POST",
    headers: supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ orden_id: String(orden), ...campos, updated_at: new Date().toISOString() }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Solo POST" });
    return;
  }
  const origen = req.headers?.origin || "";
  const host = req.headers?.host || "";
  if (origen && !origen.includes(host)) {
    res.status(403).json({ error: "Origen no permitido" });
    return;
  }

  const { orden, codigo, link, estado } = req.body || {};
  const status = estado === "delivered" ? "delivered" : "shipped";
  if (!orden || !/^\d{5,20}$/.test(String(orden))) {
    res.status(400).json({ error: "Número de orden inválido" });
    return;
  }
  if (status === "shipped" && !codigo) {
    res.status(400).json({ error: "Falta el código de seguimiento" });
    return;
  }

  try {
    const orderData = await mlFetch("GET", `/orders/${orden}`);
    const sid = orderData?.shipping?.id;
    if (!sid) throw new Error("La orden no tiene envío asociado");

    const payload = {
      status,
      ...(codigo ? { tracking_number: String(codigo) } : {}),
      ...(link ? { tracking_url: String(link) } : {}),
      payload: {
        service_id: 154,
        comment: "",
        date: new Date().toISOString(),
      },
    };
    const resp = await mlFetch("POST", `/shipments/${sid}/seller_notifications`, payload);
    await marcarSupabase(orden, status === "shipped" ? { despachado: true } : { entregado: true });
    res.status(200).json({ ok: true, respuesta: resp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
