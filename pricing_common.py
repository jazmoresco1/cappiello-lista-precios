# -*- coding: utf-8 -*-
"""
pricing_common.py
==================
Modulo COMPARTIDO para todos los scripts pricing_*.py de Monster Trail.

Acá vive UNA sola vez todo lo que antes estaba copiado y pegado en cada
script de proveedor (pricing_steel.py, pricing_kraken.py, etc.):

  - Autenticarse con Google Drive (cuenta de servicio)
  - Bajar y leer archivos Excel o PDF de una carpeta de Drive
  - Traer la configuración de márgenes desde Supabase (tabla
    configuracion_precios y config_cuotas_ml) -> así no hace falta
    tipear el margen a mano cada vez
  - Calcular precio_ml y precio_local con la MISMA formula que veníamos
    usando en el workflow de n8n (IVA, comisión ML, costos financieros,
    IVA sobre la rentabilidad, redondeo "lindo")
  - Subir (upsert) los resultados a la tabla productos de Supabase
  - Exportar un Excel de respaldo con el detalle de la corrida

Los scripts de cada proveedor (pricing_dp20.py, pricing_titanium.py,
pricing_coversax.py, etc.) importan estas funciones y solo definen lo que
es propio de ese proveedor: el folder_id de Drive, el nombre/categoria,
y poco más.
"""

import io
import os
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional

import pandas as pd
import numpy as np
import requests

try:
    from googleapiclient.discovery import build
    from google.oauth2 import service_account
    from googleapiclient.http import MediaIoBaseDownload
    DRIVE_AVAILABLE = True
except ImportError:
    DRIVE_AVAILABLE = False

try:
    import pdfplumber
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False


# ─────────────────────────────────────────────────────────────────────────
#  CONFIGURACION (Supabase + Drive)
# ─────────────────────────────────────────────────────────────────────────

def load_supabase_config(path: str = "supabase_config.txt") -> Dict[str, str]:
    """Lee supabase_config.txt (mismo estilo que drive_config.txt) y devuelve
    un dict con SUPABASE_URL y SUPABASE_KEY.

    Si el archivo no existe, tira un error claro en vez de fallar raro
    mas adelante.
    """
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"No encontre '{path}'. Creá ese archivo al lado del script con:\n"
            f"SUPABASE_URL=https://tu-proyecto.supabase.co\n"
            f"SUPABASE_KEY=tu_service_role_key"
        )

    config = {}
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            config[key.strip()] = value.strip()

    if "SUPABASE_URL" not in config or "SUPABASE_KEY" not in config:
        raise ValueError(f"'{path}' tiene que tener SUPABASE_URL y SUPABASE_KEY")

    return config


