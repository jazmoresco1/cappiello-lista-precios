import { useEffect, useState } from "react";

// Panel de despachos: lista las ventas de Mercado Libre sin Mercado Envíos,
// deja imprimir el remito y cargar el código de seguimiento.
// El botón "Avisar despacho" queda deshabilitado hasta verificar el endpoint de ML.

const fmt = (n) => "$ " + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

function remitoHtml(v, seg) {
  const filas = (v.productos || []).map((p) =>
    `<tr><td>${p.sku || ""}</td><td>${p.titulo || ""}</td><td style="text-align:center">${p.cantidad}</td>` +
    `<td style="text-align:right">${fmt(p.precio_unitario * p.cantidad)}</td></tr>`
  ).join("");
  const total = (v.productos || []).reduce((s, p) => s + p.precio_unitario * p.cantidad, 0);
  const dir = v.envio?.direccion;
  const direccion = dir ? [dir.address_line, dir.city?.name, dir.state?.name, dir.comment && `Obs: ${dir.comment}`].filter(Boolean).join(", ") : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Remito ${v.orden}</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;color:#000}
.rojo{color:#9E1B1F}
h1{font-size:34px;font-weight:400;margin:0}
table{width:100%;border-collapse:collapse;margin-top:14px}
th{background:#9E1B1F;color:#fff;padding:6px;font-size:13px}
td{border:1px solid #9E1B1F;padding:6px;font-size:12px}
.tot td{background:#9E1B1F;color:#fff;font-weight:700}
.campos p{margin:6px 0;font-size:14px}
.lbl{display:inline-block;width:160px}
</style></head><body>
<div style="display:flex;justify-content:space-between">
  <div><div class="rojo" style="font-size:26px;font-weight:900;font-style:italic">MONSTERTRAIL</div>
  <div class="rojo" style="font-size:11px;letter-spacing:2px">4X4 ACCESSORIES HARDTOPS</div>
  <div class="rojo" style="font-size:12px;margin-top:6px">Cuit : 20-39120619-9</div>
  <div class="rojo" style="font-size:12px">Razon Social: Andres Jorge Moresco</div></div>
  <div style="text-align:right"><h1>REMITO</h1><p>N°: ${v.orden}</p><p>Fecha: ${new Date(v.fecha).toLocaleDateString("es-AR")}</p></div>
</div>
<h3 style="font-weight:400;letter-spacing:3px;margin-top:24px">DATOS DEL CLIENTE:</h3>
<div class="campos">
  <p><span class="lbl">Nombre:</span> ${v.comprador || ""}</p>
  <p><span class="lbl">DNI:</span> ${v.documento || ""}</p>
  <p><span class="lbl">Telefono:</span> </p>
  <p><span class="lbl">Direccion:</span> ${direccion}</p>
  <p><span class="lbl">Codigo postal:</span> ${dir?.zip_code || ""}</p>
  <p><span class="lbl">Transporte:</span> ${v.envio?.transporte || "A definir"}</p>
  <p><span class="lbl">Nro de seguimiento:</span> ${seg.codigo || ""}</p>
</div>
<table><thead><tr><th>CODIGO</th><th>DESCRIPCIÓN</th><th>CANT.</th><th>TOTAL</th></tr></thead>
<tbody>${filas}</tbody>
<tfoot><tr class="tot"><td colspan="3" style="text-align:right">TOTAL</td><td style="text-align:right">${fmt(total)}</td></tr></tfoot></table>
</body></html>`;
}

export default function DespachosPanel({ onClose }) {
  const [ventas, setVentas] = useState(null);
  const [error, setError] = useState(null);
  const [seguimientos, setSeguimientos] = useState({}); // { [orden]: { codigo, link } }

  useEffect(() => {
    fetch("/api/ml/ordenes?dias=30")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setVentas(d.ventas || []);
        // Cargar los seguimientos ya guardados en Supabase.
        const iniciales = {};
        (d.ventas || []).forEach((v) => { if (v.seguimiento) iniciales[v.orden] = v.seguimiento; });
        setSeguimientos(iniciales);
      })
      .catch((e) => setError(e.message));
  }, []);

  const cambiarSeg = (orden, campo, valor) =>
    setSeguimientos((s) => ({ ...s, [orden]: { ...(s[orden] || {}), [campo]: valor } }));

  // Guarda código y link en Supabase (se llama al salir del campo).
  const guardarSeg = (orden) => {
    const s = seguimientos[orden] || {};
    fetch("/api/ml/seguimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orden, codigo: s.codigo || "", link: s.link || "" }),
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
      .catch(() => alert(`No se pudo guardar el seguimiento de la orden ${orden}.`));
  };

  // Marca el despacho en Mercado Libre y avisa al comprador. Pide confirmación antes.
  const avisar = (orden, estado) => {
    const s = seguimientos[orden] || {};
    if (estado === "shipped" && !s.codigo) {
      alert("Cargá primero el código de seguimiento.");
      return;
    }
    const texto = estado === "shipped"
      ? `¿Avisar el despacho de la orden ${orden} al comprador con el código ${s.codigo}?`
      : `¿Avisar al comprador que la orden ${orden} fue entregada?`;
    if (!window.confirm(texto + "\n\nEsto cambia la orden en Mercado Libre y el comprador recibe el aviso.")) return;
    fetch("/api/ml/despacho", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orden, estado, codigo: s.codigo || "", link: s.link || "" }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        alert(estado === "shipped" ? "Despacho avisado a Mercado Libre." : "Entrega avisada a Mercado Libre.");
      })
      .catch((e) => alert("No se pudo avisar: " + e.message));
  };
  const avisarDespacho = (orden) => avisar(orden, "shipped");
  const avisarEntrega = (orden) => avisar(orden, "delivered");

  const imprimir = (v) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(remitoHtml(v, seguimientos[v.orden] || {}));
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, overflow: "auto" }}>
      <div style={{ background: "#fff", maxWidth: 900, margin: "24px auto", padding: 20, borderRadius: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Despachos (sin Mercado Envíos)</h2>
          <button onClick={onClose}>Cerrar</button>
        </div>

        {error && <p style={{ color: "#9E1B1F" }}>No se pudo cargar: {error}</p>}
        {!ventas && !error && <p>Cargando ventas...</p>}
        {ventas && ventas.length === 0 && <p>No hay ventas pendientes de despacho.</p>}

        {(ventas || []).map((v) => {
          const seg = seguimientos[v.orden] || {};
          return (
            <div key={v.orden} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>Orden {v.orden}</strong>
                <span>{new Date(v.fecha).toLocaleString("es-AR")}</span>
              </div>
              <div>Comprador: {v.comprador}{v.documento ? ` (${v.documento})` : ""} · Transporte: {v.envio?.transporte || "A definir"} · Estado: {v.envio?.estado}</div>
              <ul style={{ margin: "6px 0" }}>
                {(v.productos || []).map((p, i) => (
                  <li key={i}>{p.cantidad} × {p.titulo} ({p.sku || "sin SKU"})</li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input placeholder="Código de seguimiento" value={seg.codigo || ""}
                  onChange={(e) => cambiarSeg(v.orden, "codigo", e.target.value)}
                  onBlur={() => guardarSeg(v.orden)} />
                <input placeholder="Link de seguimiento" value={seg.link || ""} style={{ minWidth: 260 }}
                  onChange={(e) => cambiarSeg(v.orden, "link", e.target.value)}
                  onBlur={() => guardarSeg(v.orden)} />
                <button onClick={() => imprimir(v)}>Imprimir remito</button>
                <button onClick={() => avisarDespacho(v.orden)}
                  title="Marca la venta como despachada en Mercado Libre y avisa al comprador">
                  Avisar despacho
                </button>
                <button onClick={() => avisarEntrega(v.orden)}
                  title="Avisa al comprador que el paquete fue entregado">
                  Avisar entrega
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
