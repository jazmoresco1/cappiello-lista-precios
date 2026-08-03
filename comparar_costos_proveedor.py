# -*- coding: utf-8 -*-
"""
comparar_costos_proveedor.py
=============================
Compara lo que el proveedor (Cappiello) REALMENTE te facturó -- según el
"Informe de Venta Detallado por Productos" que te manda por WhatsApp -- con
el costo que el sistema tiene asumido en Supabase (productos.costo_base),
para detectar productos donde el proveedor te está cobrando distinto de lo
que el sistema cree.

Cómo se compara (no es una resta directa): costo_base en Supabase ya
incluye el costo de envío y el costo operativo que Monster Trail le suma
al precio del proveedor (ver pricing_common.py). Este script le resta esos
dos componentes a costo_base para volver a obtener el "precio real que se
le paga al proveedor" que el sistema tiene asumido, y lo compara contra la
columna "Prec. Neto c/Iva" del informe (el precio que el proveedor
efectivamente facturó), tomando la línea más reciente de cada SKU.

Se usan todas las líneas de compra ("eFactura" Y "Cotizacion" cuentan como
compra real). Las líneas de devolución (Comprobante que empieza con "Dev."
o Cantidad negativa) se listan aparte, no entran en la comparación de
precios.

Uso:
  python comparar_costos_proveedor.py "C:\\ruta\\al\\InfVentasDetallePorProductos.xls"

  Si no pasás una ruta, busca el .xls más reciente que empiece con
  "InfVentasDetallePorProductos" en esta carpeta y en tu carpeta de
  Descargas.

Genera "Comparativa_Costos_Proveedor_AAAAMMDD_HHMM.xlsx" con 3 hojas:
  - Diferencias de precio: un SKU por fila, ordenado por diferencia % (la
    más grande primero).
  - Sin match en Supabase: SKUs facturados que no están en la tabla
    productos (puede ser un código de soporte/kit que no se carga
    individual, o un producto nuevo que falta subir).
  - Devoluciones: líneas de devolución del período, para revisar aparte.
"""

import glob
import os
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

from pricing_common import (
    load_supabase_config,
    fetch_configuracion_precios,
    fetch_config_cuotas_ml,
    config_para_categoria,
)
import requests

COSTO_OPERATIVO_DEFAULT = 2500.0
UMBRAL_ALERTA_PCT = 1.0
# Factor de IVA que el sistema asume para Steel Tiger al armar costo_base
# (ver pricing_common.py) -- se usa para volver costo_base a "neto sin IVA"
# y comparar todo neto vs neto, no con IVA incluido.
FACTOR_IVA_SISTEMA = 1.105

# Para "enganche" y "estribo", costo_base viene con el costo promedio del
# kit (acople/soporte) sumado adentro -- hay que restarlo para comparar el
# producto individual (ver KIT_DEDUCCION en src/data/catalogo.js, misma
# lógica que usa la app para el precio local).
SOPORTES_ESTRIBOS = {
    "SEA157", "SEA161", "SEA155", "SEA160", "SEA156", "SEA159",
    "SEA150", "SEA158", "SEA154", "SEA056", "SEA057", "SEA059",
    "SEA050", "SEA058", "SEA054", "SEA055", "SEA053", "SEA051", "SEA066",
}


def deduccion_kit(sku: str, categoria: str) -> float:
    sku = sku.upper()
    if categoria == "enganche":
        if sku.startswith("SE"):
            return 65238.0  # acoples pesados
        if sku.startswith("E") and not sku.startswith("EAC"):
            return 35095.0  # acoples livianos
        return 0.0
    if categoria == "estribo":
        return 0.0 if sku in SOPORTES_ESTRIBOS else 93954.0
    return 0.0


def encontrar_archivo() -> str:
    """Busca el .xls más reciente de InfVentasDetallePorProductos en esta
    carpeta y en Descargas, si no se pasó una ruta por línea de comandos."""
    carpetas = [".", str(Path.home() / "Downloads")]
    candidatos = []
    for carpeta in carpetas:
        candidatos += glob.glob(os.path.join(carpeta, "InfVentasDetallePorProductos*.xls*"))
    if not candidatos:
        raise FileNotFoundError(
            "No encontré ningún 'InfVentasDetallePorProductos*.xls' en esta carpeta "
            "ni en Descargas. Pasá la ruta como argumento:\n"
            '  python comparar_costos_proveedor.py "C:\\ruta\\al\\archivo.xls"'
        )
    candidatos.sort(key=os.path.getmtime)
    return candidatos[-1]


