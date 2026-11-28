#!/usr/bin/env python3
"""Genera un remito (HTML imprimible, con el diseño de la plantilla de MONSTERTRAIL)
por cada venta nueva de Mercado Libre que no va por Mercado Envíos.

Uso:
  python3 mercadolibre_mcp/remito_auto.py          # queda corriendo y revisa cada 5 min
  python3 mercadolibre_mcp/remito_auto.py --una    # una sola pasada y termina

Solo LEE órdenes de ML y ESCRIBE archivos locales en remitos/.
No envía mensajes ni modifica nada en Mercado Libre.
El teléfono no viene por API: queda el campo vacío para completar a mano.
"""
import html
import json
import os
import smtplib
import ssl
import subprocess
import sys
import time
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from server import ROOT, http, seller_id  # noqa: E402

OUT = os.path.join(ROOT, "remitos")
ESTADO = os.path.join(OUT, "generados.json")
CADA_SEG = 300
DIAS_REVISION = 3

EMPRESA_CUIT = "20-39120619-9"
EMPRESA_RAZON = "Razon Social: Andres Jorge Moresco"
EMPRESA_CONTACTO = [
    "+54 9 3412 62-5312",
    "Eva Perón 8520",
    "@monstertrailarg",
    "monstertrailarg.com",
]


def cargar_estado():
    try:
        with open(ESTADO, encoding="utf-8") as f:
            return set(json.load(f))
    except FileNotFoundError:
        return set()


def guardar_estado(s):
    os.makedirs(OUT, exist_ok=True)
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump(sorted(s), f)


def ordenes_recientes(dias):
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    fecha = desde.strftime("%Y-%m-%dT%H:%M:%S.000-00:00")
    out, offset = [], 0
    while True:
        r = http("GET", "/orders/search", params={
            "seller": seller_id(), "order.date_created.from": fecha,
            "sort": "date_desc", "limit": 50, "offset": offset})
        res = r.get("results", [])
        out += res
        offset += len(res)
        if not res or offset >= r.get("paging", {}).get("total", 0):
            break
    return out


def datos_comprador(order_id, buyer):
    nombre, doc = "", ""
    try:
        b = http("GET", f"/orders/{order_id}/billing_info")
        bi = b.get("billing_info", b) if isinstance(b, dict) else {}
        campos = {a.get("type"): a.get("value", "") for a in bi.get("additional_info", [])}
        nombre = (campos.get("FIRST_NAME", "") + " " + campos.get("LAST_NAME", "")).strip()
        doc = f"{campos.get('DOC_TYPE', '')} {campos.get('DOC_NUMBER', '')}".strip()
    except Exception:  # noqa: BLE001 - sin permiso de billing seguimos con lo que hay
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
    obs = ra.get("comment", "")
    texto = ", ".join(p for p in [linea, ciudad, prov] if p)
    return texto + (f" (Obs: {obs})" if obs else "")


def codigo_postal(ra):
    return str((ra or {}).get("zip_code", "") or "")


def fmt_pesos(n):
    return "$ {:,.0f}".format(float(n or 0)).replace(",", ".")


CSS = """
@page { size: A4; margin: 12mm; }
body { font-family: Arial, Helvetica, sans-serif; color:#000; background:#fff; margin:0; }
.hoja { width: 186mm; min-height: 270mm; padding: 6mm 4mm; page-break-after: always; position: relative; box-sizing: border-box; }
.rojo { color:#9E1B1F; }
.cab { display:flex; justify-content:space-between; }
.logo { text-align:center; width: 90mm; }
.logo .marca { font-size: 30px; font-weight: 900; font-style: italic; color:#9E1B1F; letter-spacing: 1px; }
.logo .sub { font-size: 10px; font-weight: 700; color:#9E1B1F; letter-spacing: 2px; }
.logo .fiscal { font-size: 12px; color:#9E1B1F; margin-top: 6px; }
.titulo { text-align:right; }
.titulo h1 { font-size: 40px; font-weight: 400; margin: 6mm 0 2mm; }
.titulo p { font-size: 16px; margin: 3mm 0; }
h2 { font-size: 20px; font-weight: 400; letter-spacing: 3px; margin: 10mm 0 3mm; }
.campos p { font-size: 16px; margin: 2.2mm 0; }
.campos span.lbl { display:inline-block; width: 42mm; }
.campos span.val { border-bottom: 0; }
table.items { width:100%; border-collapse: collapse; margin-top: 8mm; }
table.items th { background:#9E1B1F; color:#fff; font-size: 14px; padding: 3mm 2mm; text-align:center; }
table.items td { border: 1px solid #9E1B1F; height: 9mm; font-size: 12px; padding: 1mm 2mm; }
table.items td.c { text-align:center; }
table.items td.d { text-align:left; }
.tot td { background:#9E1B1F; color:#fff; font-weight:700; font-size: 15px; }
.tot td.num { background:#fff; color:#000; border:1px solid #9E1B1F; text-align:right; }
.pie { position:absolute; left:0; right:0; bottom: 14mm; text-align:center; }
.pie p { color:#9E1B1F; font-size: 14px; margin: 1.5mm 0; }
.barra { position:absolute; left:0; right:0; bottom:0; height: 8mm; background:#9E1B1F; }
"""