def _supabase_headers(key: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def fetch_configuracion_precios(supabase_url: str, supabase_key: str,
                                 proveedor: Optional[str] = None) -> List[Dict]:
    """Trae las filas de configuracion_precios (margenes por categoria)."""
    url = f"{supabase_url}/rest/v1/configuracion_precios"
    params = {}
    if proveedor:
        params["proveedor"] = f"eq.{proveedor}"
    resp = requests.get(url, headers=_supabase_headers(supabase_key), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_config_cuotas_ml(supabase_url: str, supabase_key: str) -> Dict[str, float]:
    """Trae config_cuotas_ml y la convierte a dict {clave: valor}."""
    url = f"{supabase_url}/rest/v1/config_cuotas_ml"
    resp = requests.get(url, headers=_supabase_headers(supabase_key), timeout=30)
    resp.raise_for_status()
    filas = resp.json()
    return {f["clave"]: float(f["valor"]) for f in filas}


DEFAULT_CATEGORIA_CONFIG = {
    "tipo_ml": "porcentaje",
    "valor_ml": 0.15,
    "margen_local_pct": 30,
    "comision_ml_pct": 0.145,
    "costo_envio": 20000,
}


def config_para_categoria(configs: List[Dict], categoria: str) -> Dict:
    """Busca la config de una categoria puntual; si no existe, usa la fila
    'default' de Supabase; si tampoco existe esa, usa un default fijo local.
    (Misma logica que la funcion configPara() del workflow de n8n.)
    """
    for c in configs:
        if c.get("categoria") == categoria:
            return c
    for c in configs:
        if c.get("categoria") == "default":
            return c
    return DEFAULT_CATEGORIA_CONFIG


# ─────────────────────────────────────────────────────────────────────────
#  CALCULO DE PRECIOS (misma formula que calcular_precios_unificado.js)
# ─────────────────────────────────────────────────────────────────────────

# IVA sobre el COSTO neto que nos cobra el proveedor. La mayoría de los
# proveedores facturan con 10.5%; DP-20 y Coversax facturan con el 21%
# completo (se lo pasamos distinto desde pricing_todo.py con factor_iva=1.21).
FACTOR_IVA_10_5 = 1.105
FACTOR_IVA_21 = 1.21
FACTOR_IVA = FACTOR_IVA_10_5  # default / retrocompatibilidad

# Este otro IVA es distinto: es el IVA sobre la GANANCIA/rentabilidad
# (21%), no sobre el costo. Se aplica igual para todos los proveedores.
IVA_SOBRE_RENTABILIDAD = 0.21

# % que se le suma al precio real de venta para armar un "precio de lista"
# más alto, y así poder publicar en ML con descuento (el precio con el
# descuento aplicado aterriza en el precio real que queremos cobrar).
PORCENTAJE_PROMO = 0.15


def round_price(precio: float) -> int:
    """Redondea a precios 'lindos' terminados en 90/900/9000, etc."""
    if precio <= 0:
        return 0
    if precio < 20000:
        return int(round(precio / 500) * 500 - 10)
    elif precio < 100000:
        return int(round(precio / 1000) * 1000 - 100)
    else:
        return int(round(precio / 5000) * 5000 - 1000)


def calcular_precio_producto(precio_neto: float, categoria: str,
                              configs_categorias: List[Dict],
                              cuotas: Dict[str, float],
                              factor_iva: float = FACTOR_IVA_10_5) -> Tuple[int, int, int]:
    """Calcula (costo_base, precio_ml, precio_local) para UN producto,
    igual que hacia el nodo 'Calcular Precios' en n8n.

    precio_ml usa la cuota de 3 pagos como referencia (igual que el
    workflow original).

    factor_iva: 1.105 (10.5%, default) o 1.21 (21%, ej. DP-20/Coversax).
    """
    cfg = config_para_categoria(configs_categorias, categoria)

    costos_financieros_venta = cuotas.get("costos_financieros_venta", 0.05)
    costo_operativo = cuotas.get("costo_operativo", 2500)
    costo_cuota_3 = cuotas.get("3_cuotas", 0.084)

    precio_real_pagar = precio_neto * factor_iva
    costo_envio = float(cfg.get("costo_envio", 20000) or 0)
    costo_base_total = precio_real_pagar + costo_envio + costo_operativo
    comision_ml = float(cfg.get("comision_ml_pct", 0.145) or 0.145)

    tipo_ml = cfg.get("tipo_ml", "porcentaje")
    precio_ml = 0.0

    if tipo_ml == "porcentaje":
        margen = float(cfg.get("valor_ml", 0.15))
        denominador = (1 - margen - comision_ml - costo_cuota_3
                        - costos_financieros_venta - (margen * IVA_SOBRE_RENTABILIDAD))
        if denominador > 0:
            precio_ml = costo_base_total / denominador
    else:  # 'pesos'
        ganancia_fija = float(cfg.get("valor_ml", 50000))
        iva_sobre_ganancia = ganancia_fija * IVA_SOBRE_RENTABILIDAD
        precio_objetivo = costo_base_total + ganancia_fija + iva_sobre_ganancia
        denominador = 1 - comision_ml - costo_cuota_3 - costos_financieros_venta
        if denominador > 0:
            precio_ml = precio_objetivo / denominador

    precio_ml_redondeado = round_price(precio_ml) if precio_ml > 0 else 0

    margen_local_pct = float(cfg.get("margen_local_pct", 30) or 30)
    precio_local = round_price(precio_real_pagar * (1 + margen_local_pct / 100))

    return int(round(costo_base_total)), precio_ml_redondeado, precio_local


def calcular_pricing_dataframe(df: pd.DataFrame, proveedor: str,
                                configs_categorias: List[Dict],
                                cuotas: Dict[str, float],
                                factor_iva: float = FACTOR_IVA_10_5) -> pd.DataFrame:
    """Toma un DataFrame con columnas CODIGO/DESCRIPCION/PRECIO_NETO/CATEGORIA
    /ARCHIVO_ORIGEN y devuelve un DataFrame listo para subir a Supabase
    (una fila por producto, con costo_base/precio_ml/precio_local).

    factor_iva: 1.105 (10.5%, default) o 1.21 (21%, ej. DP-20/Coversax)."""
    filas = []
    for _, row in df.iterrows():
        codigo = str(row["CODIGO"]).strip()
        descripcion = str(row["DESCRIPCION"]).strip()
        precio_neto = float(row["PRECIO_NETO"])
        categoria = row.get("CATEGORIA", "default")
        archivo = row.get("ARCHIVO_ORIGEN", "")

        if not codigo or not descripcion or precio_neto <= 0:
            continue

        # Si el archivo traia 2 columnas de precio, ya se uso la que viene
        # con IVA incluido -- no hay que sumarle el factor_iva de nuevo.
        iva_incluido = bool(row.get("IVA_INCLUIDO", False))
        factor_iva_efectivo = 1.0 if iva_incluido else factor_iva

        costo_base, precio_ml, precio_local = calcular_precio_producto(
            precio_neto, categoria, configs_categorias, cuotas, factor_iva=factor_iva_efectivo
        )

        filas.append({
            "sku": codigo,
            "nombre": descripcion,
            "costo_base": costo_base,
            "precio_ml": precio_ml,
            "precio_local": precio_local,
            "proveedor": proveedor,
            "categoria": categoria,
            "origen": "cappiello",
            "archivo_origen": archivo,
        })

    return pd.DataFrame(filas)


# ─────────────────────────────────────────────────────────────────────────
#  SUBIDA A SUPABASE (upsert por sku)
# ─────────────────────────────────────────────────────────────────────────

def upload_a_supabase(df_pricing: pd.DataFrame, supabase_url: str, supabase_key: str,
                       batch_size: int = 300) -> int:
    """Sube (upsert) las filas de df_pricing a la tabla productos.
    Usa on_conflict=sku + Prefer: resolution=merge-duplicates, igual que
    hacia el nodo 'Guardar en Supabase' en n8n. Devuelve cuantas filas
    se subieron con exito.
    """
    if df_pricing.empty:
        return 0

    # Postgres rechaza el batch entero si el MISMO sku aparece 2+ veces en
    # el mismo INSERT (error 21000: "ON CONFLICT DO UPDATE command cannot
    # affect row a second time"). Si dos proveedores/archivos comparten un
    # sku, nos quedamos con la ULTIMA aparición y avisamos cuáles fueron.
    if df_pricing["sku"].duplicated().any():
        duplicados = sorted(df_pricing.loc[df_pricing["sku"].duplicated(keep=False), "sku"].unique())
        print(f"⚠️  {len(duplicados)} sku duplicados (se sube solo la última aparición de cada uno): "
              f"{duplicados[:15]}{' ...' if len(duplicados) > 15 else ''}")
        df_pricing = df_pricing.drop_duplicates(subset="sku", keep="last")

    url = f"{supabase_url}/rest/v1/productos"
    headers = _supabase_headers(supabase_key, {"Prefer": "resolution=merge-duplicates"})
    params = {"on_conflict": "sku"}

    registros = df_pricing.to_dict(orient="records")
    subidos = 0

    for i in range(0, len(registros), batch_size):
        lote = registros[i:i + batch_size]
        resp = requests.post(url, headers=headers, params=params, json=lote, timeout=60)
        if resp.status_code in (200, 201, 204):
            subidos += len(lote)
            print(f"   ✅ Lote {i // batch_size + 1}: {len(lote)} productos subidos a Supabase")
        else:
            print(f"   ❌ Error subiendo lote {i // batch_size + 1}: "
                  f"{resp.status_code} - {resp.text[:300]}")

    return subidos


# ─────────────────────────────────────────────────────────────────────────
#  GOOGLE DRIVE: autenticacion, listado y parseo de archivos
# ─────────────────────────────────────────────────────────────────────────

def authenticate_drive(credentials_file: str = "service_account_credentials.json"):
    """Devuelve un cliente de la API de Google Drive autenticado con la
    cuenta de servicio, o None si falla."""
    if not DRIVE_AVAILABLE:
        print("❌ Falta instalar: pip install google-api-python-client google-auth")
        return None
    try:
        credentials = service_account.Credentials.from_service_account_file(
            credentials_file,
            scopes=["https://www.googleapis.com/auth/drive.readonly"],
        )
        return build("drive", "v3", credentials=credentials)
    except Exception as e:
        print(f"❌ Error conectando a Drive: {e}")
        return None


def listar_archivos_carpeta(service, folder_id: str) -> List[Dict]:
    """Lista los archivos Excel y PDF (no carpetas) dentro de una carpeta."""
    query = (f"'{folder_id}' in parents and trashed=false and "
             f"(name contains '.xlsx' or name contains '.xls' or name contains '.pdf')")
    resultados = service.files().list(q=query, fields="files(id, name, mimeType)").execute()
    return resultados.get("files", [])


def _detectar_columnas(df: pd.DataFrame, start_row: int) -> Tuple[int, int, int]:
    """Detecta automaticamente en que columnas estan codigo/descripcion/precio."""
    sample_rows = min(5, len(df) - start_row)

    for col_offset in range(min(3, len(df.columns))):
        codigo_col = col_offset
        desc_col = col_offset + 1
        precio_col = col_offset + 2

        if precio_col >= len(df.columns):
            continue

        validas = 0
        for i in range(start_row, start_row + sample_rows):
            if i >= len(df):
                break
            row = df.iloc[i]
            codigo = row.iloc[codigo_col] if codigo_col < len(row) and pd.notna(row.iloc[codigo_col]) else None
            precio = row.iloc[precio_col] if precio_col < len(row) and pd.notna(row.iloc[precio_col]) else None
            if codigo and precio:
                precio_num = _parsear_precio_ar(precio)
                if precio_num is not None and precio_num > 0 and str(codigo).strip() != "":
                    validas += 1

        if validas >= min(3, sample_rows):
            return codigo_col, desc_col, precio_col

    return 1, 2, 3


def _detectar_segunda_columna_precio(df: pd.DataFrame, start_row: int, precio_col: int) -> Optional[int]:
    """Busca una columna extra justo despues de precio_col que TAMBIEN
    tenga numeros validos en las mismas filas de muestra -- eso indica que
    el archivo trae 2 precios (neto y con IVA), no 1 solo.

    Confirmado con Marcos: cuando el archivo trae 2 columnas de precio, la
    SEGUNDA ya viene con el 21% de IVA incluido (la primera es el neto, no
    se usa). Cuando trae 1 sola columna, esa es el precio neto de siempre
    -- el sistema le sigue sumando el 10.5%/21% con factor_iva, como antes.
    """
    candidata = precio_col + 1
    if candidata >= len(df.columns):
        return None

    sample_rows = min(5, len(df) - start_row)
    validas = 0
    for i in range(start_row, start_row + sample_rows):
        if i >= len(df):
            break
        row = df.iloc[i]
        val = row.iloc[candidata] if candidata < len(row) and pd.notna(row.iloc[candidata]) else None
        if val is not None:
            val_num = _parsear_precio_ar(val)
            if val_num is not None and val_num > 0:
                validas += 1

    return candidata if validas >= min(3, sample_rows) else None


def _elegir_precio_con_iva(row: pd.Series, precio_col: int, precio_iva_col: Optional[int]) -> Tuple[Optional[float], bool]:
    """Devuelve (precio, iva_incluido) para esta fila.

    Si hay 2da columna de precio, se usa ESA (ya viene con IVA -> iva_incluido=True,
    el sistema NO le suma factor_iva de nuevo). Si no hay 2da columna, se usa
    la unica columna (precio neto de siempre -> iva_incluido=False, el
    sistema le suma 10.5%/21% como ya venia haciendo)."""
    if precio_iva_col is not None and precio_iva_col < len(row) and pd.notna(row.iloc[precio_iva_col]):
        return row.iloc[precio_iva_col], True
    if precio_col < len(row) and pd.notna(row.iloc[precio_col]):
        return row.iloc[precio_col], False
    return None, False


def _parsear_precio_ar(valor) -> Optional[float]:
    """Convierte un precio a float entendiendo el formato argentino de
    miles/decimales (punto = separador de miles, coma = separador decimal).
    Entiende TANTO el formato argentino ('299.524,20' -> punto=miles,
    coma=decimales) COMO el formato tipo USA que a veces traen algunos
    proveedores ('227,847.00' -> coma=miles, punto=decimales). Tambien
    numeros sin separador de miles ('150000') y con un solo separador de
    miles sin decimales ('45.000' -> 45000, no 45,0).

    Regla: si aparecen coma Y punto juntos, el que esté MAS A LA DERECHA
    es el separador decimal (asi es como funciona en cualquier idioma).
    Si aparece uno solo de los dos: si tiene exactamente 2 digitos
    despues (son centavos) se toma como decimal, sino se toma como
    separador de miles.

    Si ya viene como numero (celda de Excel numerica), se devuelve tal
    cual. Antes se usaba re.sub(r"[^0-9]", "", texto) para "limpiar" el
    precio, pero eso borraba el punto Y la coma -- "299.524,20" quedaba
    "29952420" (multiplicado por ~100). Esta funcion respeta esos
    separadores."""
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)

    s = str(valor).strip()
    s = re.sub(r"[^0-9.,]", "", s)
    if not s:
        return None

    tiene_coma = "," in s
    tiene_punto = "." in s

    if tiene_coma and tiene_punto:
        if s.rfind(",") > s.rfind("."):
            # la coma es la mas a la derecha -> es el decimal (formato AR)
            s = s.replace(".", "").replace(",", ".")
        else:
            # el punto es el mas a la derecha -> es el decimal (formato USA)
            s = s.replace(",", "")
    elif tiene_coma:
        partes = s.split(",")
        if len(partes) == 2 and len(partes[1]) == 2:
            s = s.replace(",", ".")  # una sola coma con 2 digitos -> decimal
        else:
            s = s.replace(",", "")   # varias comas o no son centavos -> miles
    elif tiene_punto:
        partes = s.split(".")
        if len(partes) == 2 and len(partes[1]) == 2:
            pass  # un solo punto con 2 digitos -> decimal, ya esta bien
        else:
            s = s.replace(".", "")  # varios puntos o no son centavos -> miles

    try:
        return float(s)
    except ValueError:
        return None


def descargar_bytes(service, file_id: str) -> io.BytesIO:
    request = service.files().get_media(fileId=file_id)
    file_io = io.BytesIO()
    downloader = MediaIoBaseDownload(file_io, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    file_io.seek(0)
    return file_io


def parsear_excel(service, file_id: str, filename: str, categoria: str,
                   usar_segunda_columna: bool = True) -> pd.DataFrame:
    """Baja y parsea un Excel de precios, devuelve CODIGO/DESCRIPCION/PRECIO_NETO.

    usar_segunda_columna: si es False, ignora cualquier segunda columna de
    precio que se detecte y siempre usa la primera (el neto), aplicando
    despues el factor_iva normal. Sirve para categorias puntuales donde NO
    queremos confiar en la columna "con IVA" del archivo (ej. Kraken
    tapa_rigida/lona, que factura con 10,5% y no con 21%)."""
    try:
        file_io = descargar_bytes(service, file_id)
        df = pd.read_excel(file_io, header=None)

        start_row = 0
        for i in range(min(10, len(df))):
            row_str = " ".join(str(x) for x in df.iloc[i].values if pd.notna(x)).upper()
            if "CODIGO" in row_str and ("VENTA" in row_str or "DESCRIPCION" in row_str):
                start_row = i + 1
                break
        if start_row == 0:
            start_row = 4

        codigo_col, desc_col, precio_col = _detectar_columnas(df, start_row)
        precio_iva_col = (_detectar_segunda_columna_precio(df, start_row, precio_col)
                           if usar_segunda_columna else None)

        productos = []
        for i in range(start_row, len(df)):
            row = df.iloc[i]
            if len(row) > max(codigo_col, desc_col, precio_col):
                codigo = row.iloc[codigo_col] if pd.notna(row.iloc[codigo_col]) else None
                descripcion = row.iloc[desc_col] if pd.notna(row.iloc[desc_col]) else None
                precio, iva_incluido = _elegir_precio_con_iva(row, precio_col, precio_iva_col)
                if codigo and descripcion and precio and str(codigo).strip() and str(descripcion).strip():
                    try:
                        precio_num = _parsear_precio_ar(precio)
                        if precio_num and precio_num > 0:
                            productos.append({
                                "CODIGO": str(codigo).strip(),
                                "DESCRIPCION": str(descripcion).strip(),
                                "PRECIO_NETO": precio_num,
                                "IVA_INCLUIDO": iva_incluido,
                            })
                    except Exception:
                        continue

        if not productos:
            return pd.DataFrame()

        df_clean = pd.DataFrame(productos)
        df_clean["CATEGORIA"] = categoria
        df_clean["ARCHIVO_ORIGEN"] = filename
        tipo_precio = "2 columnas (neto + IVA)" if precio_iva_col is not None else "1 columna (neto)"
        print(f"✅ {filename}: {len(df_clean)} productos (Excel, {tipo_precio})")
        return df_clean

    except Exception as e:
        print(f"❌ Error procesando Excel {filename}: {e}")
        return pd.DataFrame()


def parsear_pdf(service, file_id: str, filename: str, categoria: str,
                 usar_segunda_columna: bool = True) -> pd.DataFrame:
    """Baja y parsea un PDF de precios. Intenta primero extraer tablas;
    si no encuentra nada, cae a parsear el texto linea por linea
    (misma logica de dos intentos que pricing_truckman.py).

    usar_segunda_columna: ver docstring de parsear_excel."""
    if not PDF_AVAILABLE:
        print("❌ Falta instalar: pip install pdfplumber")
        return pd.DataFrame()

    try:
        file_io = descargar_bytes(service, file_id)
        productos = []

        with pdfplumber.open(file_io) as pdf:
            # Intento 1: tablas
            for page in pdf.pages:
                tables = page.extract_tables()
                if not tables:
                    continue
                for table in tables:
                    try:
                        df_table = pd.DataFrame(table)
                    except Exception:
                        continue

                    start_row = 0
                    for i in range(min(10, len(df_table))):
                        row_str = " ".join(str(x) for x in df_table.iloc[i].values if pd.notna(x)).upper()
                        if "CODIGO" in row_str and ("VENTA" in row_str or "DESCRIPCION" in row_str or "PRECIO" in row_str):
                            start_row = i + 1
                            break

                    codigo_col, desc_col, precio_col = _detectar_columnas(df_table, start_row)
                    precio_iva_col = (_detectar_segunda_columna_precio(df_table, start_row, precio_col)
                                       if usar_segunda_columna else None)
                    for i in range(start_row, len(df_table)):
                        row = df_table.iloc[i]
                        if len(row) > max(codigo_col, desc_col, precio_col):
                            codigo = row.iloc[codigo_col] if pd.notna(row.iloc[codigo_col]) else None
                            descripcion = row.iloc[desc_col] if pd.notna(row.iloc[desc_col]) else None
                            precio, iva_incluido = _elegir_precio_con_iva(row, precio_col, precio_iva_col)
                            if (codigo and descripcion and precio and str(codigo).strip()
                                    and str(descripcion).strip()
                                    and not str(codigo).upper().startswith("CODIGO")):
                                try:
                                    precio_num = _parsear_precio_ar(precio)
                                    if precio_num and precio_num > 0:
                                        productos.append({
                                            "CODIGO": str(codigo).strip(),
                                            "DESCRIPCION": str(descripcion).strip(),
                                            "PRECIO_NETO": precio_num,
                                            "IVA_INCLUIDO": iva_incluido,
                                        })
                                except Exception:
                                    continue

            # Intento 2: texto linea por linea (para PDFs sin tablas reales)
            if not productos:
                file_io.seek(0)
                with pdfplumber.open(file_io) as pdf2:
                    for page in pdf2.pages:
                        words = page.extract_words(x_tolerance=5, y_tolerance=5)
                        if not words:
                            continue
                        lineas = {}
                        for w in words:
                            y_key = round(w["top"] / 5) * 5
                            lineas.setdefault(y_key, []).append(w)

                        for y_key in sorted(lineas.keys()):
                            line_words = sorted(lineas[y_key], key=lambda w: w["x0"])
                            tokens = [w["text"] for w in line_words]

                            precio_num, precio_idx = None, None
                            for j in range(len(tokens) - 1, -1, -1):
                                val = _parsear_precio_ar(tokens[j])
                                if val is not None and val > 100:
                                    precio_num, precio_idx = val, j
                                    break

                            if precio_num is None:
                                continue

                            codigo = tokens[0].strip()
                            descripcion = " ".join(tokens[1:precio_idx]).strip()

                            if (codigo and descripcion
                                    and codigo.upper() not in ("CODIGO", "COD", "DESCRIPCION", "PRECIO", "VENTA", "LISTA")
                                    and len(descripcion) > 3):
                                # Este metodo (texto linea por linea, para
                                # PDFs sin tablas reales) no distingue de
                                # forma confiable si habia 1 o 2 precios en
                                # la linea -- se trata como precio neto de
                                # siempre (IVA_INCLUIDO=False), igual que el
                                # comportamiento de antes.
                                productos.append({
                                    "CODIGO": codigo,
                                    "DESCRIPCION": descripcion,
                                    "PRECIO_NETO": precio_num,
                                    "IVA_INCLUIDO": False,
                                })

        if not productos:
            print(f"⚠️  {filename}: no se pudo extraer ningun producto")
            return pd.DataFrame()

        df_clean = pd.DataFrame(productos).drop_duplicates(subset=["CODIGO", "DESCRIPCION"])
        df_clean["CATEGORIA"] = categoria
        df_clean["ARCHIVO_ORIGEN"] = filename
        print(f"✅ {filename}: {len(df_clean)} productos (PDF)")
        return df_clean

    except Exception as e:
        print(f"❌ Error procesando PDF {filename}: {e}")
        return pd.DataFrame()


def procesar_carpeta_categoria_unica(service, folder_id: str, categoria: str,
                                      excluir_ids: Optional[List[str]] = None,
                                      excluir_nombre_contiene: Optional[List[str]] = None) -> pd.DataFrame:
    """Recorre TODOS los archivos (Excel + PDF) de una carpeta que es de
    UNA sola categoria (como DP-20, Titanium, Coversax) y devuelve un
    unico DataFrame con todos los productos encontrados.

    excluir_ids: lista de file IDs de Drive a saltear (por ejemplo un PDF
    gigante que rompe todo).
    excluir_nombre_contiene: lista de textos (en minuscula); si el nombre
    del archivo contiene alguno, se saltea.
    """
    excluir_ids = excluir_ids or []
    excluir_nombre_contiene = [t.lower() for t in (excluir_nombre_contiene or [])]

    archivos = listar_archivos_carpeta(service, folder_id)
    if not archivos:
        print("❌ No se encontraron archivos en la carpeta")
        return pd.DataFrame()

    print(f"📋 {len(archivos)} archivos encontrados en la carpeta")

    todos = []
    for f in archivos:
        fid, fname = f["id"], f["name"]

        if fid in excluir_ids:
            print(f"⏭️  Saltando (excluido por ID): {fname}")
            continue
        if any(t in fname.lower() for t in excluir_nombre_contiene):
            print(f"⏭️  Saltando (excluido por nombre): {fname}")
            continue

        fname_lower = fname.lower()
        mime = f.get("mimeType", "")
        # Algunos archivos vienen nombrados sin la extensión real (ej.
        # "Proform Mayo - pdf" en vez de "Proform Mayo.pdf"), así que
        # además del nombre chequeamos el mimeType real que devuelve Drive.
        es_pdf = fname_lower.endswith(".pdf") or mime == "application/pdf"
        es_excel_nativo_google = mime == "application/vnd.google-apps.spreadsheet"
        es_excel = (not es_excel_nativo_google) and (
            fname_lower.endswith(".xlsx") or fname_lower.endswith(".xls")
            or mime in ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/vnd.ms-excel")
        )

        if es_pdf:
            df = parsear_pdf(service, fid, fname, categoria)
        elif es_excel_nativo_google:
            print(f"⚠️  {fname}: tiene nombre de Excel pero es un Google Sheet nativo "
                  f"(no un archivo subido) -> no se puede leer con parsear_excel. "
                  f"Avisale a Marcos para agregar soporte de Sheets nativos acá.")
            continue
        elif es_excel:
            df = parsear_excel(service, fid, fname, categoria)
        else:
            print(f"⏭️  Saltando (extensión/tipo no soportado, mimeType={mime}): {fname}")
            continue

        if not df.empty:
            todos.append(df)

    if not todos:
        return pd.DataFrame()

    return pd.concat(todos, ignore_index=True)


# ─────────────────────────────────────────────────────────────────────────
#  EXPORT A EXCEL (respaldo de cada corrida)
# ─────────────────────────────────────────────────────────────────────────

def exportar_excel(df_pricing: pd.DataFrame, proveedor: str) -> Optional[str]:
    """Guarda un Excel simple de respaldo con lo que se subio a Supabase."""
    if df_pricing.empty:
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M")
    filename = f"{proveedor}_pricing_{timestamp}.xlsx"

    try:
        with pd.ExcelWriter(filename, engine="openpyxl") as writer:
            df_pricing.to_excel(writer, sheet_name="Productos", index=False)
        print(f"✅ Excel de respaldo exportado: {filename}")
        return filename
    except Exception as e:
        print(f"❌ Error exportando Excel: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────
#  SOPORTE MULTI-CATEGORIA + SUBCARPETAS + GOOGLE SHEETS
#  (para proveedores como Steel, Kraken, Padlock, que tienen varias
#  categorias en la misma carpeta y a veces subcarpetas o Sheets nativos)
# ─────────────────────────────────────────────────────────────────────────

def detectar_categoria_por_nombre(filename: str, category_mapping: Dict[str, str],
                                   categoria_default: str = "default") -> str:
    """Busca palabras clave del nombre de archivo en category_mapping.
    Devuelve la primera categoria que matchea, o categoria_default."""
    filename_lower = filename.lower()
    for keyword, categoria in category_mapping.items():
        if keyword in filename_lower:
            return categoria
    return categoria_default


def listar_archivos_recursivo(service, folder_id: str,
                               mime_filtro: Optional[str] = None) -> List[Dict]:
    """Lista archivos en la carpeta principal Y en sus subcarpetas (1 nivel).
    Cada archivo devuelto trae ademas 'carpeta' con el nombre de la
    subcarpeta de origen (o 'PRINCIPAL').

    mime_filtro: por ejemplo 'application/vnd.google-apps.spreadsheet' para
    traer solo Google Sheets nativos, o None para traer .xlsx/.xls/.pdf.
    """
    def _query_archivos(parent_id: str) -> str:
        if mime_filtro:
            return f"'{parent_id}' in parents and mimeType='{mime_filtro}' and trashed=false"
        return (f"'{parent_id}' in parents and trashed=false and "
                f"(name contains '.xlsx' or name contains '.xls' or name contains '.pdf')")

    todos = []

    # 1) Carpeta principal
    try:
        resultados = service.files().list(q=_query_archivos(folder_id),
                                           fields="files(id, name, mimeType)").execute()
        for f in resultados.get("files", []):
            f["carpeta"] = "PRINCIPAL"
            todos.append(f)
    except Exception as e:
        print(f"⚠️  Error listando carpeta principal: {e}")

    # 2) Subcarpetas (1 nivel)
    try:
        query_folders = f"'{folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        resultados = service.files().list(q=query_folders, fields="files(id, name)").execute()
        subcarpetas = resultados.get("files", [])

        for sub in subcarpetas:
            try:
                resultados_sub = service.files().list(q=_query_archivos(sub["id"]),
                                                        fields="files(id, name, mimeType)").execute()
                for f in resultados_sub.get("files", []):
                    f["carpeta"] = sub["name"]
                    todos.append(f)
            except Exception as e:
                print(f"⚠️  Error listando subcarpeta {sub['name']}: {e}")
    except Exception as e:
        print(f"⚠️  Error listando subcarpetas: {e}")

    return todos


def authenticate_sheets(credentials_file: str = "service_account_credentials.json"):
    """Cliente autenticado de la API de Google Sheets (para carpetas que
    usan Google Sheets nativos en vez de archivos .xlsx subidos)."""
    if not DRIVE_AVAILABLE:
        print("❌ Falta instalar: pip install google-api-python-client google-auth")
        return None
    try:
        credentials = service_account.Credentials.from_service_account_file(
            credentials_file,
            scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
        )
        return build("sheets", "v4", credentials=credentials)
    except Exception as e:
        print(f"❌ Error conectando a Sheets: {e}")
        return None


def parsear_google_sheet(sheets_service, file_id: str, filename: str, categoria: str,
                          usar_segunda_columna: bool = True) -> pd.DataFrame:
    """Lee un Google Sheet nativo (todas sus pestañas) y extrae productos.

    usar_segunda_columna: ver docstring de parsear_excel."""
    try:
        hoja = sheets_service.spreadsheets().get(spreadsheetId=file_id).execute()
        pestañas = hoja.get("sheets", [])

        productos = []
        for pestaña in pestañas:
            nombre_pestaña = pestaña["properties"]["title"]
            try:
                resultado = sheets_service.spreadsheets().values().get(
                    spreadsheetId=file_id, range=nombre_pestaña
                ).execute()
                valores = resultado.get("values", [])
            except Exception:
                continue

            if not valores:
                continue

            df = pd.DataFrame(valores)

            start_row = 0
            for i in range(min(10, len(df))):
                row_str = " ".join(str(x) for x in df.iloc[i].values if pd.notna(x)).upper()
                if "CODIGO" in row_str and ("VENTA" in row_str or "DESCRIPCION" in row_str or "PRECIO" in row_str):
                    start_row = i + 1
                    break

            codigo_col, desc_col, precio_col = _detectar_columnas(df, start_row)
            precio_iva_col = (_detectar_segunda_columna_precio(df, start_row, precio_col)
                               if usar_segunda_columna else None)

            for i in range(start_row, len(df)):
                row = df.iloc[i]
                if len(row) > max(codigo_col, desc_col, precio_col):
                    codigo = row.iloc[codigo_col] if codigo_col < len(row) else None
                    descripcion = row.iloc[desc_col] if desc_col < len(row) else None
                    precio, iva_incluido = _elegir_precio_con_iva(row, precio_col, precio_iva_col)
                    if codigo and descripcion and precio and str(codigo).strip() and str(descripcion).strip():
                        try:
                            precio_num = _parsear_precio_ar(precio)
                            if precio_num and precio_num > 0:
                                productos.append({
                                    "CODIGO": str(codigo).strip(),
                                    "DESCRIPCION": str(descripcion).strip(),
                                    "PRECIO_NETO": precio_num,
                                    "IVA_INCLUIDO": iva_incluido,
                                })
                        except Exception:
                            continue

        if not productos:
            return pd.DataFrame()

        df_clean = pd.DataFrame(productos).drop_duplicates(subset=["CODIGO", "DESCRIPCION"])
        df_clean["CATEGORIA"] = categoria
        df_clean["ARCHIVO_ORIGEN"] = filename
        print(f"✅ {filename}: {len(df_clean)} productos (Sheet)")
        return df_clean

    except Exception as e:
        print(f"❌ Error procesando Sheet {filename}: {e}")
        return pd.DataFrame()


def procesar_carpeta_multi_categoria(service, folder_id: str,
                                      category_mapping: Dict[str, str],
                                      categoria_default: str = "default",
                                      tipo_archivo: str = "auto",
                                      recursivo: bool = False,
                                      sheets_service=None,
                                      excluir_ids: Optional[List[str]] = None,
                                      excluir_nombre_contiene: Optional[List[str]] = None,
                                      categorias_forzar_neto: Optional[List[str]] = None) -> pd.DataFrame:
    """Version multi-categoria de procesar_carpeta_categoria_unica: detecta
    la categoria de cada archivo por su nombre (category_mapping), y
    soporta Excel, PDF, Google Sheets nativos, y busqueda en subcarpetas.

    tipo_archivo: 'excel' | 'pdf' | 'sheets' | 'auto' (auto detecta por
    extension/mimeType de cada archivo).

    categorias_forzar_neto: lista de categorias (ej. ['tapa_rigida', 'lona']
    para Kraken) donde SIEMPRE se ignora cualquier segunda columna de
    precio "con IVA" que se detecte en el archivo, y se usa la primera
    (el neto) aplicando despues el factor_iva normal del proveedor -- para
    no confiar en un archivo que quizas ya venga con el 21% cuando en
    realidad ese proveedor factura con el 10,5%.
    """
    excluir_ids = excluir_ids or []
    excluir_nombre_contiene = [t.lower() for t in (excluir_nombre_contiene or [])]
    categorias_forzar_neto = set(categorias_forzar_neto or [])

    mime_filtro = "application/vnd.google-apps.spreadsheet" if tipo_archivo == "sheets" else None

    if recursivo:
        archivos = listar_archivos_recursivo(service, folder_id, mime_filtro=mime_filtro)
    else:
        if tipo_archivo == "sheets":
            resultados = service.files().list(
                q=f"'{folder_id}' in parents and mimeType='{mime_filtro}' and trashed=false",
                fields="files(id, name, mimeType)").execute()
            archivos = resultados.get("files", [])
            for f in archivos:
                f["carpeta"] = "PRINCIPAL"
        else:
            archivos = listar_archivos_carpeta(service, folder_id)
            for f in archivos:
                f["carpeta"] = "PRINCIPAL"

    if not archivos:
        print("❌ No se encontraron archivos en la carpeta")
        return pd.DataFrame()

    print(f"📋 {len(archivos)} archivos encontrados")

    todos = []
    for f in archivos:
        fid, fname = f["id"], f["name"]

        if fid in excluir_ids:
            print(f"⏭️  Saltando (excluido por ID): {fname}")
            continue
        if any(t in fname.lower() for t in excluir_nombre_contiene):
            print(f"⏭️  Saltando (excluido por nombre): {fname}")
            continue

        categoria = detectar_categoria_por_nombre(fname, category_mapping, categoria_default)
        fname_lower = fname.lower()
        mime = f.get("mimeType", "")
        # Igual que en procesar_carpeta_categoria_unica: algunos archivos
        # vienen nombrados sin la extensión real, así que también miramos
        # el mimeType real de Drive, no solo el nombre.
        es_pdf = fname_lower.endswith(".pdf") or mime == "application/pdf"
        es_excel = fname_lower.endswith((".xlsx", ".xls")) or mime in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        )

        usar_segunda_columna = categoria not in categorias_forzar_neto

        if tipo_archivo == "sheets":
            df = parsear_google_sheet(sheets_service, fid, fname, categoria,
                                       usar_segunda_columna=usar_segunda_columna)
        elif tipo_archivo == "pdf" or es_pdf:
            df = parsear_pdf(service, fid, fname, categoria,
                              usar_segunda_columna=usar_segunda_columna)
        elif tipo_archivo == "excel" or es_excel:
            df = parsear_excel(service, fid, fname, categoria,
                                usar_segunda_columna=usar_segunda_columna)
        else:
            print(f"⏭️  Saltando (extensión/tipo no soportado, mimeType={mime}): {fname}")
            continue

        if not df.empty:
            todos.append(df)

    if not todos:
        return pd.DataFrame()

    return pd.concat(todos, ignore_index=True)


# ─────────────────────────────────────────────────────────────────────────
#  KITS (acoples/soportes cuyo costo se promedia y se suma a otros productos)
# ─────────────────────────────────────────────────────────────────────────

def calcular_costo_promedio_codigos(df: pd.DataFrame, codigos: List[str]) -> float:
    """Promedia el PRECIO_NETO de una lista de SKUs (para kits: acoples,
    soportes, llaves, etc.) usando el DataFrame crudo (antes de pricing)."""
    precios = []
    for codigo in codigos:
        fila = df[df["CODIGO"] == codigo]
        if not fila.empty:
            precios.append(float(fila.iloc[0]["PRECIO_NETO"]))
    return float(np.mean(precios)) if precios else 0.0


# ─────────────────────────────────────────────────────────────────────────
#  CALCULO DE PRECIO COMPLETO (todas las cuotas, para el Excel final)
# ─────────────────────────────────────────────────────────────────────────

def calcular_precio_completo(precio_neto: float, categoria: str,
                              configs_categorias: List[Dict],
                              cuotas: Dict[str, float],
                              costo_kit: float = 0.0,
                              factor_iva: float = FACTOR_IVA_10_5,
                              factor_iva_local: Optional[float] = None) -> Dict:
    """Version completa: calcula precio ML para CADA tipo de cuota
    (3/6/12/sin_cuotas/cuotas_bajas) + precio local + ganancia real,
    igual que hacian los scripts originales de cada proveedor.

    factor_iva: 1.105 (10.5%, default) o 1.21 (21%, ej. DP-20/Coversax
    que facturan el IVA completo). Se usa para costo_base/precio_ml.

    factor_iva_local: si se pasa, reemplaza a factor_iva SOLO para calcular
    precio_local (ej. Kraken factura tapa_rigida/lonas Flashcover con el
    costo ya cerrado sin IVA extra, pero eso solo se refleja en el precio
    del local, no en el de ML). Si es None, se usa el mismo factor_iva
    para los dos precios (comportamiento normal)."""
    cfg = config_para_categoria(configs_categorias, categoria)

    costos_financieros_venta = cuotas.get("costos_financieros_venta", 0.05)
    costo_operativo = cuotas.get("costo_operativo", 2500)

    precio_real_pagar = (precio_neto + costo_kit) * factor_iva
    factor_iva_para_local = factor_iva if factor_iva_local is None else factor_iva_local
    precio_real_pagar_local = (precio_neto + costo_kit) * factor_iva_para_local
    costo_envio = float(cfg.get("costo_envio", 20000) or 0)
    costo_base_total = precio_real_pagar + costo_envio + costo_operativo
    comision_ml = float(cfg.get("comision_ml_pct", 0.145) or 0.145)

    tipo_ml = cfg.get("tipo_ml", "porcentaje")
    margen_o_ganancia = float(cfg.get("valor_ml", 0.15))
    margen_local_pct = float(cfg.get("margen_local_pct", 30) or 30)

    precios_cuotas = {}
    for tipo_cuota, costo_cuota in cuotas.items():
        if tipo_cuota not in ("sin_cuotas", "3_cuotas", "6_cuotas", "12_cuotas", "cuotas_bajas"):
            continue  # ignora claves que no son cuotas (costo_operativo, etc.)

        if tipo_ml == "porcentaje":
            margen = margen_o_ganancia
            denominador = (1 - margen - comision_ml - costo_cuota
                            - costos_financieros_venta - (margen * IVA_SOBRE_RENTABILIDAD))
            precio = costo_base_total / denominador if denominador > 0 else 0
        else:  # pesos
            ganancia_fija = margen_o_ganancia
            iva_sobre_ganancia = ganancia_fija * IVA_SOBRE_RENTABILIDAD
            precio_objetivo = costo_base_total + ganancia_fija + iva_sobre_ganancia
            denominador = 1 - comision_ml - costo_cuota - costos_financieros_venta
            precio = precio_objetivo / denominador if denominador > 0 else 0

        precios_cuotas[tipo_cuota] = round_price(precio) if precio > 0 else 0

    # "Precio de lista/promo": el precio real de venta (precios_cuotas) con
    # un 15% arriba, para poder publicar en ML con ese precio tachado y un
    # descuento del 15% que aterriza justo en el precio real que queremos
    # cobrar. Se guarda en columnas aparte, no reemplaza nada.
    precios_cuotas_promo = {
        tipo: round_price(precio * (1 + PORCENTAJE_PROMO)) if precio > 0 else 0
        for tipo, precio in precios_cuotas.items()
    }

    precio_local = round_price(precio_real_pagar_local * (1 + margen_local_pct / 100))

    # Ganancia real usando el precio de 3 cuotas como referencia
    precio_3c = precios_cuotas.get("3_cuotas", 0)
    ganancia_real, margen_real_pct = 0, 0.0
    if precio_3c > 0:
        costo_cuota_3 = cuotas.get("3_cuotas", 0.084)
        costos_sobre_venta = comision_ml + costo_cuota_3 + costos_financieros_venta
        ingresos_netos = precio_3c * (1 - costos_sobre_venta)
        ganancia_bruta = ingresos_netos - costo_base_total
        iva_sobre_ganancia = ganancia_bruta * IVA_SOBRE_RENTABILIDAD
        ganancia_real = ganancia_bruta - iva_sobre_ganancia
        margen_real_pct = (ganancia_real / precio_3c) * 100

    return {
        "costo_base": int(round(costo_base_total)),
        "precio_ml_3_cuotas": precios_cuotas.get("3_cuotas", 0),
        "precio_ml_6_cuotas": precios_cuotas.get("6_cuotas", 0),
        "precio_ml_12_cuotas": precios_cuotas.get("12_cuotas", 0),
        "precio_ml_sin_cuotas": precios_cuotas.get("sin_cuotas", 0),
        "precio_ml_cuotas_bajas": precios_cuotas.get("cuotas_bajas", 0),
        "precio_ml_3_cuotas_promo": precios_cuotas_promo.get("3_cuotas", 0),
        "precio_ml_6_cuotas_promo": precios_cuotas_promo.get("6_cuotas", 0),
        "precio_ml_12_cuotas_promo": precios_cuotas_promo.get("12_cuotas", 0),
        "precio_ml_sin_cuotas_promo": precios_cuotas_promo.get("sin_cuotas", 0),
        "precio_ml_cuotas_bajas_promo": precios_cuotas_promo.get("cuotas_bajas", 0),
        "precio_local": precio_local,
        "ganancia_real": int(round(ganancia_real)),
        "margen_real_pct": round(margen_real_pct, 1),
        "comision_ml_pct": round(comision_ml * 100, 1),
        "costo_envio": int(costo_envio),
    }


def calcular_pricing_dataframe_completo(df: pd.DataFrame, proveedor: str,
                                         configs_categorias: List[Dict],
                                         cuotas: Dict[str, float],
                                         costo_kit_fn=None,
                                         descuento_fn=None,
                                         factor_iva: float = FACTOR_IVA_10_5,
                                         factor_iva_local_fn=None) -> pd.DataFrame:
    """Version rica para el Excel final unificado: una fila por producto
    con TODAS las cuotas + ganancia + margen. Incluye soporte opcional
    para kits (costo_kit_fn) y descuentos de proveedor (descuento_fn).

    costo_kit_fn(codigo, categoria) -> float (costo extra a sumar)
    descuento_fn(codigo, categoria, descripcion) -> float 0-1 (ej 0.03 = 3% off)
    factor_iva: 1.105 (10.5%, default) o 1.21 (21%, ej. DP-20/Coversax).
    factor_iva_local_fn(codigo, categoria, descripcion, archivo) -> Optional[float]:
    si devuelve un numero, se usa SOLO para precio_local de ese producto
    puntual (ej. tapa_rigida/lonas Flashcover de Kraken); si devuelve None,
    ese producto usa el mismo factor_iva normal para local y ML.
    """
    filas = []
    for _, row in df.iterrows():
        codigo = str(row["CODIGO"]).strip()
        descripcion = str(row["DESCRIPCION"]).strip()
        precio_neto = float(row["PRECIO_NETO"])
        categoria = row.get("CATEGORIA", "default")
        archivo = row.get("ARCHIVO_ORIGEN", "")

        if not codigo or not descripcion or precio_neto <= 0:
            continue

        if descuento_fn:
            descuento = descuento_fn(codigo, categoria, descripcion) or 0
            precio_neto = precio_neto * (1 - descuento)

        costo_kit = costo_kit_fn(codigo, categoria) if costo_kit_fn else 0.0
        factor_iva_local = (factor_iva_local_fn(codigo, categoria, descripcion, archivo)
                             if factor_iva_local_fn else None)

        # Si el archivo traia 2 columnas de precio, ya usamos la que viene
        # con IVA incluido (ver _elegir_precio_con_iva) -- en ese caso NO
        # hay que sumarle el factor_iva de nuevo, o se cobraria IVA 2 veces.
        iva_incluido = bool(row.get("IVA_INCLUIDO", False))
        factor_iva_efectivo = 1.0 if iva_incluido else factor_iva

        resultado = calcular_precio_completo(precio_neto, categoria, configs_categorias, cuotas, costo_kit,
                                              factor_iva=factor_iva_efectivo, factor_iva_local=factor_iva_local)

        filas.append({
            "sku": codigo,
            "nombre": descripcion,
            "categoria": categoria,
            "proveedor": proveedor,
            "precio_neto": int(round(precio_neto)),
            "costo_kit": int(round(costo_kit)),
            **resultado,
            "archivo_origen": archivo,
        })

    return pd.DataFrame(filas)


# ─────────────────────────────────────────────────────────────────────────
#  EXPORT + UPLOAD del Excel unificado (todos los proveedores juntos)
# ─────────────────────────────────────────────────────────────────────────

def exportar_excel_unificado(df_todo: pd.DataFrame, filename: Optional[str] = None) -> Optional[str]:
    """Un solo Excel con: hoja 'Todos', una hoja por proveedor, y un
    'Resumen' con estadisticas por proveedor+categoria."""
    if df_todo.empty:
        return None

    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        filename = f"MonsterTrail_Precios_TODO_{timestamp}.xlsx"

    try:
        with pd.ExcelWriter(filename, engine="openpyxl") as writer:
            df_todo.to_excel(writer, sheet_name="Todos", index=False)

            for proveedor in sorted(df_todo["proveedor"].unique()):
                df_prov = df_todo[df_todo["proveedor"] == proveedor]
                sheet_name = str(proveedor).replace(" ", "_")[:31]
                df_prov.to_excel(writer, sheet_name=sheet_name, index=False)

            resumen = []
            for (proveedor, categoria), grupo in df_todo.groupby(["proveedor", "categoria"]):
                viables = grupo[grupo["precio_ml_3_cuotas"] > 0]
                resumen.append({
                    "Proveedor": proveedor,
                    "Categoría": categoria,
                    "Total productos": len(grupo),
                    "Productos viables": len(viables),
                    "Precio 3c promedio": viables["precio_ml_3_cuotas"].mean() if len(viables) else 0,
                    "Ganancia promedio": viables["ganancia_real"].mean() if len(viables) else 0,
                })
            pd.DataFrame(resumen).to_excel(writer, sheet_name="Resumen", index=False)

        print(f"\n✅ Excel unificado exportado: {filename}")
        return filename
    except Exception as e:
        print(f"❌ Error exportando Excel unificado: {e}")
        return None


def subir_a_supabase_desde_completo(df_todo: pd.DataFrame, supabase_url: str,
                                     supabase_key: str, batch_size: int = 300) -> int:
    """Sube a Supabase (tabla productos) tomando el precio de 3 cuotas
    como 'precio_ml' oficial (mismo criterio que usaba el workflow de
    n8n). El resto de las cuotas quedan disponibles en el Excel."""
    if df_todo.empty:
        return 0

    df_supabase = pd.DataFrame({
        "sku": df_todo["sku"],
        "nombre": df_todo["nombre"],
        "costo_base": df_todo["costo_base"],
        # Precio neto puro del proveedor (sin kit, sin IVA, sin envío ni
        # operativo) -- para poder comparar 1 a 1 contra la factura real
        # sin tener que reconstruirlo restando cosas de costo_base (ver
        # agregar_precio_neto_proveedor.sql).
        "precio_neto_proveedor": df_todo["precio_neto"],
        "costo_kit_incluido": df_todo["costo_kit"],
        "precio_ml": df_todo["precio_ml_3_cuotas"],
        "precio_local": df_todo["precio_local"],
        "proveedor": df_todo["proveedor"],
        "categoria": df_todo["categoria"],
        "origen": "cappiello",
        "archivo_origen": df_todo["archivo_origen"],
        # Resto de las cuotas SIN promo (antes solo quedaban en el Excel;
        # hacen falta en Supabase para que n8n pueda leer el precio de
        # cualquier cuota en vivo -- ver agregar_columnas_cuotas_ml.sql).
        "precio_ml_6_cuotas": df_todo["precio_ml_6_cuotas"],
        "precio_ml_12_cuotas": df_todo["precio_ml_12_cuotas"],
        "precio_ml_sin_cuotas": df_todo["precio_ml_sin_cuotas"],
        "precio_ml_cuotas_bajas": df_todo["precio_ml_cuotas_bajas"],
        # Precios "de lista" con 15% arriba, para armar promos/descuentos en ML
        # (requiere que estas columnas ya existan en la tabla productos --
        # ver agregar_columnas_promo.sql).
        "precio_ml_promo": df_todo["precio_ml_3_cuotas_promo"],
        "precio_ml_6_cuotas_promo": df_todo["precio_ml_6_cuotas_promo"],
        "precio_ml_12_cuotas_promo": df_todo["precio_ml_12_cuotas_promo"],
        "precio_ml_sin_cuotas_promo": df_todo["precio_ml_sin_cuotas_promo"],
        "precio_ml_cuotas_bajas_promo": df_todo["precio_ml_cuotas_bajas_promo"],
    })

    return upload_a_supabase(df_supabase, supabase_url, supabase_key, batch_size=batch_size)


# ─────────────────────────────────────────────────────────────────────────
#  FUNCION "TODO EN UNO" para scripts de proveedor de categoria unica
# ─────────────────────────────────────────────────────────────────────────

def correr_proveedor_categoria_unica(nombre_proveedor: str, proveedor_slug: str,
                                      folder_id: str, categoria: str,
                                      excluir_ids: Optional[List[str]] = None,
                                      excluir_nombre_contiene: Optional[List[str]] = None,
                                      factor_iva: float = FACTOR_IVA_10_5) -> None:
    """Pipeline completo para un proveedor de UNA sola categoria:
    Drive -> parseo -> precio (con config de Supabase) -> Excel + Supabase.

    Es lo que llaman pricing_dp20.py, pricing_titanium.py y
    pricing_coversax.py -- cada uno solo define sus datos y llama a esto.
    """
    print(f"🚛 MONSTER TRAIL - {nombre_proveedor}")
    print("=" * 60)

    # 1) Config de Supabase
    sb = load_supabase_config()
    supabase_url, supabase_key = sb["SUPABASE_URL"], sb["SUPABASE_KEY"]

    print("📡 Trayendo configuración de precios desde Supabase...")
    configs_categorias = fetch_configuracion_precios(supabase_url, supabase_key)
    cuotas = fetch_config_cuotas_ml(supabase_url, supabase_key)

    if not any(c.get("categoria") == categoria for c in configs_categorias):
        print(f"⚠️  No hay fila en configuracion_precios para categoria='{categoria}'. "
              f"Se va a usar un margen por defecto (15%) hasta que la agregues.")

    # 2) Drive: conectar y procesar archivos
    service = authenticate_drive()
    if not service:
        return

    print(f"📁 Carpeta de Drive: {folder_id}")
    df_productos = procesar_carpeta_categoria_unica(
        service, folder_id, categoria,
        excluir_ids=excluir_ids, excluir_nombre_contiene=excluir_nombre_contiene
    )

    if df_productos.empty:
        print("❌ No se pudo extraer ningún producto. Nada para subir.")
        return

    print(f"\n📦 Total productos extraídos: {len(df_productos)}")

    # 3) Calcular precios
    df_pricing = calcular_pricing_dataframe(df_productos, proveedor_slug, configs_categorias, cuotas,
                                             factor_iva=factor_iva)

    if df_pricing.empty:
        print("❌ No se pudo calcular precio para ningún producto.")
        return

    print(f"💰 Precios calculados para {len(df_pricing)} productos")
    print(df_pricing[["sku", "nombre", "precio_ml", "precio_local"]].head(10).to_string(index=False))

    # 4) Excel de respaldo
    exportar_excel(df_pricing, proveedor_slug)

    # 5) Subir a Supabase
    print("\n📤 Subiendo a Supabase (tabla productos)...")
    subidos = upload_a_supabase(df_pricing, supabase_url, supabase_key)
    print(f"\n✅ Listo: {subidos}/{len(df_pricing)} productos subidos a Supabase.")
