// Función serverless de Vercel: lista las ventas de Mercado Libre que no van por Mercado Envíos.
// Solo lectura. Las credenciales vienen de variables de entorno de Vercel, nunca del código.
//
// Variables necesarias en Vercel (Project Settings → Environment Variables):
//   MELI_CLIENT_ID, MELI_CLIENT_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_KEY   (la service role key de Supabase)

const API = "https://api.mercadolibre.com";

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function leerToken() {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/ml_tokens?id=eq.1&select=*`, {
    headers: supabaseHeaders(),
  });
  const rows = await r.json();
  if (!rows.length) throw new Error("Falta la fila de ml_tokens (correr supabase/ml_tokens.sql)");
  return rows[0];
}

async function guardarToken(fila) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/ml_tokens?id=eq.1`, {
    method: "PATCH",
    headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(fila),
  });
}

// Devuelve un access token vigente. ML rota el refresh token en cada renovación,
// así que el nuevo se guarda en Supabase antes de devolver el access token.
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

async function ml(path, params) {
  const token = await accessToken();
  const url = new URL(API + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`ML respondió ${r.status} en ${path}`);
  return r.json();
}

// Nombre y documento desde billing_info (ML lo da si la app tiene permiso).
async function datosComprador(orderId, buyer) {
  let nombre = "";
  let doc = "";
  try {
    const b = await ml(`/orders/${orderId}/billing_info`);
    const bi = b.billing_info || b;
    const campos = Object.fromEntries((bi.additional_info || []).map((a) => [a.type, a.value]));
    nombre = `${campos.FIRST_NAME || ""} ${campos.LAST_NAME || ""}`.trim();
    doc = `${campos.DOC_TYPE || ""} ${campos.DOC_NUMBER || ""}`.trim();
  } catch (e) {
    // Sin permiso para billing: seguimos con los datos básicos del comprador.
  }
  if (!nombre) {
    nombre = `${buyer?.first_name || ""} ${buyer?.last_name || ""}`.trim() || buyer?.nickname || "";
  }
  return { nombre, doc };
}

// Códigos de seguimiento cargados desde el panel (tabla despachos_seguimiento).
async function leerSeguimientos() {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/despachos_seguimiento?select=*`, {
    headers: supabaseHeaders(),
  });
  if (!r.ok) return {};
  const rows = await r.json();
  return Object.fromEntries(rows.map((x) => [x.orden_id, { codigo: x.codigo, link: x.link, transporte: x.transporte }]));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Solo GET" });
    return;
  }
  // Diagnóstico: muestra solo los NOMBRES de las variables que faltan, nunca los valores.
  const faltan = ["MELI_CLIENT_ID", "MELI_CLIENT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    .filter((k) => !process.env[k]);
  if (faltan.length) {
    res.status(500).json({ error: "Faltan variables en Vercel: " + faltan.join(", ") });
    return;
  }

  try {
    const dias = Math.min(parseInt(req.query.dias || "30", 10), 90);
    const me = await ml("/users/me");
    const desde = new Date(Date.now() - dias * 86400000).toISOString().replace("Z", "-00:00");
    const orders = await ml("/orders/search", {
      seller: me.id,
      "order.date_created.from": desde,
      sort: "date_desc",
      limit: 50,
    });

    const seguimientos = await leerSeguimientos();
    const salida = [];
    for (const o of orders.results || []) {
      if (o.status === "cancelled" || !o.shipping?.id) continue;
      const envio = await ml(`/shipments/${o.shipping.id}`);
      if (envio.mode === "me2" || envio.logistic?.type === "fulfillment") continue;
      const comprador = await datosComprador(o.id, o.buyer);
      salida.push({
        orden: o.id,
        fecha: o.date_created,
        comprador: comprador.nombre,
        documento: comprador.doc,
        seguimiento: seguimientos[String(o.id)] || null,
        productos: (o.order_items || []).map((it) => ({
          titulo: it.item?.title,
          sku: it.item?.seller_sku,
          cantidad: it.quantity,
          precio_unitario: it.unit_price,
        })),
        envio: {
          id: envio.id,
          estado: envio.status,
          transporte: envio.shipping_option?.name || null,
          seguimiento: envio.tracking_number || null,
          direccion: envio.receiver_address || null,
        },
      });
    }
    res.status(200).json({ ventas: salida });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
