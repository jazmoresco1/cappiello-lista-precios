# -*- coding: utf-8 -*-
"""
recalcular_ventas_flete_configurado.py
=======================================
Deja la tabla `ventas` con el criterio de Monster Trail:

    ganancia = lo que deposito Mercado Libre
             - costo del producto (sin flete)
             - flete configurado para la familia (editable a mano)

Es decir, `monto_neto_recibido - costo_base`, pero con el flete VISIBLE en
su propia columna en vez de escondido adentro del costo del producto. Ese
era el pedido: poder verlo y corregirlo cuando el envio salio mas caro o
mas barato.

CRITERIO (definido por Marcos)
------------------------------
- `monto_neto_recibido` es LA VERDAD y no se recalcula nunca. Es el unico
  numero de Mercado Libre que importa: la plata que efectivamente entro.
  Lo que ML haya hecho con el envio de su lado (te lo cobro, se lo cobro al
  cliente, te lo acredito) no se mira.
- `costo_envio` es NUESTRO flete presupuestado por familia, que sale de
  `configuracion_precios`. Se resta aparte y se puede editar por venta.
- `costo_unitario_proveedor` es el producto solo: `costo_base - flete`.

Las filas con `editado_manual = true` no se tocan.

USO
---
    python recalcular_ventas_flete_configurado.py            # simulacion
    python recalcular_ventas_flete_configurado.py --aplicar  # escribe
"""

import sys

import pandas as pd
import requests

from pricing_common import load_supabase_config


def traer(url, key, tabla, select, extra=""):
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    r = requests.get(f"{url}/rest/v1/{tabla}?select={select}&limit=5000{extra}", headers=h)
    r.raise_for_status()
    return pd.DataFrame(r.json())


def main():
    aplicar = "--aplicar" in sys.argv
    cfg = load_supabase_config()
    url, key = cfg["SUPABASE_URL"], cfg["SUPABASE_KEY"]
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "Prefer": "return=minimal"}

    ventas = traer(url, key, "ventas",
                   "id,sku,fecha,nombre,cantidad,monto_total_venta,monto_neto_recibido,"
                   "comision_ml,costo_envio,costo_unitario_proveedor,costo_total_proveedor,"
                   "ganancia_real,margen_pct,ajuste_monto,editado_manual",
                   "&canal=eq.mercado_libre")
    productos = traer(url, key, "productos", "sku,categoria,costo_base")
    config = traer(url, key, "configuracion_precios", "categoria,costo_envio")

    envio_por_cat = dict(zip(config.categoria, config.costo_envio.astype(float)))
    envio_default = envio_por_cat.get("default", 20000.0)
    prod = productos.set_index("sku")[["categoria", "costo_base"]].to_dict("index")

    filas, saltadas = [], []
    for _, v in ventas.iterrows():
        if v.get("editado_manual"):
            saltadas.append(((v["nombre"] or "")[:45], "editada a mano"))
            continue
        p = prod.get(v["sku"])
        if not p or p["costo_base"] is None:
            saltadas.append(((v["nombre"] or "")[:45], "sin costo_base en productos"))
            continue
        if v["monto_neto_recibido"] is None:
            saltadas.append(((v["nombre"] or "")[:45], "sin liquidar todavia"))
            continue

        venta = float(v["monto_total_venta"] or 0)
        cant = float(v["cantidad"] or 1)
        ajuste = float(v["ajuste_monto"] or 0)
        neto = float(v["monto_neto_recibido"])
        categoria = p["categoria"]
        envio_unit = float(envio_por_cat.get(categoria, envio_default))

        costo_unit = round(float(p["costo_base"]) - envio_unit)
        costo_total = costo_unit * cant
        envio_total = envio_unit * cant
        ganancia = round(neto - costo_total - envio_total + ajuste, 2)
        margen = round(ganancia / venta * 100, 2) if venta else None

        filas.append({
            "id": v["id"], "sku": v["sku"], "categoria": categoria,
            "fecha": str(v["fecha"])[:10], "venta": venta, "neto": neto,
            "producto": costo_total, "flete": envio_total,
            "gan_antes": v["ganancia_real"], "gan_nueva": ganancia,
            "_upd": {
                "costo_envio": envio_unit,
                "costo_unitario_proveedor": costo_unit,
                "costo_total_proveedor": costo_total,
                "ganancia_real": ganancia,
                "margen_pct": margen,
            },
        })

    df = pd.DataFrame(filas)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 200)
    print(df[["fecha", "sku", "categoria", "venta", "neto", "producto", "flete",
              "gan_antes", "gan_nueva"]].to_string())
    print()
    print(f"ventas recalculadas    : {len(df)}")
    print(f"ganancia ANTES         : {df.gan_antes.fillna(0).sum():,.0f}")
    print(f"ganancia DESPUES       : {df.gan_nueva.sum():,.0f}")
    print(f"flete total presupuestado: {df.flete.sum():,.0f}")
    print(f"ventas en rojo         : {(df.gan_nueva < 0).sum()}")
    if (df.gan_nueva < 0).any():
        print("\nventas que quedan en perdida:")
        print(df[df.gan_nueva < 0][["fecha", "sku", "venta", "neto", "producto",
                                     "flete", "gan_nueva"]].to_string())
    if saltadas:
        print(f"\nsin tocar ({len(saltadas)}):")
        for nombre, motivo in saltadas:
            print(f"  - {nombre}: {motivo}")

    if not aplicar:
        print("\n*** SIMULACION -- no se escribio nada. ***")
        print("Para aplicarlo:  python recalcular_ventas_flete_configurado.py --aplicar")
        return

    print("\nAplicando en Supabase...")
    ok = 0
    for f in filas:
        r = requests.patch(f"{url}/rest/v1/ventas?id=eq.{f['id']}", headers=h, json=f["_upd"])
        if r.status_code < 300:
            ok += 1
        else:
            print(f"  ERROR en {f['sku']}: {r.status_code} {r.text[:120]}")
    print(f"Listo: {ok}/{len(filas)} ventas actualizadas.")


if __name__ == "__main__":
    main()
