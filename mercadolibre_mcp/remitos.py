#!/usr/bin/env python3
"""Genera remitos (HTML imprimible) para órdenes de Mercado Libre que NO van por Mercado Envíos.

Uso: python3 mercadolibre_mcp/remitos.py [dias]   (default 30)

Los remitos incluyen nombre, documento, dirección, productos y transporte.
El teléfono no viene por API: se deja un campo vacío para completar a mano.
Los archivos se guardan en remitos/ (ignorar en git: contienen datos de compradores).
"""
import html
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from server import ROOT, http, seller_id  # noqa: E402

OUT_DIR = os.path.join(ROOT, "remitos")


def fetch_orders(dias):
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    fecha = desde.strftime("%Y-%m-%dT%H:%M:%S.000-00:00")
    out, offset = [], 0
    while True:
        r = http("GET", "/orders/search", params={
            "seller": seller_id(),
            "order.date_created.from": fecha,
            "sort": "date_desc",
            "limit": 50,
            "offset": offset,
        })
        res = r.get("results", [])
        out += res
        offset += len(res)
        if not res or offset >= r.get("paging", {}).get("total", 0):
            break
    return out


def datos_comprador(order_id, buyer):
    """Nombre y documento desde billing_info. Si la API no los da, usa el nickname."""
    nombre, doc = "", ""
    try:
        b = http("GET", f"/orders/{order_id}/billing_info")
        bi = b.get("billing_info", b) if isinstance(b, dict) else {}
        campos = {a.get("type"): a.get("value", "") for a in bi.get("additional_info", [])}
        nombre = (campos.get("FIRST_NAME", "") + " " + campos.get("LAST_NAME", "")).strip()
        tipo = campos.get("DOC_TYPE", "")
        num = campos.get("DOC_NUMBER", "")
        doc = f"{tipo} {num}".strip()
    except Exception:  # noqa: BLE001 - si no hay permiso para billing, seguimos sin esos datos
        pass
    if not nombre:
        nombre = (buyer.get("first_name", "") + " " + buyer.get("last_name", "")).strip() \
            or buyer.get("nickname", "")
    return nombre, doc


def direccion(ra):
    ra = ra or {}
    linea = ra.get("address_line") or " ".join(
        x for x in [ra.get("street_name", ""), str(ra.get("street_number", ""))] if x)
    ciudad = (ra.get("city") or {}).get("name", "")
    prov = (ra.get("state") or {}).get("name", "")
    cp = ra.get("zip_code", "")
    extra = ra.get("comment", "")
    partes = [linea, ciudad, prov, f"CP {cp}" if cp else "", f"Obs: {extra}" if extra else ""]
    return " · ".join(p for p in partes if p)


def remito_html(o, s, nombre, doc):
    e = html.escape
    items = "".join(
        f"<tr><td>{e(str((it.get('item') or {}).get('title', '')))}</td>"
        f"<td>{e(str((it.get('item') or {}).get('seller_sku') or ''))}</td>"
        f"<td style='text-align:center'>{e(str(it.get('quantity', '')))}</td></tr>"
        for it in o.get("order_items", [])
    )
    transporte = (s.get("shipping_option") or {}).get("name") or "a definir"
    fecha = o.get("date_created", "")[:10]
    return f"""
<section class="remito">
  <h2>Remito · Orden {e(str(o['id']))}</h2>
  <p class="meta">Fecha: {e(fecha)} &nbsp;|&nbsp; Transporte: {e(transporte)}</p>
  <table class="datos">
    <tr><th>Comprador</th><td>{e(nombre)}</td></tr>
    <tr><th>Documento</th><td>{e(doc)}</td></tr>
    <tr><th>Teléfono</th><td class="vacio"></td></tr>
    <tr><th>Dirección de entrega</th><td>{e(direccion(s.get('receiver_address')))}</td></tr>
  </table>
  <table class="items">
    <thead><tr><th>Producto</th><th>SKU</th><th>Cant.</th></tr></thead>
    <tbody>{items}</tbody>
  </table>
  <p class="firma">Entregado por: ____________________ &nbsp; Recibido: ____________________</p>
</section>"""


CSS = """
body{font-family:Arial,sans-serif;font-size:12px;color:#000;margin:20px}
.remito{border:1px solid #000;padding:12px;margin-bottom:18px;page-break-inside:avoid}
.remito h2{font-size:15px;margin:0 0 6px}
.meta{margin:0 0 8px}
table{border-collapse:collapse;width:100%;margin-bottom:8px}
th,td{border:1px solid #888;padding:4px;text-align:left;vertical-align:top}
.datos th{width:160px;background:#f2f2f2}
.items th{background:#f2f2f2}
.vacio{height:18px}
.firma{margin-top:12px}
@media print{.remito{page-break-after:always;border:none}}
"""


def main():
    dias = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    secciones, omitidas = [], 0
    for o in fetch_orders(dias):
        if o.get("status") == "cancelled":
            omitidas += 1
            continue
        sid = (o.get("shipping") or {}).get("id")
        if not sid:
            omitidas += 1
            continue
        s = http("GET", f"/shipments/{sid}")
        if s.get("mode") == "me2" or (s.get("logistic") or {}).get("type") == "fulfillment":
            omitidas += 1  # va por Mercado Envíos o Full: no hace falta remito propio
            continue
        nombre, doc = datos_comprador(o["id"], o.get("buyer") or {})
        secciones.append(remito_html(o, s, nombre, doc))

    os.makedirs(OUT_DIR, exist_ok=True)
    nombre_archivo = f"remitos_{datetime.now().strftime('%Y%m%d_%H%M')}.html"
    ruta = os.path.join(OUT_DIR, nombre_archivo)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("<!doctype html><html><head><meta charset='utf-8'><title>Remitos</title>"
                f"<style>{CSS}</style></head><body>")
        f.write("".join(secciones) if secciones else "<p>No hay órdenes para remitir.</p>")
        f.write("</body></html>")
    print(f"Remitos generados: {len(secciones)} | omitidas (Mercado Envíos, Full, canceladas o sin envío): {omitidas}")
    print(f"Archivo: {ruta}")


if __name__ == "__main__":
    main()
