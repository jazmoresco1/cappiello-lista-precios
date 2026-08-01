# -*- coding: utf-8 -*-
"""
importar_stock_planilla.py
============================
Resetea a 0 el stock por ubicación (Royriff / Depósito) de TODOS los
productos en Supabase, y lo vuelve a cargar leyendo la planilla de stock
de Google Sheets (una pestaña por ubicación).

Requiere haber corrido antes migrar_stock_a_supabase_por_ubicacion.sql
en Supabase (agrega las columnas stock_royriff / stock_deposito).

Uso:
  python importar_stock_planilla.py

La planilla tiene que tener el mismo formato que hoy: una fila de título,
una fila de encabezados (Familia, Código / Descripción, Descripción,
Cantidad, Ubicación, Observaciones), y después filas de categoría (con la
"Familia" cargada, el resto vacío) intercaladas con filas de producto (con
"Código / Descripción" y "Cantidad" cargados).

Solo actualiza los SKU que matchean EXACTO (sin importar mayúsc/minúsc ni
espacios) contra la tabla productos -- los que no matchean quedan
listados al final para que los revises a mano (códigos informales tipo
"Confort"/"Raptor", notas en vez de cantidad, etc.).
"""

import csv
import io
import sys
import requests

from pricing_common import load_supabase_config

SHEET_ID = "1vR0RjkIaArMKRQu56NZsk5o7aZV9qZGc"
PESTAÑAS = [
    ("royriff", None),            # primera pestaña del libro (sin gid)
    ("deposito", "2082911413"),   # "STOCK — DEPÓSITO PLANTA"
]


def descargar_csv(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv"
    if gid:
        url += f"&gid={gid}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


def parsear_planilla(texto_csv):
    """Devuelve [(codigo, cantidad_o_None, descripcion), ...] -- salta filas
    de categoría (Familia con texto) y filas vacías. cantidad_o_None es
    None si la celda no tiene un número entero válido."""
    filas = list(csv.reader(io.StringIO(texto_csv)))
    items = []
    for fila in filas[2:]:  # salta título + encabezado
        fila = fila + [""] * (6 - len(fila))
        familia, codigo, descripcion, cantidad_raw = fila[0], fila[1], fila[2], fila[3]
        codigo = codigo.strip()
        if not codigo:
            continue  # fila de categoría o vacía
        cantidad = None
        try:
            cantidad = int(float(cantidad_raw.strip()))
        except (ValueError, TypeError):
            cantidad = None
        items.append((codigo, cantidad, descripcion.strip()))
    return items


def main():
    sb = load_supabase_config()
    url, key = sb["SUPABASE_URL"], sb["SUPABASE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    print("📡 Trayendo SKUs de Supabase...")
    resp = requests.get(f"{url}/rest/v1/productos", headers=headers, params={"select": "id,sku"}, timeout=30)
    resp.raise_for_status()
    productos = resp.json()
    sku_a_id = {p["sku"].strip().upper(): p["id"] for p in productos}
    print(f"   {len(sku_a_id)} SKU cargados en Supabase")

    print("\n🧹 Reseteando stock_royriff y stock_deposito a 0 en TODOS los productos...")
    resp = requests.patch(
        f"{url}/rest/v1/productos", headers=headers,
        params={"id": "not.is.null"},
        json={"stock_royriff": 0, "stock_deposito": 0}, timeout=60,
    )
    if resp.status_code not in (200, 204):
        print(f"❌ No se pudo resetear el stock: {resp.status_code} {resp.text[:300]}")
        sys.exit(1)
    print("   ✅ Stock reseteado a 0")

    sin_match, sin_cantidad, actualizados = [], [], []

    for ubicacion, gid in PESTAÑAS:
        print(f"\n📄 Leyendo pestaña '{ubicacion}'...")
        texto = descargar_csv(gid)
        items = parsear_planilla(texto)
        print(f"   {len(items)} filas de producto encontradas")

        campo = "stock_royriff" if ubicacion == "royriff" else "stock_deposito"
        acumulado = {}  # id -> cantidad total (por si el mismo sku aparece 2 veces)

        for codigo, cantidad, descripcion in items:
            pid = sku_a_id.get(codigo.strip().upper())
            if not pid:
                sin_match.append((ubicacion, codigo, descripcion))
                continue
            if cantidad is None:
                sin_cantidad.append((ubicacion, codigo, descripcion))
                continue
            acumulado[pid] = acumulado.get(pid, 0) + max(cantidad, 0)

        for pid, cantidad in acumulado.items():
            r = requests.patch(
                f"{url}/rest/v1/productos", headers=headers,
                params={"id": f"eq.{pid}"}, json={campo: cantidad}, timeout=30,
            )
            if r.status_code in (200, 204):
                actualizados.append((ubicacion, pid, cantidad))
            else:
                print(f"   ⚠️  No se pudo actualizar {pid}: {r.status_code} {r.text[:200]}")

    print(f"\n✅ Listo: {len(actualizados)} productos actualizados con stock real.")

    if sin_cantidad:
        print(f"\n⚠️  {len(sin_cantidad)} filas con código pero SIN cantidad numérica válida (quedaron en 0, revisar a mano):")
        for ubic, cod, desc in sin_cantidad:
            print(f"   [{ubic}] {cod} -- {desc}")

    if sin_match:
        print(f"\n⚠️  {len(sin_match)} códigos de la planilla que NO matchean ningún SKU en Supabase:")
        for ubic, cod, desc in sin_match:
            print(f"   [{ubic}] {cod!r} -- {desc}")


if __name__ == "__main__":
    main()