def remito_html(o, s, nombre, doc):
    e = html.escape
    fecha = datetime.fromisoformat(o["date_created"].replace("Z", "+00:00")).astimezone()
    fecha_txt = fecha.strftime("%d/%m/%Y")
    transporte = (s.get("shipping_option") or {}).get("name") or "A definir"
    seguimiento = s.get("tracking_number") or ""
    ra = s.get("receiver_address") or {}
    filas = []
    total = 0.0
    for it in o.get("order_items", []):
        item = it.get("item") or {}
        cant = int(it.get("quantity", 1) or 1)
        precio = float(it.get("unit_price", 0) or 0)
        sub = cant * precio
        total += sub
        codigo = item.get("seller_sku") or item.get("id", "")
        filas.append(
            f"<tr><td class='c'>{e(str(codigo))}</td>"
            f"<td class='d'>{e(str(item.get('title', '')))}</td>"
            f"<td class='c'>{cant}</td>"
            f"<td class='c'>{e(fmt_pesos(sub))}</td></tr>")
    for _ in range(max(0, 8 - len(filas))):
        filas.append("<tr><td></td><td></td><td></td><td></td></tr>")
    return f"""
<section class="hoja">
  <div class="cab">
    <div class="logo">
      <div class="marca">MONSTERTRAIL</div>
      <div class="sub">4X4 &nbsp; ACCESSORIES &nbsp; HARDTOPS</div>
      <div class="fiscal">Cuit : {EMPRESA_CUIT}</div>
      <div class="fiscal">{EMPRESA_RAZON}</div>
    </div>
    <div class="titulo">
      <h1>REMITO</h1>
      <p>N°: {e(str(o['id']))}</p>
      <p>Fecha: {e(fecha_txt)}</p>
    </div>
  </div>

  <h2>DATOS DEL CLIENTE:</h2>
  <div class="campos">
    <p><span class="lbl">Nombre:</span> {e(nombre)}</p>
    <p><span class="lbl">DNI:</span> {e(doc)}</p>
    <p><span class="lbl">Telefono:</span> </p>
    <p><span class="lbl">Direccion:</span> {e(direccion(ra))}</p>
    <p><span class="lbl">Codigo postal:</span> {e(codigo_postal(ra))}</p>
    <p><span class="lbl">Transporte:</span> {e(transporte)}</p>
    <p><span class="lbl">Nro de seguimiento:</span> {e(seguimiento)}</p>
  </div>

  <table class="items">
    <thead><tr><th style="width:24%">CODIGO</th><th>DESCRIPCIÓN</th>
      <th style="width:14%">CANTIDAD</th><th style="width:18%">TOTAL</th></tr></thead>
    <tbody>{''.join(filas)}</tbody>
    <tfoot><tr class="tot"><td colspan="3" style="text-align:right;border:none">TOTAL</td>
      <td class="num">{e(fmt_pesos(total))}</td></tr></tfoot>
  </table>

  <div class="pie">
    {''.join(f'<p>{e(c)}</p>' for c in EMPRESA_CONTACTO)}
  </div>
  <div class="barra"></div>
</section>"""


def generar_remito(o, s, nombre, doc):
    os.makedirs(OUT, exist_ok=True)
    ruta = os.path.join(OUT, f"remito_{o['id']}.html")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write("<!doctype html><html><head><meta charset='utf-8'>"
                f"<title>Remito {o['id']}</title><style>{CSS}</style></head><body>")
        f.write(remito_html(o, s, nombre, doc))
        f.write("</body></html>")
    return ruta, html_a_pdf(ruta, o["id"])


CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def html_a_pdf(ruta_html, oid):
    """Convierte el remito a PDF con Chrome en modo headless (no envía nada)."""
    pdf_dir = os.path.join(OUT, "pdf")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf = os.path.join(pdf_dir, f"remito_{oid}.pdf")
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={pdf}", os.path.abspath(ruta_html)],
                   capture_output=True, timeout=120)
    return pdf if os.path.exists(pdf) else None


# ---------- Envío por mail (SMTP con contraseña de aplicación de Gmail) ----------
# Archivo gmail_config.txt en la raíz del proyecto (ignorado por git):
#   GMAIL_USUARIO=monstertrailarg@gmail.com
#   GMAIL_APP_PASSWORD=contraseña-de-aplicacion-de-16-caracteres
ENVIADOS = os.path.join(OUT, "enviados.json")
GMAIL_CFG = os.path.join(ROOT, "gmail_config.txt")
DESTINO_REMITOS = "andimoresco@gmail.com"


def cargar_enviados():
    try:
        with open(ENVIADOS, encoding="utf-8") as f:
            return set(json.load(f))
    except FileNotFoundError:
        # Primera vez: los remitos ya generados se dan por enviados (no reenviar historial).
        return cargar_estado()


def guardar_enviados(s):
    os.makedirs(OUT, exist_ok=True)
    with open(ENVIADOS, "w", encoding="utf-8") as f:
        json.dump(sorted(s), f)


def leer_gmail():
    if not os.path.exists(GMAIL_CFG):
        return None
    d = {}
    with open(GMAIL_CFG, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                d[k.strip()] = v.strip()
    return d


def intentar_envio(oid, pdf, enviados):
    cfg = leer_gmail()
    if not cfg or not pdf or not os.path.exists(pdf):
        return
    msg = EmailMessage()
    msg["From"] = cfg["GMAIL_USUARIO"]
    msg["To"] = DESTINO_REMITOS
    msg["Subject"] = f"Remito orden {oid} - MONSTERTRAIL"
    msg.set_content(f"Te adjunto el remito de la orden {oid}.")
    with open(pdf, "rb") as f:
        msg.add_attachment(f.read(), maintype="application", subtype="pdf",
                           filename=os.path.basename(pdf))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(),
                              timeout=60) as s:
            s.login(cfg["GMAIL_USUARIO"], cfg["GMAIL_APP_PASSWORD"])
            s.send_message(msg)
        enviados.add(oid)
        print(f"[{datetime.now():%H:%M}] Mail enviado: orden {oid}", flush=True)
    except Exception as e:  # noqa: BLE001 - se reintenta en la próxima pasada
        print(f"[{datetime.now():%H:%M}] No se pudo enviar la orden {oid}: {e}", flush=True)


def reintentar_envio(oid, enviados):
    intentar_envio(oid, os.path.join(OUT, "pdf", f"remito_{oid}.pdf"), enviados)


def pasada():
    estado = cargar_estado()
    enviados = cargar_enviados()
    nuevos = 0
    for o in ordenes_recientes(DIAS_REVISION):
        oid = str(o["id"])
        if oid in estado:
            if oid not in enviados:
                reintentar_envio(oid, enviados)
            continue
        if o.get("status") == "cancelled":
            estado.add(oid)
            continue
        sid = (o.get("shipping") or {}).get("id")
        if not sid:
            continue  # todavía sin envío asignado: se reintenta en la próxima pasada
        s = http("GET", f"/shipments/{sid}")
        if s.get("mode") == "me2" or (s.get("logistic") or {}).get("type") == "fulfillment":
            estado.add(oid)  # Mercado Envíos o Full: no hace falta remito propio
            continue
        nombre, doc = datos_comprador(o["id"], o.get("buyer") or {})
        ruta, pdf = generar_remito(o, s, nombre, doc)
        estado.add(oid)
        nuevos += 1
        print(f"[{datetime.now():%H:%M}] Remito nuevo: {ruta} | PDF: {pdf}", flush=True)
        intentar_envio(oid, pdf, enviados)
    guardar_estado(estado)
    guardar_enviados(enviados)
    return nuevos


def main():
    if "--una" in sys.argv:
        print(f"Pasada única. Remitos nuevos: {pasada()}")
        return
    print(f"Vigilando ventas cada {CADA_SEG // 60} min. Ctrl+C para detener.", flush=True)
    while True:
        try:
            pasada()
        except Exception as e:  # noqa: BLE001 - no cortar el bucle por un error puntual
            print(f"[{datetime.now():%H:%M}] Error en la pasada: {e}", flush=True)
        time.sleep(CADA_SEG)


if __name__ == "__main__":
    main()
