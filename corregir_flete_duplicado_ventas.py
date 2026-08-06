# -*- coding: utf-8 -*-
"""
corregir_flete_duplicado_ventas.py
===================================
Arregla el doble descuento del flete en las ventas ya cargadas en Supabase.

EL PROBLEMA
-----------
La tabla `ventas` guarda hoy:

    costo_envio             = 0          <- nunca se escribe
    costo_unitario_proveedor = costo_base <- YA trae el flete sumado adentro
    monto_neto_recibido      = lo que ML liquido (ya con el flete descontado)
    ganancia_real            = monto_neto_recibido - costo_total_proveedor

Como el flete esta adentro de las dos puntas, se resta dos veces y la
ganancia sale mucho mas baja de lo real (ej. una tapa que dejo ~90.000
figura con 9.491).

COMO QUEDA
----------
El flete pasa a ser un campo propio y el costo de proveedor queda solo con
el producto:

    costo_envio              = el flete real que cobro Mercado Libre
                               (venta - comision - neto recibido). Si esa
                               venta todavia no esta liquidada, se usa el
                               flete configurado para la categoria.
    costo_unitario_proveedor = costo_base - flete_configurado
    monto_neto_recibido      = venta - comision - costo_envio
    ganancia_real            = monto_neto_recibido - costo_total + ajuste
    margen_pct               = ganancia / venta * 100   (siempre en %)

Las filas con `editado_manual = true` NO se tocan: si las ajustaste a mano,
mandan tus numeros.

USO
---
    python corregir_flete_duplicado_ventas.py            # simulacion, no escribe
    python corregir_flete_duplicado_ventas.py --aplicar  # escribe en Supabase

Siempre imprime la tabla de antes/despues para revisar antes de aplicar.
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
                   "id,sku,nombre,cantidad,monto_total_venta,monto_neto_recibido,"
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
            saltadas.append((v["nombre"], "editada a mano"))
            continue
        p = prod.get(v["sku"])
        if not p or p["costo_base"] is None:
            saltadas.append((v["nombre"], "sin producto/costo_base en la tabla productos"))
            continue

        envio_cfg = float(envio_por_cat.get(p["categoria"], envio_default))
        cant = float(v["cantidad"] or 1)
        ajuste = float(v["ajuste_monto"] or 0)
        venta = float(v["monto_total_venta"] or 0)
        comision = float(v["comision_ml"] or 0)

        # Flete que Mercado Libre realmente descontó en la liquidación. Si el
        # valor no es confiable (venta sin liquidar, o liquidación cruzada que
        # da negativo) caemos al flete configurado para la categoría.
        flete_real = None
        if v["monto_neto_recibido"] is not None:
            flete_real = round(venta - comision - float(v["monto_neto_recibido"]))
        envio_nuevo = float(flete_real) if (flete_real is not None and flete_real > 0) else envio_cfg

        costo_unit_nuevo = round(float(p["costo_base"]) - envio_cfg)
        costo_total_nuevo = costo_unit_nuevo * cant
        neto_nuevo = round(venta - comision - envio_nuevo, 2)
        ganancia_nueva = round(neto_nuevo - costo_total_nuevo + ajuste, 2)
        margen_nuevo = round(ganancia_nueva / venta * 100, 2) if venta else None

        filas.append({
            "id": v["id"], "nombre": (v["nombre"] or "")[:42], "venta": venta,
            "envio_cfg": envio_cfg, "flete_real": flete_real, "envio_nuevo": envio_nuevo,
            "costo_antes": v["costo_unitario_proveedor"], "costo_nuevo": costo_unit_nuevo,
            "ganancia_antes": v["ganancia_real"], "ganancia_nueva": ganancia_nueva,
            "_upd": {
                "costo_envio": envio_nuevo,
                "costo_unitario_proveedor": costo_unit_nuevo,
                "costo_total_proveedor": costo_total_nuevo,
                "monto_neto_recibido": neto_nuevo,
                "ganancia_real": ganancia_nueva,
                "margen_pct": margen_nuevo,
            },
        })

    if not filas:
        print("No hay ventas para corregir.")
        return

    df = pd.DataFrame(filas)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 200)
    print(df[["nombre", "venta", "envio_cfg", "flete_real", "envio_nuevo",
              "costo_antes", "costo_nuevo", "ganancia_antes", "ganancia_nueva"]].to_string())

    print()
    print(f"ventas a corregir      : {len(df)}")
    print(f"ganancia total ANTES   : {df.ganancia_antes.fillna(0).sum():,.0f}")
    print(f"ganancia total DESPUES : {df.ganancia_nueva.sum():,.0f}")
    print(f"diferencia             : {df.ganancia_nueva.sum() - df.ganancia_antes.fillna(0).sum():,.0f}")
    print(f"ventas en rojo ANTES   : {(df.ganancia_antes.fillna(0) < 0).sum()}")
    print(f"ventas en rojo DESPUES : {(df.ganancia_nueva < 0).sum()}")
    if saltadas:
        print(f"\nsin tocar ({len(saltadas)}):")
        for nombre, motivo in saltadas:
            print(f"  - {(nombre or '')[:50]}: {motivo}")

    if not aplicar:
        print("\n*** SIMULACION -- no se escribio nada. ***")
        print("Para aplicarlo:  python corregir_flete_duplicado_ventas.py --aplicar")
        return

    print("\nAplicando en Supabase...")
    ok = 0
    for f in filas:
        r = requests.patch(f"{url}/rest/v1/ventas?id=eq.{f['id']}", headers=h, json=f["_upd"])
        if r.status_code < 300:
            ok += 1
        else:
            print(f"  ERROR en {f['nombre']}: {r.status_code} {r.text[:120]}")
    print(f"Listo: {ok}/{len(filas)} ventas actualizadas.")


if __name__ == "__main__":
    main()
