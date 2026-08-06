# -*- coding: utf-8 -*-
"""
reparar_neto_recibido_ventas.py
================================
Repara el destrozo que hizo `corregir_flete_duplicado_ventas.py` y deja el
calculo de ganancia bien planteado.

QUE PASO
--------
El script anterior calculaba el flete como:

    flete = monto_total_venta - comision_ml - monto_neto_recibido

y cuando eso daba <= 0 lo descartaba y usaba el flete configurado de la
categoria, PISANDO `monto_neto_recibido` con un valor reconstruido.

Pero ese numero negativo no era un error: en la liquidacion de Mercado Libre
la linea "Envios" es POSITIVA cuando el envio lo pago el cliente (te lo
acreditan), y ademas hay una linea de "Impuestos" (retenciones). Ejemplo
real, venta del 5/8:

    Precio del producto      1.221.176,25
    Cargo por venta total     -331.062,78
    Envios                      +54.450,00   <- lo pago el cliente
    Impuestos                   -19.134,39   <- retenciones
    -------------------------------------
    Total recibido              925.429,08

`venta - comision - neto` da -35.315,61, que no es un flete: es
(envios cobrados al cliente - retenciones) con el signo dado vuelta.

COMO QUEDA
----------
1. `monto_neto_recibido` es LA VERDAD y no se toca nunca mas: es la plata
   que Mercado Libre efectivamente deposito, ya neta de comision, envio
   (en el sentido que sea) e impuestos.

2. La ganancia se calcula contra el costo del producto solo:

       ganancia_real = monto_neto_recibido - costo_total_proveedor

   donde `costo_total_proveedor` NO incluye flete (costo_base - flete
   configurado). Asi el flete se cuenta una sola vez, del lado de ML.

3. `costo_envio` pasa a ser informativo: guarda el neto de todo lo que ML
   sumo o resto ademas de la comision. Positivo = te cobraron envio.
   Negativo = el cliente pago el envio y te quedo a favor.

USO
---
    python reparar_neto_recibido_ventas.py            # simulacion
    python reparar_neto_recibido_ventas.py --aplicar  # escribe
"""

import sys

import pandas as pd
import requests

from pricing_common import load_supabase_config

# Neto real de las 7 ventas cuyo `monto_neto_recibido` fue pisado. Sale de
# la corrida de simulacion previa (ganancia_antes + costo_antes, con
# cantidad 1). El caso de TAPTT1008 del 5/8 esta confirmado contra la
# captura de la liquidacion de Mercado Libre: 925.429,08.
NETO_ORIGINAL = {
    # (sku, fecha ISO hasta el minuto): neto real depositado por ML
    ("EBW000",    "2026-07-17T12:16"): 363893.41,
    ("TAPTT1001", "2026-07-17T01:10"): 934463.09,
    ("TAPTT1003", "2026-07-19T23:13"): 934463.09,
    ("EBW000",    "2026-07-20T16:06"): 491846.28,
    ("TAPTT1008", "2026-08-05T20:36"): 925429.08,
    ("TAPTT1003", "2026-08-05T20:58"): 968866.03,
    ("EBW000",    "2026-08-05T01:08"): 435071.07,
}


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

    filas, restauradas = [], 0
    for _, v in ventas.iterrows():
        if v.get("editado_manual"):
            continue
        p = prod.get(v["sku"])
        if not p or p["costo_base"] is None:
            continue

        venta = float(v["monto_total_venta"] or 0)
        comision = float(v["comision_ml"] or 0)
        cant = float(v["cantidad"] or 1)
        ajuste = float(v["ajuste_monto"] or 0)
        envio_cfg = float(envio_por_cat.get(p["categoria"], envio_default))

        # 1. Neto real: si esta en la tabla de recuperacion, se restaura.
        clave = (v["sku"], str(v["fecha"])[:16])
        neto_actual = float(v["monto_neto_recibido"] or 0)
        neto_real = NETO_ORIGINAL.get(clave, neto_actual)
        if clave in NETO_ORIGINAL and round(neto_real, 2) != round(neto_actual, 2):
            restauradas += 1

        # 2. Costo del producto SIN flete.
        costo_unit = round(float(p["costo_base"]) - envio_cfg)
        costo_total = costo_unit * cant

        # 3. Ganancia contra el neto real. El flete ya esta contemplado
        #    adentro del neto, del lado de Mercado Libre.
        ganancia = round(neto_real - costo_total + ajuste, 2)
        margen = round(ganancia / venta * 100, 2) if venta else None

        # 4. Informativo: todo lo que ML sumo/resto ademas de la comision.
        #    Positivo = te cobraron envio. Negativo = el cliente lo pago.
        otros_cargos = round(venta - comision - neto_real, 2)

        filas.append({
            "id": v["id"], "sku": v["sku"], "fecha": str(v["fecha"])[:16],
            "venta": venta, "neto_antes": neto_actual, "neto_real": neto_real,
            "otros_cargos": otros_cargos,
            "gan_antes": v["ganancia_real"], "gan_nueva": ganancia,
            "restaurada": clave in NETO_ORIGINAL,
            "_upd": {
                "monto_neto_recibido": neto_real,
                "costo_envio": otros_cargos,
                "costo_unitario_proveedor": costo_unit,
                "costo_total_proveedor": costo_total,
                "ganancia_real": ganancia,
                "margen_pct": margen,
            },
        })

    df = pd.DataFrame(filas)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 200)
    print(df[["sku", "fecha", "venta", "neto_antes", "neto_real", "otros_cargos",
              "gan_antes", "gan_nueva", "restaurada"]].to_string())
    print()
    print(f"ventas procesadas        : {len(df)}")
    print(f"netos restaurados        : {restauradas}")
    print(f"ganancia total ANTES     : {df.gan_antes.fillna(0).sum():,.0f}")
    print(f"ganancia total DESPUES   : {df.gan_nueva.sum():,.0f}")
    print(f"ventas en rojo ANTES     : {(df.gan_antes.fillna(0) < 0).sum()}")
    print(f"ventas en rojo DESPUES   : {(df.gan_nueva < 0).sum()}")

    if not aplicar:
        print("\n*** SIMULACION -- no se escribio nada. ***")
        print("Para aplicarlo:  python reparar_neto_recibido_ventas.py --aplicar")
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
