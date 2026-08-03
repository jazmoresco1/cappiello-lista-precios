import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ARS } from "../utils.js";
import { supabase } from "../supabaseClient.js";

const UMBRAL_ALERTA_PCT = 1;
const COSTO_OPERATIVO_DEFAULT = 2500;
// Factor de IVA que el sistema asume para Steel Tiger al armar costo_base
// (ver pricing_common.py) -- se usa para volver costo_base a "neto sin IVA"
// y comparar todo neto vs neto, no con IVA incluido.
const FACTOR_IVA_SISTEMA = 1.105;

function esDevolucion(o) {
  const comp = String(o["Comprobante"] ?? "");
  const cant = Number(o["Cantidad"]);
  return comp.startsWith("Dev.") || (Number.isFinite(cant) && cant < 0);
}

function aFecha(valor) {
  if (valor instanceof Date) return valor;
  if (!valor) return null;
  const d = new Date(valor);
  return isNaN(d) ? null : d;
}

function toISODate(d) {
  if (!d) return "";
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

function configParaCategoria(configs, categoria) {
  return (
    configs.find(c => c.categoria === categoria) ||
    configs.find(c => c.categoria === "default") ||
    { costo_envio: 20000 }
  );
}

// Para "enganche" y "estribo", costo_base viene con el costo promedio del
// kit (acople/soporte) sumado adentro -- hay que restarlo para comparar
// el producto individual, no el combo (misma lógica que usa la app para
// el precio local y comparar_costos_proveedor.py).
const SOPORTES_ESTRIBOS = new Set([
  "SEA157", "SEA161", "SEA155", "SEA160", "SEA156", "SEA159",
  "SEA150", "SEA158", "SEA154", "SEA056", "SEA057", "SEA059",
  "SEA050", "SEA058", "SEA054", "SEA055", "SEA053", "SEA051", "SEA066",
]);

function deduccionKit(sku, categoria) {
  const s = sku.toUpperCase();
  if (categoria === "enganche") {
    if (s.startsWith("SE")) return 65238;
    if (s.startsWith("E") && !s.startsWith("EAC")) return 35095;
    return 0;
  }
  if (categoria === "estribo") {
    return SOPORTES_ESTRIBOS.has(s) ? 0 : 93954;
  }
  return 0;
}

async function parseArchivoProveedor(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

  let headerRowIdx = 4;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = (rows[i] || []).filter(x => x != null).join(" ");
    if (rowStr.includes("Producto") && rowStr.includes("Cantidad")) { headerRowIdx = i; break; }
  }
  const headers = (rows[headerRowIdx] || []).map(h => String(h ?? "").trim());
  const dataRows = rows.slice(headerRowIdx + 1);

  const objetos = dataRows
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = r[i]; });
      return o;
    })
    .filter(o => o["Producto"] != null && String(o["Producto"]).trim() !== "");

  const compras = [], devoluciones = [];
  for (const o of objetos) {
    const fecha = aFecha(o["Fecha"]);
    const fila = {
      sku: String(o["Producto"]).trim(),
      nombre: o["Nombre Producto"],
      comprobante: o["Comprobante"],
      cantidad: Number(o["Cantidad"]),
      precioNeto: Number(o["Prec. Neto c/Iva"]),
      ivaPct: Number(o["IVA %"]) || 0,
      total: Number(o["Total"]),
      _fecha: fecha,
    };
    if (esDevolucion(o)) devoluciones.push(fila);
    else if (fecha) compras.push(fila);
  }
  return { compras, devoluciones };
}