def cargar_informe(path: str) -> pd.DataFrame:
    """Lee el informe del proveedor. La cabecera real está en la fila 4
    (0-indexed) -- las primeras filas son título/sucursal/fecha."""
    df = pd.read_excel(path, header=None)

    header_row = 4
    for i in range(min(10, len(df))):
        fila = " ".join(str(x) for x in df.iloc[i].values if pd.notna(x))
        if "Producto" in fila and "Cantidad" in fila:
            header_row = i
            break

    df = pd.read_excel(path, header=header_row)
    df.columns = [str(c).strip() for c in df.columns]
    return df


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else encontrar_archivo()
    print(f"📄 Usando: {path}")

    df = cargar_informe(path)
    df = df[df["Producto"].notna()].copy()
    df["Fecha"] = pd.to_datetime(df["Fecha"], errors="coerce")
    df["Cantidad"] = pd.to_numeric(df["Cantidad"], errors="coerce")

    # ── Devoluciones (aparte, no entran en la comparación de precios) ──
    es_devolucion = df["Comprobante"].astype(str).str.startswith("Dev.") | (df["Cantidad"] < 0)
    df_devoluciones = df[es_devolucion][
        ["Fecha", "Comprobante", "Producto", "Nombre Producto", "Cantidad", "Total"]
    ].sort_values("Fecha", ascending=False)

    # ── Compras reales para la comparación de precios: todo lo que no sea
    # devolución cuenta como compra (eFactura Y Cotizacion son compras) ──
    df_fact = df[~es_devolucion].copy()
    if df_fact.empty:
        print("⚠️  No hay ninguna línea de compra en este informe -- nada para comparar.")
        return

    ultimo = (
        df_fact.sort_values("Fecha")
        .groupby("Producto")
        .last()[["Nombre Producto", "Prec. Neto c/Iva", "IVA %", "Fecha"]]
    )
    cantidad_facturas = df_fact.groupby("Producto").size()

    print("📡 Trayendo costo_base y configuración de precios desde Supabase...")
    sb = load_supabase_config()
    supabase_url, supabase_key = sb["SUPABASE_URL"], sb["SUPABASE_KEY"]
    configs_categorias = fetch_configuracion_precios(supabase_url, supabase_key)
    cuotas = fetch_config_cuotas_ml(supabase_url, supabase_key)
    costo_operativo = cuotas.get("costo_operativo", COSTO_OPERATIVO_DEFAULT)

    skus = list(ultimo.index.astype(str))
    resp = requests.get(
        f"{supabase_url}/rest/v1/productos",
        headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
        params={"select": "sku,costo_base,categoria,nombre", "sku": f"in.({','.join(skus)})"},
        timeout=30,
    )
    resp.raise_for_status()
    productos = {p["sku"]: p for p in resp.json()}

    filas_comparacion, filas_sin_match = [], []

    for sku, fila in ultimo.iterrows():
        sku = str(sku)
        p = productos.get(sku)
        # Precio con descuentos ya aplicados, pero SIN IVA -- usa el % de
        # IVA real de esa factura (0% en Cotizacion, 21%/10.5% en eFactura
        # según corresponda), no un valor fijo.
        iva_pct = float(fila["IVA %"]) if pd.notna(fila["IVA %"]) else 0
        real = float(fila["Prec. Neto c/Iva"])
        if iva_pct:
            real = real / (1 + iva_pct / 100)

        if not p:
            filas_sin_match.append({
                "sku": sku,
                "nombre_proveedor": fila["Nombre Producto"],
                "precio_real_facturado": real,
                "fecha_ultima_factura": fila["Fecha"],
                "cantidad_facturas_periodo": int(cantidad_facturas.get(sku, 0)),
            })
            continue

        categoria = p.get("categoria")
        cfg = config_para_categoria(configs_categorias, categoria)
        costo_envio = float(cfg.get("costo_envio", 0) or 0)
        costo_base = float(p.get("costo_base") or 0)
        kit = deduccion_kit(sku, categoria)

        esperado_con_iva = costo_base - costo_envio - costo_operativo - kit
        esperado = esperado_con_iva / FACTOR_IVA_SISTEMA  # vuelve a "neto sin IVA"
        diferencia_pesos = real - esperado
        diferencia_pct = round(diferencia_pesos / esperado * 100, 1) if esperado else None

        filas_comparacion.append({
            "sku": sku,
            "nombre": p.get("nombre") or fila["Nombre Producto"],
            "categoria": categoria,
            "precio_esperado_segun_costo_base": round(esperado),
            "kit_descontado": round(kit) if kit else "",
            "precio_real_ultima_factura": round(real),
            "diferencia_$": round(diferencia_pesos) if diferencia_pct is not None else None,
            "diferencia_%": diferencia_pct,
            "fecha_ultima_factura": fila["Fecha"],
            "cantidad_facturas_periodo": int(cantidad_facturas.get(sku, 0)),
            "revisar": "⚠️ SI" if (diferencia_pct is not None and abs(diferencia_pct) > UMBRAL_ALERTA_PCT) else "",
        })

    df_comparacion = pd.DataFrame(filas_comparacion)
    if not df_comparacion.empty:
        df_comparacion["_abs_pct"] = df_comparacion["diferencia_%"].abs()
        df_comparacion = df_comparacion.sort_values("_abs_pct", ascending=False).drop(columns="_abs_pct")

    df_sin_match = pd.DataFrame(filas_sin_match)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    out_path = f"Comparativa_Costos_Proveedor_{timestamp}.xlsx"
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        df_comparacion.to_excel(writer, sheet_name="Diferencias de precio", index=False)
        df_sin_match.to_excel(writer, sheet_name="Sin match en Supabase", index=False)
        df_devoluciones.to_excel(writer, sheet_name="Devoluciones", index=False)

    alertas = df_comparacion[df_comparacion["revisar"] != ""] if not df_comparacion.empty else df_comparacion
    print(f"\n✅ Listo: {out_path}")
    print(f"   {len(df_comparacion)} SKU comparados, {len(alertas)} con diferencia > {UMBRAL_ALERTA_PCT}% (revisar)")
    print(f"   {len(df_sin_match)} SKU facturados que no están en Supabase")
    print(f"   {len(df_devoluciones)} líneas de devolución en el período")
    if not alertas.empty:
        print("\n⚠️  Diferencias más grandes:")
        print(alertas[["sku", "nombre", "diferencia_$", "diferencia_%"]].head(10).to_string(index=False))


if __name__ == "__main__":
    main()
