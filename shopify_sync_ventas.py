# -*- coding: utf-8 -*-
"""
shopify_sync_ventas.py
======================
Trae los pedidos de Shopify con el pago APROBADO (displayFinancialStatus = PAID)
y los guarda en la tabla `ventas` de Supabase con canal = 'shopify'
(una fila por producto del pedido).

- Los pedidos pendientes (ej. transferencia sin marcar como pagada), vencidos,
  cancelados o reembolsados NO entran. Si un pedido pendiente se marca como
  pagado en Shopify, entra en la siguiente corrida.
- Es un upsert por (canal, id_externo, sku_ml): correrlo dos veces no duplica.
- Nunca pisa monto_neto_recibido / ganancia_real: esos los completa el cruce
  con el pago de Mercado Pago.

Uso:  python shopify_sync_ventas.py            (guarda)
      python shopify_sync_ventas.py --dry-run  (solo muestra lo que guardaria)
"""

import sys
import requests

import shopify_common as sc

DRY_RUN = "--dry-run" in sys.argv

QUERY = """
query($cursor: String) {
  orders(first: 50, after: $cursor, query: "financial_status:paid", sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      name processedAt createdAt displayFulfillmentStatus
      totalPriceSet { shopMoney { amount } }
      customer { displayName }
      transactions { gateway kind status paymentId }
      lineItems(first: 50) { edges { node {
        name sku quantity
        discountedUnitPriceSet { shopMoney { amount } }
      } } }
    } }
  }
}
"""


def supabase_cfg():
    cfg = {}
    with open("supabase_config.txt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip()
    return cfg["SUPABASE_URL"].rstrip("/"), cfg["SUPABASE_KEY"]


def traer_pedidos_pagados():
    pedidos, cursor = [], None
    while True:
        data = sc.graphql(QUERY, {"cursor": cursor})["orders"]
        pedidos += [e["node"] for e in data["edges"]]
        if not data["pageInfo"]["hasNextPage"]:
            return pedidos
        cursor = data["pageInfo"]["endCursor"]


def construir_filas(pedido, costos):
    items = [e["node"] for e in pedido["lineItems"]["edges"]]
    total_pagado = float(pedido["totalPriceSet"]["shopMoney"]["amount"])
    # Lo que realmente se cobro se reparte entre los productos en proporcion a
    # su precio (con descuentos), asi la suma de las filas = lo cobrado.
    subtotales = [float(i["discountedUnitPriceSet"]["shopMoney"]["amount"]) * i["quantity"] for i in items]
    suma = sum(subtotales) or 1
    pagos = [t for t in pedido["transactions"] if t["status"] == "SUCCESS" and t["kind"] in ("SALE", "CAPTURE")]
    pasarela = pagos[0]["gateway"] if pagos else None
    envio = "shipped" if pedido["displayFulfillmentStatus"] == "FULFILLED" else "not_delivered"

    filas = []
    for item, sub in zip(items, subtotales):
        sku = item["sku"] or item["name"]
        monto = round(total_pagado * sub / suma, 2)
        costo_unit = costos.get(item["sku"])
        fila = {
            "fecha": pedido["processedAt"] or pedido["createdAt"],
            "canal": "shopify",
            "id_externo": pedido["name"],
            "sku_ml": sku,
            "sku": item["sku"],
            "nombre": item["name"],
            "cantidad": item["quantity"],
            "precio_unitario": round(monto / item["quantity"], 2),
            "monto_total_venta": monto,
            "comprador": (pedido["customer"] or {}).get("displayName"),
            "forma_pago": pasarela,
            "estado_orden": "paid",
            "estado_envio": envio,
            "alerta": "Falta cruzar con el pago de Mercado Pago" if costo_unit else "Sin costo cargado para este SKU",
        }
        if costo_unit is not None:
            fila["costo_unitario_proveedor"] = costo_unit
            fila["costo_total_proveedor"] = round(costo_unit * item["quantity"], 2)
        filas.append(fila)
    return filas


def main():
    url, key = supabase_cfg()
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    pedidos = traer_pedidos_pagados()
    print(f"Pedidos pagados en Shopify: {len(pedidos)}")

    skus = sorted({i["node"]["sku"] for p in pedidos for i in p["lineItems"]["edges"] if i["node"]["sku"]})
    costos = {}
    if skus:
        lista = ",".join(skus)
        r = requests.get(f"{url}/rest/v1/productos", headers=h,
                         params={"sku": f"in.({lista})", "select": "sku,costo_base"})
        r.raise_for_status()
        costos = {p["sku"]: p["costo_base"] for p in r.json() if p["costo_base"] is not None}

    for pedido in pedidos:
        for fila in construir_filas(pedido, costos):
            print(f"  {fila['id_externo']}  {fila['sku']}  ${fila['monto_total_venta']:,.0f}  "
                  f"costo={fila.get('costo_unitario_proveedor')}  {fila['comprador']}")
            if DRY_RUN:
                continue
            r = requests.post(f"{url}/rest/v1/ventas", headers={**h, "Prefer": "resolution=merge-duplicates,return=minimal"},
                              params={"on_conflict": "canal,id_externo,sku_ml"}, json=fila)
            if r.status_code >= 300:
                print("   ERROR:", r.status_code, r.text[:300])
                sys.exit(1)
    print("Listo." if not DRY_RUN else "Dry-run: no se guardo nada.")


if __name__ == "__main__":
    main()