export default function ControlProveedorPanel({ onClose }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [parseando, setParseando] = useState(false);
  const [error, setError] = useState(null);

  const [compras, setCompras] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [productosMap, setProductosMap] = useState(null);
  const [configCategorias, setConfigCategorias] = useState([]);
  const [costoOperativo, setCostoOperativo] = useState(COSTO_OPERATIVO_DEFAULT);

  const elegirArchivo = () => inputRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseando(true);
    setError(null);
    try {
      const { compras: c, devoluciones: d } = await parseArchivoProveedor(file);
      if (c.length === 0) throw new Error("No encontré ninguna línea de compra en este archivo. ¿Es el informe correcto?");

      setCompras(c);
      setDevoluciones(d);

      const fechas = c.map(x => x._fecha).filter(Boolean);
      const min = new Date(Math.min(...fechas));
      const max = new Date(Math.max(...fechas));
      setFechaDesde(toISODate(min));
      setFechaHasta(toISODate(max));

      const skus = [...new Set(c.map(x => x.sku))];
      const [{ data: productos, error: errProd }, { data: cfgs, error: errCfg }, { data: cuotas, error: errCuo }] = await Promise.all([
        supabase.from("productos").select("sku,costo_base,categoria,nombre").in("sku", skus),
        supabase.from("configuracion_precios").select("categoria,costo_envio"),
        supabase.from("config_cuotas_ml").select("clave,valor"),
      ]);
      if (errProd || errCfg || errCuo) throw new Error("No se pudo traer la config de Supabase para comparar.");

      setProductosMap(Object.fromEntries((productos || []).map(p => [p.sku, p])));
      setConfigCategorias(cfgs || []);
      const cuotaOp = (cuotas || []).find(c => c.clave === "costo_operativo");
      setCostoOperativo(cuotaOp ? Number(cuotaOp.valor) : COSTO_OPERATIVO_DEFAULT);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo leer el archivo.");
      setCompras([]); setDevoluciones([]); setProductosMap(null);
    } finally {
      setParseando(false);
    }
  };

  const comparacion = useMemo(() => {
    if (!compras.length || !productosMap) return { filas: [], sinMatch: [] };

    const desde = fechaDesde ? new Date(fechaDesde + "T00:00:00") : null;
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59") : null;
    const enRango = compras.filter(o => o._fecha && (!desde || o._fecha >= desde) && (!hasta || o._fecha <= hasta));

    const masReciente = {}, conteo = {};
    for (const o of enRango) {
      conteo[o.sku] = (conteo[o.sku] || 0) + 1;
      if (!masReciente[o.sku] || o._fecha > masReciente[o.sku]._fecha) masReciente[o.sku] = o;
    }

    const filas = [], sinMatch = [];
    for (const sku of Object.keys(masReciente)) {
      const o = masReciente[sku];
      const p = productosMap[sku];
      // Precio con descuentos ya aplicados, pero SIN IVA -- usa el % de IVA
      // real de esa factura (0% en Cotizacion, 21%/10.5% en eFactura según
      // corresponda), no un valor fijo.
      const real = o.ivaPct ? (o.precioNeto || 0) / (1 + o.ivaPct / 100) : (o.precioNeto || 0);

      if (!p) {
        sinMatch.push({ sku, nombre: o.nombre, real, fecha: o._fecha, cantidadCompras: conteo[sku] });
        continue;
      }

      const cfg = configParaCategoria(configCategorias, p.categoria);
      const costoEnvio = Number(cfg.costo_envio) || 0;
      const kit = deduccionKit(sku, p.categoria);
      const esperadoConIva = (p.costo_base || 0) - costoEnvio - costoOperativo - kit;
      const esperado = esperadoConIva / FACTOR_IVA_SISTEMA; // vuelve a "neto sin IVA"
      const diferenciaPesos = real - esperado;
      const diferenciaPct = esperado ? (diferenciaPesos / esperado) * 100 : null;

      filas.push({
        sku, nombre: p.nombre || o.nombre, categoria: p.categoria,
        esperado, real, diferenciaPesos, diferenciaPct,
        fecha: o._fecha, cantidadCompras: conteo[sku],
        alerta: diferenciaPct != null && Math.abs(diferenciaPct) > UMBRAL_ALERTA_PCT,
      });
    }
    filas.sort((a, b) => Math.abs(b.diferenciaPct ?? 0) - Math.abs(a.diferenciaPct ?? 0));
    return { filas, sinMatch };
  }, [compras, fechaDesde, fechaHasta, productosMap, configCategorias, costoOperativo]);

  const alertas = comparacion.filas.filter(f => f.alerta);

  return (
    <div className="img-panel" style={{width:560}}>
      <div className="img-head">
        <div>
          <div className="img-head-title">🔍 Control de proveedor</div>
          <div className="img-head-sub">Subí el informe de ventas del proveedor y compará contra tus costos — no cambia ningún precio</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        <input ref={inputRef} type="file" accept=".xls,.xlsx" style={{display:"none"}} onChange={onFileChange} />
        <button className="img-auto-btn" onClick={elegirArchivo} disabled={parseando}>
          {parseando ? "Leyendo archivo…" : fileName ? "📄 Cambiar archivo" : "📄 Elegir archivo del proveedor (.xls)"}
        </button>
        {fileName && <div style={{fontSize:11,color:"var(--tx2)",marginBottom:12}}>{fileName}</div>}

        {error && <div className="cot-empty" style={{padding:10,fontSize:12,color:"#e55",marginBottom:12}}>{error}</div>}

        {compras.length > 0 && (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              <label style={{fontSize:11,color:"var(--tx2)",display:"flex",flexDirection:"column",gap:4}}>
                Desde
                <input className="cot-nombre-inp" style={{marginBottom:0}} type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)} />
              </label>
              <label style={{fontSize:11,color:"var(--tx2)",display:"flex",flexDirection:"column",gap:4}}>
                Hasta
                <input className="cot-nombre-inp" style={{marginBottom:0}} type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)} />
              </label>
            </div>

            {!productosMap ? (
              <div className="cot-empty" style={{padding:12}}>Comparando contra Supabase…</div>
            ) : (
              <>
                <div style={{fontSize:11,color:"var(--tx2)",marginBottom:14}}>
                  {comparacion.filas.length} SKU comparados · {alertas.length} con diferencia mayor a {UMBRAL_ALERTA_PCT}% · {comparacion.sinMatch.length} sin match en Supabase
                </div>

                <div className="img-section-title" style={{marginTop:0}}>Diferencias de precio (neto, sin IVA)</div>
                {comparacion.filas.length === 0 ? (
                  <div className="cot-empty" style={{padding:10,fontSize:12,marginBottom:14}}>Sin compras en el rango de fechas elegido.</div>
                ) : (
                  <div className="img-prod-list" style={{marginBottom:16}}>
                    {comparacion.filas.map(f => (
                      <div key={f.sku} className="img-prod-row" style={{cursor:"default"}}>
                        <div className="img-prod-thumb-empty">{f.alerta ? "⚠️" : "✓"}</div>
                        <div className="img-prod-info">
                          <div className="img-prod-name">{f.sku} · {f.nombre}</div>
                          <div className="img-prod-count">
                            {f.categoria} · esperado {ARS(f.esperado)} · real {ARS(f.real)}
                            {" · "}{f.fecha?.toLocaleDateString("es-AR")}
                          </div>
                        </div>
                        <div style={{fontWeight:700,whiteSpace:"nowrap",color: f.alerta ? "#e55" : "var(--ac)"}}>
                          {f.diferenciaPct!=null ? `${f.diferenciaPct>0?"+":""}${f.diferenciaPct.toFixed(1)}%` : "?"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {comparacion.sinMatch.length > 0 && (
                  <>
                    <div className="img-section-title">Sin match en Supabase</div>
                    <div className="img-prod-list" style={{marginBottom:16}}>
                      {comparacion.sinMatch.map(f => (
                        <div key={f.sku} className="img-prod-row" style={{cursor:"default"}}>
                          <div className="img-prod-thumb-empty">❓</div>
                          <div className="img-prod-info">
                            <div className="img-prod-name">{f.sku} · {f.nombre}</div>
                            <div className="img-prod-count">Facturado {ARS(f.real)} · {f.fecha?.toLocaleDateString("es-AR")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {devoluciones.length > 0 && (
              <>
                <div className="img-section-title">Devoluciones en el archivo</div>
                <div className="img-prod-list">
                  {devoluciones.map((d, i) => (
                    <div key={i} className="img-prod-row" style={{cursor:"default"}}>
                      <div className="img-prod-thumb-empty">↩️</div>
                      <div className="img-prod-info">
                        <div className="img-prod-name">{d.sku} · {d.nombre}</div>
                        <div className="img-prod-count">x{d.cantidad} · {ARS(d.total)} · {d._fecha?.toLocaleDateString("es-AR")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
