#!/usr/bin/env python3
"""Servidor MCP de solo lectura para la API de Mercado Libre.

Solo usa la biblioteca estándar (funciona con Python 3.9). Lee las credenciales de
meli_config.txt en la raíz del proyecto (ignorado por git) y renueva el access token
cuando hace falta. No publica, no cambia precios y no responde preguntas.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CFG = os.path.join(ROOT, "meli_config.txt")
API = "https://api.mercadolibre.com"
PROTOCOL = "2024-11-05"
KEYS = ("MELI_CLIENT_ID", "MELI_CLIENT_SECRET", "MELI_REFRESH_TOKEN",
        "MELI_ACCESS_TOKEN", "MELI_TOKEN_EXPIRES_AT")


def read_cfg():
    d = {}
    with open(CFG, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                d[k.strip()] = v.strip()
    return d


def write_cfg(d):
    tmp = CFG + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for k in KEYS:
            if k in d:
                f.write(f"{k}={d[k]}\n")
    os.replace(tmp, CFG)
    os.chmod(CFG, 0o600)


def http(method, path, params=None, form=None, auth=True, retry=True, body=None):
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"Accept": "application/json"}
    data = None
    if form is not None:
        data = form
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if auth:
        headers["Authorization"] = "Bearer " + access_token()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401 and auth and retry:
            # El token venció o fue invalidado: forzar renovación y reintentar una vez.
            invalidar_token()
            return http(method, path, params=params, form=form, auth=auth, retry=False, body=body)
        raise RuntimeError(f"Mercado Libre respondió {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")


def sb_config():
    d = {}
    with open(os.path.join(ROOT, "supabase_config.txt"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                d[k.strip()] = v.strip()
    return d["SUPABASE_URL"], d["SUPABASE_KEY"]


def sb_request(method, query, body=None):
    url, key = sb_config()
    headers = {"apikey": key, "Authorization": "Bearer " + key,
               "Content-Type": "application/json", "Prefer": "return=representation"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url + "/rest/v1/ml_tokens" + query, data=data,
                                 headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        txt = r.read().decode("utf-8")
        return json.loads(txt) if txt else None


def leer_token_sb():
    rows = sb_request("GET", "?id=eq.1&select=*")
    if not rows:
        raise RuntimeError("Falta la fila de ml_tokens en Supabase")
    return rows[0]


def invalidar_token():
    sb_request("PATCH", "?id=eq.1", {"expires_at": "2000-01-01T00:00:00+00:00"})


def refresh_access_token():
    cfg = read_cfg()  # client id y secret siguen en meli_config.txt
    fila = leer_token_sb()
    body = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": cfg["MELI_CLIENT_ID"],
        "client_secret": cfg["MELI_CLIENT_SECRET"],
        "refresh_token": fila["refresh_token"],
    }).encode()
    tok = http("POST", "/oauth/token", form=body, auth=False)
    ahora = datetime.now(timezone.utc)
    sb_request("PATCH", "?id=eq.1", {
        "refresh_token": tok["refresh_token"],
        "access_token": tok["access_token"],
        "expires_at": (ahora + timedelta(seconds=int(tok.get("expires_in", 21600)) - 300)).isoformat(),
        "updated_at": ahora.isoformat(),
    })
    return tok["access_token"]


def access_token():
    fila = leer_token_sb()
    exp = fila.get("expires_at")
    if fila.get("access_token") and exp:
        # Supabase puede devolver fracciones de segundo de 1 o 2 dígitos; Python 3.9 necesita 6.
        import re
        exp = re.sub(r"\.(\d+)", lambda m: "." + m.group(1).ljust(6, "0")[:6], exp.replace("Z", "+00:00"))
        vence = datetime.fromisoformat(exp).timestamp()
        if time.time() < vence:
            return fila["access_token"]
    return refresh_access_token()


_seller = {}


def seller_id():
    if "id" not in _seller:
        _seller["id"] = http("GET", "/users/me")["id"]
    return _seller["id"]


# ---------- Herramientas (solo lectura) ----------

def tool_mi_cuenta(args):
    return http("GET", "/users/me")


def tool_ordenes_recientes(args):
    dias = int(args.get("dias", 7))
    limit = min(int(args.get("limit", 20)), 50)
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    return http("GET", "/orders/search", params={
        "seller": seller_id(),
        "order.date_created.from": desde.strftime("%Y-%m-%dT%H:%M:%S.000-00:00"),
        "sort": "date_desc",
        "limit": limit,
    })


def tool_orden(args):
    return http("GET", f"/orders/{args['order_id']}")


def tool_publicacion(args):
    return http("GET", f"/items/{args['item_id']}")


def tool_mis_publicaciones(args):
    return http("GET", f"/users/{seller_id()}/items/search", params={
        "status": args.get("status", "active"),
        "limit": min(int(args.get("limit", 50)), 100),
    })


def tool_preguntas_sin_responder(args):
    return http("GET", "/questions/search", params={
        "seller_id": seller_id(),
        "status": "UNANSWERED",
        "limit": 50,
    })


# ---------- Escrituras: siempre en dos pasos ----------
# 1) ml_preparar_* solo arma el cambio, lo guarda como pendiente y devuelve un resumen.
# 2) ml_confirmar lo aplica. Claude debe mostrar el resumen a la dueña y llamar a
#    ml_confirmar solo si ella confirma en el chat.

PENDING = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pendientes.json")
PENDING_TTL = 3600


def load_pending():
    try:
        with open(PENDING, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_pending(d):
    with open(PENDING, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)


def new_pending(accion, datos, resumen):
    d = load_pending()
    pid = uuid.uuid4().hex[:8]
    d[pid] = {"accion": accion, "datos": datos, "creado": time.time()}
    save_pending(d)
    return {
        "pendiente_id": pid,
        "resumen": resumen,
        "siguiente_paso": "Mostrale el resumen a la dueña y pedile confirmación. "
                          "Solo si confirma, llamá a ml_confirmar con este pendiente_id.",
    }


def tool_preparar_precio(args):
    item = args["item_id"]
    nuevo = float(args["precio_nuevo"])
    actual = http("GET", f"/items/{item}")
    viejo = float(actual["price"])
    var = (nuevo - viejo) / viejo * 100 if viejo else 0
    resumen = (f"{actual.get('title')} ({item}): precio ${viejo:,.0f} → ${nuevo:,.0f} "
               f"({var:+.1f} %)")
    if nuevo < viejo:
        resumen += " ⚠ BAJA de precio: requiere confirmación explícita de la dueña"
    return new_pending("precio", {"item_id": item, "price": nuevo}, resumen)


def tool_preparar_pausa(args):
    item = args["item_id"]
    actual = http("GET", f"/items/{item}")
    resumen = f"Pausar publicación {item} ({actual.get('title')}), estado actual: {actual.get('status')}"
    return new_pending("pausar", {"item_id": item}, resumen)


def tool_preparar_respuesta(args):
    qid = int(args["question_id"])
    texto = args["texto"]
    q = http("GET", f"/questions/{qid}")
    resumen = f"Responder pregunta {qid} sobre {q.get('item_id')}: «{args['texto']}»"
    return new_pending("respuesta", {"question_id": qid, "text": texto}, resumen)


def tool_preparar_mensaje(args):
    order = http("GET", f"/orders/{args['order_id']}")
    pack = order.get("pack_id") or order["id"]
    buyer = order["buyer"]["id"]
    texto = args["texto"]
    resumen = f"Mensaje post-venta a comprador de la orden {order['id']}: «{texto}»"
    return new_pending("mensaje", {"pack_id": pack, "buyer_id": buyer, "text": texto}, resumen)


def tool_confirmar(args):
    d = load_pending()
    pid = args["pendiente_id"]
    p = d.get(pid)
    if not p:
        raise RuntimeError("Pendiente no encontrado (ya aplicado o inexistente)")
    if time.time() - p["creado"] > PENDING_TTL:
        raise RuntimeError("Pendiente vencido: volvé a prepararlo")
    accion, datos = p["accion"], p["datos"]
    if accion == "precio":
        out = http("PUT", f"/items/{datos['item_id']}", body={"price": datos["price"]})
    elif accion == "pausar":
        out = http("PUT", f"/items/{datos['item_id']}", body={"status": "paused"})
    elif accion == "respuesta":
        out = http("POST", "/answers", body={"question_id": datos["question_id"], "text": datos["text"]})
    elif accion == "mensaje":
        out = http("POST", f"/messages/packs/{datos['pack_id']}/sellers/{seller_id()}",
                   params={"tag": "post_sale"},
                   body={"from": {"user_id": seller_id()}, "to": {"user_id": datos["buyer_id"]},
                         "text": datos["text"]})
    else:
        raise RuntimeError(f"Acción desconocida: {accion}")
    del d[pid]
    save_pending(d)
    return {"aplicado": accion, "respuesta": out}


def tool_cancelar(args):
    d = load_pending()
    if d.pop(args["pendiente_id"], None) is None:
        raise RuntimeError("Pendiente no encontrado")
    save_pending(d)
    return {"cancelado": args["pendiente_id"]}


TOOLS = {
    "ml_mi_cuenta": {
        "description": "Datos de la cuenta de Mercado Libre conectada (nickname, id, sitio).",
        "schema": {"type": "object", "properties": {}},
        "fn": tool_mi_cuenta,
    },
    "ml_ordenes_recientes": {
        "description": "Órdenes de venta de los últimos N días, más recientes primero.",
        "schema": {"type": "object", "properties": {
            "dias": {"type": "integer", "description": "Días hacia atrás (default 7)"},
            "limit": {"type": "integer", "description": "Máximo de órdenes (default 20, tope 50)"},
        }},
        "fn": tool_ordenes_recientes,
    },
    "ml_orden": {
        "description": "Detalle de una orden de venta por su id.",
        "schema": {"type": "object", "properties": {
            "order_id": {"type": "string"}}, "required": ["order_id"]},
        "fn": tool_orden,
    },
    "ml_publicacion": {
        "description": "Detalle de una publicación (precio, stock, estado) por su id, p. ej. MLA123.",
        "schema": {"type": "object", "properties": {
            "item_id": {"type": "string"}}, "required": ["item_id"]},
        "fn": tool_publicacion,
    },
    "ml_mis_publicaciones": {
        "description": "Ids de mis publicaciones filtradas por estado (active, paused, closed).",
        "schema": {"type": "object", "properties": {
            "status": {"type": "string", "description": "active, paused o closed (default active)"},
            "limit": {"type": "integer", "description": "Default 50, tope 100"},
        }},
        "fn": tool_mis_publicaciones,
    },
    "ml_preguntas_sin_responder": {
        "description": "Preguntas de compradores que todavía no tienen respuesta.",
        "schema": {"type": "object", "properties": {}},
        "fn": tool_preguntas_sin_responder,
    },
    "ml_preparar_precio": {
        "description": "ESCRITURA (paso 1): prepara un cambio de precio y muestra el resumen. No lo aplica.",
        "schema": {"type": "object", "properties": {
            "item_id": {"type": "string"},
            "precio_nuevo": {"type": "number"}},
            "required": ["item_id", "precio_nuevo"]},
        "fn": tool_preparar_precio,
    },
    "ml_preparar_pausa": {
        "description": "ESCRITURA (paso 1): prepara la pausa de una publicación. No la aplica.",
        "schema": {"type": "object", "properties": {"item_id": {"type": "string"}},
                   "required": ["item_id"]},
        "fn": tool_preparar_pausa,
    },
    "ml_preparar_respuesta": {
        "description": "ESCRITURA (paso 1): prepara la respuesta a una pregunta. No la envía.",
        "schema": {"type": "object", "properties": {
            "question_id": {"type": "integer"},
            "texto": {"type": "string"}},
            "required": ["question_id", "texto"]},
        "fn": tool_preparar_respuesta,
    },
    "ml_preparar_mensaje": {
        "description": "ESCRITURA (paso 1): prepara un mensaje post-venta a un comprador. No lo envía.",
        "schema": {"type": "object", "properties": {
            "order_id": {"type": "string"},
            "texto": {"type": "string"}},
            "required": ["order_id", "texto"]},
        "fn": tool_preparar_mensaje,
    },
    "ml_confirmar": {
        "description": "ESCRITURA (paso 2): aplica un cambio preparado. Usar SOLO si la dueña confirmó en el chat.",
        "schema": {"type": "object", "properties": {
            "pendiente_id": {"type": "string"}},
            "required": ["pendiente_id"]},
        "fn": tool_confirmar,
    },
    "ml_cancelar": {
        "description": "Descarta un cambio preparado sin aplicarlo.",
        "schema": {"type": "object", "properties": {
            "pendiente_id": {"type": "string"}},
            "required": ["pendiente_id"]},
        "fn": tool_cancelar,
    },
}


# ---------- Protocolo MCP por stdio (JSON-RPC, una línea por mensaje) ----------

def send(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def reply(mid, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": mid}
    if error is not None:
        msg["error"] = error
    else:
        msg["result"] = result
    send(msg)


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        mid = msg.get("id")
        method = msg.get("method")
        params = msg.get("params") or {}
        if mid is None:
            continue  # notificaciones (p. ej. notifications/initialized) no llevan respuesta
        if method == "initialize":
            reply(mid, {
                "protocolVersion": PROTOCOL,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "mercadolibre", "version": "0.1.0"},
            })
        elif method == "ping":
            reply(mid, {})
        elif method == "tools/list":
            reply(mid, {"tools": [
                {"name": n, "description": t["description"], "inputSchema": t["schema"]}
                for n, t in TOOLS.items()
            ]})
        elif method == "tools/call":
            name = params.get("name")
            args = params.get("arguments") or {}
            if name not in TOOLS:
                reply(mid, error={"code": -32602, "message": f"Herramienta desconocida: {name}"})
                continue
            try:
                out = TOOLS[name]["fn"](args)
                text = json.dumps(out, ensure_ascii=False, indent=2)
                reply(mid, {"content": [{"type": "text", "text": text[:50000]}]})
            except Exception as e:  # noqa: BLE001 - devolvemos el error al cliente
                reply(mid, {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True})
        else:
            reply(mid, error={"code": -32601, "message": f"Método no soportado: {method}"})


if __name__ == "__main__":
    main()
