import { useState, useMemo, useEffect, useCallback } from "react";
import SCRAPED_IMAGES from "./scraped-images.js";
import { supabase } from "./supabaseClient.js";
import "./App.css";
import { PRODUCTOS } from "./data/productos.js";
import {
  CONFIG_INICIAL, PROVEEDORES_INFO, CUOTAS_MP, CUOTAS_DEFAULT,
  FORMAS_PAGO, COMBOS, SUBTAB_CFG,
} from "./data/catalogo.js";
import { ARS, calcular, getColorBadge, detectarCombos } from "./utils.js";
import VendedoresPanel from "./components/VendedoresPanel.jsx";
import StockPanel from "./components/StockPanel.jsx";
import VentasPanel from "./components/VentasPanel.jsx";
import SociosPanel from "./components/SociosPanel.jsx";
import FacturasPanel from "./components/FacturasPanel.jsx";
import PinModal from "./components/PinModal.jsx";
import ProductModal from "./components/ProductModal.jsx";
import ImageManagerPanel from "./components/ImageManagerPanel.jsx";
import CotizadorPanel from "./components/CotizadorPanel.jsx";
import ProductGrid from "./components/ProductGrid.jsx";
import TopBar from "./components/TopBar.jsx";

export default function ListaPrecios() {
  const [config, setConfig]     = useState(CONFIG_INICIAL);
  const [cuotas, setCuotas]     = useState(CUOTAS_DEFAULT);
  const [overrides, setOvr]     = useState({});
  const [stock, setStock]       = useState({});
  const [editStock, setEditStk] = useState(null);

  // ── ACCESO INTERNO (PIN) ─────────────────────────────────────────
  const ADMIN_PIN = "mt2026"; // cambiá este valor para cambiar la clave
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen,  setPinOpen]  = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const handlePin = () => {
    if (pinInput === ADMIN_PIN) {
      setUnlocked(true); setPinOpen(false); setPinInput(""); setPinError(false);
      if (pinTarget === "vendedores") { setVendPanelOpen(true); }
      if (pinTarget === "stock") { setStockPanelOpen(true); }
      if (pinTarget === "ventas") { setVentasPanelOpen(true); cargarVentas(); }
      if (pinTarget === "socios") { setSociosPanelOpen(true); cargarReparto(); }
      if (pinTarget === "facturas") { setFacturasPanelOpen(true); cargarFacturas(); }
      setPinTarget(null);
    } else {
      setPinError(true); setPinInput("");
    }
  };
  const [familia, setFamilia]   = useState("Tapas Rígidas");
  const [subtab, setSubtab]     = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [busqGlobal, setBusqGlobal] = useState(false);

  // COTIZADOR
  const [cotOpen, setCotOpen]       = useState(false);
  const [cotItems, setCotItems]     = useState([]); // [{...producto, qty, descItem}]
  const [cotDescGlobal, setCotDG]   = useState(0);
  const [cotComboAct, setCotCombo]  = useState([]); // combos activos aplicados
  const [cotBusq, setCotBusq]       = useState("");
  const [cotNombre, setCotNombre]   = useState("");
  const [cotVendedorId, setCotVendedorId] = useState("");
  const [cotFormaPago, setCotFormaPago]   = useState("efectivo"); // "efectivo" | "2" | "3" | "6" | "9" | "12" | "18"
  const [guardando, setGuardando]   = useState(false);
  const [guardadoMsg, setGuardadoMsg] = useState(null); // {ok:true/false, texto}

  // ── VENDEDORES Y COMISIONES (protegido con la misma clave de arriba) ──
  // Viven en Supabase (tablas "vendedores" + "vendedor_comisiones"), no en localStorage.
  const [vendedores, setVend] = useState([]);
  const [vendLoading, setVendLoading] = useState(false);

  const cargarVendedores = useCallback(async () => {
    setVendLoading(true);
    const { data, error } = await supabase
      .from("vendedores")
      .select("id, nombre, activo, vendedor_comisiones(forma_pago, porcentaje)")
      .eq("activo", true)
      .order("nombre");
    if (error) {
      console.error("Error cargando vendedores:", error);
    } else {
      setVend((data || []).map(v => ({
        id: v.id,
        nombre: v.nombre,
        comisiones: Object.fromEntries((v.vendedor_comisiones || []).map(c => [c.forma_pago, c.porcentaje])),
      })));
    }
    setVendLoading(false);
  }, []);

  useEffect(() => { cargarVendedores(); }, [cargarVendedores]);

  const [vendPanelOpen, setVendPanelOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState(null); // "vendedores" | null — a donde ir despues de ingresar la clave
  const [vendEditId, setVendEditId] = useState(null); // id del vendedor en edicion, o "nuevo"
  const [vendForm, setVendForm] = useState(null); // {nombre, comisiones:{efectivo:0,"2":0,...}}
  const [vendGuardando, setVendGuardando] = useState(false);

  const abrirVendedores = () => {
    if (unlocked) setVendPanelOpen(true);
    else { setPinTarget("vendedores"); setPinOpen(true); }
  };

  const nuevoVendedorForm = () => ({
    nombre: "",
    comisiones: Object.fromEntries(FORMAS_PAGO.map(f => [f.key, 0])),
  });

  const guardarVendedor = async () => {
    if (!vendForm?.nombre?.trim()) return;
    setVendGuardando(true);
    try {
      let vendedorId = vendEditId === "nuevo" ? null : vendEditId;

      if (!vendedorId) {
        const { data, error } = await supabase
          .from("vendedores")
          .insert({ nombre: vendForm.nombre.trim() })
          .select("id")
          .single();
        if (error) throw error;
        vendedorId = data.id;
      } else {
        const { error } = await supabase
          .from("vendedores")
          .update({ nombre: vendForm.nombre.trim() })
          .eq("id", vendedorId);
        if (error) throw error;
      }

      const filas = Object.entries(vendForm.comisiones || {}).map(([forma_pago, porcentaje]) => ({
        vendedor_id: vendedorId,
        forma_pago,
        porcentaje: Number(porcentaje) || 0,
      }));
      const { error: errComis } = await supabase
        .from("vendedor_comisiones")
        .upsert(filas, { onConflict: "vendedor_id,forma_pago" });
      if (errComis) throw errComis;

      await cargarVendedores();
      setVendEditId(null); setVendForm(null);
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar el vendedor (revisá la conexión con Supabase).");
    } finally {
      setVendGuardando(false);
    }
  };

  const borrarVendedor = async (id) => {
    if (!confirm("¿Borrar este vendedor?")) return;
    const { error } = await supabase.from("vendedores").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert("No se pudo borrar (puede tener ventas asociadas).");
      return;
    }
    if (cotVendedorId === id) setCotVendedorId("");
    await cargarVendedores();
  };

  // ── STOCK (protegido con la misma clave) ──────────────────────────
  const [stockPanelOpen, setStockPanelOpen] = useState(false);
  const [stockBusq, setStockBusq]     = useState("");
  const [stockResultados, setStockResultados] = useState([]);
  const [stockBuscando, setStockBuscando] = useState(false);
  const [stockSel, setStockSel]       = useState(null); // producto elegido
  const [stockDelta, setStockDelta]   = useState("");
  const [stockNota, setStockNota]     = useState("");
  const [stockTipo, setStockTipo]     = useState("compra_manual"); // "compra_manual" | "factura_proveedor" | "ajuste"
  const [stockGuardando, setStockGuardando] = useState(false);
  const [stockMsg, setStockMsg]       = useState(null);

  const abrirStock = () => {
    if (unlocked) setStockPanelOpen(true);
    else { setPinTarget("stock"); setPinOpen(true); }
  };

  const buscarProductoStock = async (q) => {
    setStockBusq(q);
    setStockSel(null);
    if (!q.trim()) { setStockResultados([]); return; }
    setStockBuscando(true);
    const { data, error } = await supabase
      .from("productos")
      .select("id, sku, nombre, stock")
      .or(`sku.ilike.%${q}%,nombre.ilike.%${q}%`)
      .order("nombre")
      .limit(20);
    setStockBuscando(false);
    if (error) { console.error(error); return; }
    setStockResultados(data || []);
  };

  const registrarMovimientoStock = async () => {
    const cantidad = parseInt(stockDelta, 10);
    if (!stockSel || !cantidad) return;
    setStockGuardando(true);
    setStockMsg(null);
    const { data, error } = await supabase.rpc("registrar_movimiento_stock", {
      p_sku: stockSel.sku,
      p_delta: cantidad,
      p_tipo: stockTipo,
      p_nota: stockNota || null,
    });
    setStockGuardando(false);
    if (error) {
      console.error(error);
      setStockMsg({ ok: false, texto: "No se pudo registrar el movimiento." });
      return;
    }
    setStockMsg({ ok: true, texto: `Stock actualizado: ${stockSel.nombre} → ${data} unidades` });
    setStockSel(s => s ? { ...s, stock: data } : s);
    setStockDelta(""); setStockNota("");
  };

  // ── VENTAS Y GANANCIA REAL (protegido con la misma clave) ──────────
  // Junta ventas de Mercado Libre (filas planas en "ventas") y ventas
  // físicas del cotizador ("ventas" + "venta_items") de los últimos 30
  // días, y calcula la ganancia real total (no el precio de lista).
  const [ventasPanelOpen, setVentasPanelOpen] = useState(false);
  const [ventasLoading, setVentasLoading]     = useState(false);
  const [ventasResumen, setVentasResumen]     = useState(null);
  const [ventasLista, setVentasLista]         = useState([]);

  const abrirVentas = () => {
    if (unlocked) { setVentasPanelOpen(true); cargarVentas(); }
    else { setPinTarget("ventas"); setPinOpen(true); }
  };

  const cargarVentas = async () => {
    setVentasLoading(true);
    const desde = new Date(); desde.setDate(desde.getDate() - 30);
    const desdeISO = desde.toISOString();

    const [{ data: ml, error: errMl }, { data: fis, error: errFis }] = await Promise.all([
      supabase.from("ventas")
        .select("id,fecha,nombre,cantidad,monto_total_venta,ganancia_real")
        .eq("canal", "mercado_libre")
        .gte("fecha", desdeISO)
        .order("fecha", { ascending: false })
        .limit(300),
      supabase.from("ventas")
        .select("fecha,cliente,venta_items(id,nombre,cantidad,monto_total,ganancia_real)")
        .eq("canal", "cotizador")
        .gte("fecha", desdeISO)
        .order("fecha", { ascending: false })
        .limit(200),
    ]);
    if (errMl) console.error("Error cargando ventas ML:", errMl);
    if (errFis) console.error("Error cargando ventas físicas:", errFis);

    const filasMl = (ml || []).map(v => ({
      id: v.id, tabla: "ventas",
      fecha: v.fecha, canal: "Mercado Libre", nombre: v.nombre,
      cantidad: v.cantidad, monto: v.monto_total_venta, ganancia: v.ganancia_real,
    }));
    const filasFis = (fis || []).flatMap(v =>
      (v.venta_items || []).map(it => ({
        id: it.id, tabla: "venta_items",
        fecha: v.fecha, canal: "Local", nombre: it.nombre,
        cantidad: it.cantidad, monto: it.monto_total, ganancia: it.ganancia_real,
      }))
    );
    const todas = [...filasMl, ...filasFis].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const totalVentas   = todas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
    const conGanancia   = todas.filter(f => f.ganancia !== null && f.ganancia !== undefined);
    const totalGanancia = conGanancia.reduce((s, f) => s + Number(f.ganancia), 0);

    setVentasLista(todas.slice(0, 80));
    setVentasResumen({
      totalVentas, totalGanancia,
      cantidad: todas.length,
      sinGanancia: todas.length - conGanancia.length,
    });
    setVentasLoading(false);
  };

  // Borra un movimiento de venta (fila de "ventas" si es de Mercado Libre,
  // o fila de "venta_items" si es de una venta física del cotizador).
  // Requiere que la tabla tenga una policy de RLS que permita DELETE.
  const borrarMovimiento = async (row) => {
    if (!window.confirm(`¿Borrar este movimiento?\n\n${row.nombre || "(sin nombre)"} · ${ARS(row.monto || 0)}\n\nEsta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from(row.tabla).delete().eq("id", row.id);
    if (error) { alert("No se pudo borrar: " + error.message); return; }
    await cargarVentas();
  };

  // ── SOCIOS / REPARTO (protegido con la misma clave) ─────────────────
  // Lee la vista "v_reparto_socios" ya armada en Supabase: ganancia de
  // contenedor1 asignada a cada socio, menos los gastos que le cargaron.
  const [sociosPanelOpen, setSociosPanelOpen] = useState(false);
  const [sociosLoading, setSociosLoading]     = useState(false);
  const [reparto, setReparto]                 = useState([]);

  const abrirSocios = () => {
    if (unlocked) { setSociosPanelOpen(true); cargarReparto(); }
    else { setPinTarget("socios"); setPinOpen(true); }
  };

  const cargarReparto = async () => {
    setSociosLoading(true);
    const { data, error } = await supabase.from("v_reparto_socios").select("*");
    if (error) console.error("Error cargando reparto de socios:", error);
    setReparto(data || []);
    setSociosLoading(false);
  };

  // ── FACTURAS DE PROVEEDOR / OCR (protegido con la misma clave) ─────
  const [facturasPanelOpen, setFacturasPanelOpen] = useState(false);
  const [facturasLoading, setFacturasLoading]     = useState(false);
  const [facturas, setFacturas]                   = useState([]);
  const [facturaSel, setFacturaSel]               = useState(null);

  const abrirFacturas = () => {
    if (unlocked) { setFacturasPanelOpen(true); cargarFacturas(); }
    else { setPinTarget("facturas"); setPinOpen(true); }
  };

  const cargarFacturas = async () => {
    setFacturasLoading(true);
    const { data, error } = await supabase
      .from("facturas_proveedor")
      .select("id,proveedor,numero_factura,fecha_factura,archivo_nombre,total_items,items_con_diferencia,estado,creado_en,productos_detectados")
      .order("creado_en", { ascending: false })
      .limit(50);
    if (error) console.error("Error cargando facturas:", error);
    setFacturas(data || []);
    setFacturasLoading(false);
  };

  const marcarFacturaRevisada = async (id) => {
    const { error } = await supabase.from("facturas_proveedor").update({ estado: "revisado" }).eq("id", id);
    if (error) { console.error(error); alert("No se pudo marcar como revisada."); return; }
    await cargarFacturas();
    setFacturaSel(f => (f && f.id === id) ? { ...f, estado: "revisado" } : f);
  };

  const cambiarFamilia = (f) => {
    setFamilia(f);
    setBusqueda("");
    setSubtab(SUBTAB_CFG[f]?.tabs[0] ?? null);
  };

  const subtabCfg = SUBTAB_CFG[familia];
  const subtabActual = subtab ?? subtabCfg?.tabs[0] ?? null;
  const [modal, setModal]       = useState(null);

  // ── GESTOR DE IMÁGENES ────────────────────────────────────────────
  const [imgOpen, setImgOpen]       = useState(false);
  const [imgOvr, setImgOvr]         = useState(() => {
    let fromStorage = {};
    try { fromStorage = JSON.parse(localStorage.getItem("img_overrides_v1")||"{}"); } catch {}
    // Scraped images (del scraper.py) + overrides manuales de localStorage
    return { ...(SCRAPED_IMAGES||{}), ...fromStorage };
  });
  const [imgSearchProd, setImgSP]   = useState(null);  // producto activo en el buscador
  const [imgSearching, setImgSrch]  = useState(false); // cargando búsqueda IA
  const [imgFound, setImgFound]     = useState([]);    // resultados encontrados
  const [imgManualUrl, setImgMUrl]  = useState("");    // input URL manual
  const [imgManualVid, setImgMVid]  = useState("");    // input video manual
  const [imgFilter, setImgFilter]   = useState("");    // filtro por nombre

  // Guarda overrides en localStorage
  const saveImgOvr = (next) => {
    setImgOvr(next);
    localStorage.setItem("img_overrides_v1", JSON.stringify(next));
  };

  // Retorna las imágenes reales de un producto (override > data)
  const getImages = (p) => {
    const ovrImages = imgOvr[p.id]?.images;
    return Array.isArray(ovrImages) && ovrImages.length > 0 ? ovrImages : (p.images || []);
  };
  const getVideos = (p) => {
    const ovrVideos = imgOvr[p.id]?.videos;
    return Array.isArray(ovrVideos) && ovrVideos.length > 0 ? ovrVideos : (p.videos || []);
  };

  // Agrega una imagen confirmada
  const addImg = (pid, url) => {
    const cur = imgOvr[pid] || { images: [], videos: [] };
    if (cur.images.includes(url)) return;
    saveImgOvr({ ...imgOvr, [pid]: { ...cur, images: [...cur.images, url] } });
  };

  // Elimina una imagen
  const removeImg = (pid, url) => {
    const cur = imgOvr[pid] || { images: [], videos: [] };
    saveImgOvr({ ...imgOvr, [pid]: { ...cur, images: cur.images.filter(u => u !== url) } });
  };

  // Agrega un video
  const addVid = (pid, url) => {
    const cur = imgOvr[pid] || { images: [], videos: [] };
    if (cur.videos.includes(url)) return;
    saveImgOvr({ ...imgOvr, [pid]: { ...cur, videos: [...cur.videos, url] } });
  };

  // Elimina un video
  const removeVid = (pid, url) => {
    const cur = imgOvr[pid] || { images: [], videos: [] };
    saveImgOvr({ ...imgOvr, [pid]: { ...cur, videos: cur.videos.filter(u => u !== url) } });
  };

  // Búsqueda automática de imágenes con IA
  const buscarImagenes = async (p) => {
    setImgSrch(true);
    setImgFound([]);
    const info = PROVEEDORES_INFO[p.proveedor] || {};
    const prompt = `Buscá imágenes del producto con código "${p.id}" llamado "${p.nombre}" del proveedor "${p.proveedor}" (web: ${info.web||""}). 
Necesito URLs directas de imágenes (.jpg, .png, .webp) del producto.
Buscá en el sitio del proveedor y también en distribuidores.
Respondé ÚNICAMENTE con un JSON válido así: {"images":["url1","url2"],"videos":["yturl1"]}
Sin texto adicional, sin markdown, solo el JSON.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          tools:[{"type":"web_search_20250305","name":"web_search"}],
          messages:[{ role:"user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "";
      const clean = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(clean);
      setImgFound(parsed);
    } catch(e) {
      setImgFound({ images:[], videos:[], error:"No se encontraron resultados automáticos. Pegá las URLs manualmente." });
    }
    setImgSrch(false);
  };
  const [editando, setEditando] = useState(null);
  const [cfgOpen, setCfgOpen]   = useState(false);

  // ── STOCK DE COMPRAS (monstertrail accesorios / Abril 2026) ─────────────────────
  // Facturas: 5712, 5725, 5726, 5727, 5728
  // Cotizaciones: 36202, 36203, 36204, 36205
  // Todas las cantidades van a "deposito"
  const STOCK_COMPRAS_ABR2026 = {
    // ── Factura 5712 (17/04) · Fundas Coversax ──────────────────────
    "6601923-9999": 1,  // Línea Confort Negro
    "6603923-9999": 1,  // Línea Luxury Negro
    "8032923-9999": 1,  // Línea Racing Negro
    "6605923-9999": 1,  // Línea Raptor Negro
    // ── Factura 5725 (21/04) · Defensas + Barras ────────────────────
    "160FF":   1,  // Lona Flashcover Amarok D/C
    "DBN101":  1,  // Defensa Baja Negra Ford Ranger 12→
    "DBN118":  1,  // Defensa Baja Negra VW Amarok
    "DBN115":  1,  // Defensa Baja Negra Toyota Hilux 21→
    "DBN102":  1,  // Defensa Baja Negra Chevrolet S10
    "DBI617":  1,  // Defensa Baja Inox Ford Ranger 23→
    "DBI615":  1,  // Defensa Baja Inox Toyota Hilux/SW4 21→
    "DBI602":  1,  // Defensa Baja Inox Chevrolet S10
    "BPN610":  1,  // Barra Extreme Plus Negra Ford Ranger DC
    "BPN601":  1,  // Barra Extreme Plus Negra VW Amarok
    "BPN606":  1,  // Barra Extreme Plus Negra Toyota Hilux DC
    "BPN604":  1,  // Barra Extreme Plus Negra Chevrolet S10 DC
    "BPI510":  1,  // Barra Extreme Plus Inox Ford Ranger DC
    "BPI506":  1,  // Barra Extreme Plus Inox Toyota Hilux DC
    // ── Factura 5726 (21/04) · Estribos ────────────────────────────
    "EBW000":  6,  // Estribos Blacktrend Wild (×6)
    "EOP000":  1,  // Estribos Optimus natural
    "ESG000":  2,  // Estribos Strong natural (×2)
    "EIM000":  1,  // Estribos Impactus natural
    "EBT000":  2,  // Estribos Blacktrend acero (×2)
    "SEA159":  1,  // Soportes Blacktrend Frontier/Alaskan
    // ── Factura 5727 (21/04) · Tapas ───────────────────────────────
    "TAPTT1009": 1, // Tapa Top Tiger Ford Ranger 2012-2022
    "TAPTT1006": 1, // Tapa Top Tiger Ford Ranger Limited 23→
    "TAPTT1001": 1, // Tapa Top Tiger Ford Ranger XL/XLT/XLS/Raptor 23→
    "TAPTT1003": 1, // Tapa Top Tiger VW Amarok D/D
    "TAPTT1007": 1, // Tapa Top Tiger VW Amarok V6 Extreme
    "TAPTT1004": 1, // Tapa Top Tiger Toyota Hilux 16+
    "TAPTT1010": 1, // Tapa Top Tiger Chevrolet S10 DC
    "TAPTT1008": 1, // Tapa Top Tiger Nissan Frontier 22→
    "TAPTT1014": 1, // Tapa Top Tiger Fiat Titano 25→
    "KTT12":   2,  // Tapa Tricover Ford Ranger 23+ (×2)
    "KTT2":    1,  // Tapa Tricover Toyota Hilux
    "KTP13":   1,  // Tapa Kraken Ford Ranger Limited 23+
    // ── Factura 5728 (21/04) · Antirrobo + Lomos ───────────────────
    "N.096.0": 1,  // Kit Antirrobo Ford Ranger 2012-2023
    "L.120.0": 2,  // Kit Antirrobo Ford Ranger XL/XLS/XLT/V6 23-25 (×2)
    "L.114.0": 1,  // Kit Antirrobo VW Amarok Comfortline/Highline
    "C.078.0": 2,  // Kit Antirrobo VW Amarok Trendline/Comfortline (×2)
    "B965C":   1,  // Lomo Lateral Chevrolet S10 2012+
    "B995A":   1,  // Lomo Lateral Nissan Frontier 2022+
    "B967B":   1,  // Lomo Portón Ford Ranger 2013+
    "B960D":   1,  // Lomo Portón Toyota Hilux 16+
    "B965B":   1,  // Lomo Portón Chevrolet S10 2012+
    "B995B":   1,  // Lomo Portón Nissan Frontier 2022+
    // ── Cotización 36202 (21/04) · Lonas + Cobertores ──────────────
    "179FF":   1,  // Lona Flashcover Ford Ranger DC 2013+ Limited
    "650FF":   1,  // Lona Flashcover Ford Ranger Limited 2023+
    "646FF":   1,  // Lona Flashcover Ford Ranger 2023+
    "203FF":   1,  // Lona Flashcover VW Amarok V6 Extreme
    "194FF":   1,  // Lona Flashcover Toyota Hilux DC 2016+
    "174FF":   1,  // Lona Flashcover Chevrolet S10 DC 2012+
    "634FF":   1,  // Lona Flashcover Nissan Frontier 2022+
    "637FF":   1,  // Lona Flashcover Fiat Titano 2025+
    "334N":    1,  // Cobertor Proform Ford Ranger DC B/P 2023+
    "501":     1,  // Cobertor Proform VW Amarok DC B/P
    "120N":    1,  // Cobertor Proform Toyota Hilux DC B/P 2016+
    "211N":    1,  // Cobertor Proform Nissan Frontier DC B/P 2022+
    // ── Cotización 36203 (21/04) · Estribos + Soportes ─────────────
    "EBWL001": 1,  // Estribos Blacktrend Wild Chevrolet Silverado
    "EOPN000": 1,  // Estribos Optimus Negro
    "ESGN000": 1,  // Estribos Strong Negro
    "EIMN000-N": 1,// Estribos Impactus Negro
    "SEA054":  1,  // Soporte VW Amarok 10→
    "SEA058":  1,  // Soporte Toyota Hilux 16→
    "SEA057":  1,  // Soporte Ford Ranger DC 23→
    "SEA059":  1,  // Soporte Nissan Frontier/Alaskan
    "SEA050":  1,  // Soporte Hilux DC 05-15
    "SEA051":  1,  // Soporte Optimus Ford Ranger 00-11
    "SEA063":  1,  // Soporte Fiat Titano CD 25→
    "SEA056":  1,  // Soporte Ford Ranger DC 12-22
    "SEA154":  1,  // Soporte Blacktrend VW Amarok 10→
    "SEA158":  1,  // Soporte Blacktrend Toyota Hilux DC 16→
    "SEA155":  1,  // Soporte Blacktrend Chevrolet S10 DC 12→
    "SEA157":  1,  // Soporte Blacktrend Ford Ranger CD 23→
    "SEA161":  1,  // Soporte Blacktrend RAM Rampage 24→
    "SEA163":  1,  // Soporte Blacktrend Fiat Titano CD 25→
    "SEA160":  1,  // Soporte Blacktrend Fiat Toro CD 16→
    "SEA162":  1,  // Soporte Blacktrend Silverado CD 25→
    // ── Cotización 36204 (21/04) · Tapas Kraken ────────────────────
    "KTP12":   2,  // Tapa Kraken Ford Ranger 2023+ (×2)
    "KTP1":    1,  // Tapa Kraken VW Amarok DC
    "KTP7":    1,  // Tapa Kraken VW Amarok V6 Extreme
    "KTP2":    1,  // Tapa Kraken Toyota Hilux
    "KTP11":   1,  // Tapa Kraken Nissan Frontier 2022+
    "KTP17":   1,  // Tapa Kraken Fiat Toro
    "KTP15":   1,  // Tapa Kraken Dodge RAM Rampage
    // ── Cotización 36205 (21/04) · Antirrobo + Lomos ───────────────
    "L.116.0": 2,  // Kit Antirrobo Toyota Hilux SR/SRV/SRX/GR4 (×2)
    "N.118.0": 1,  // Kit Antirrobo Chevrolet S10 LS/LT/LTZ
    "N.101.0": 1,  // Kit Antirrobo Nissan Frontier
    "N.086.0": 1,  // Kit Antirrobo Fiat Titano
    "N.150.0": 1,  // Kit Antirrobo Ford F-150 Raptor
    "N.111.0": 1,  // Kit Antirrobo RAM 1500 2025+
    "B962C":   1,  // Lomo Lateral VW Amarok
    "B960C":   1,  // Lomo Lateral Toyota Hilux 2016+
  };

  // Persistencia stock en localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem("stock_v1");
      const yaImportado = localStorage.getItem("stock_import_20260421");
      const stockActual = s ? JSON.parse(s) : {};

      if (!yaImportado) {
        // Primera vez: sumamos el stock de las facturas/cotizaciones de abril 2026
        const merged = { ...stockActual };
        Object.entries(STOCK_COMPRAS_ABR2026).forEach(([id, qty]) => {
          const curr = merged[id] || { royriff: 0, deposito: 0 };
          merged[id] = { ...curr, deposito: curr.deposito + qty };
        });
        setStock(merged);
        localStorage.setItem("stock_v1", JSON.stringify(merged));
        localStorage.setItem("stock_import_20260421", "1");
      } else {
        setStock(stockActual);
      }
    } catch(e) {}
  }, []);
  const saveStock = useCallback((next) => {
    setStock(next);
    try { localStorage.setItem("stock_v1", JSON.stringify(next)); } catch(e){}
  }, []);

  // ── LINKS INDIVIDUALES POR PRODUCTO ─────────────────────────────
  // Al abrir/cerrar modal: actualizar URL
  const abrirModal = useCallback((p) => {
    setModal(p);
    window.history.pushState({}, "", "?p=" + encodeURIComponent(p.id));
  }, []);
  const cerrarModal = useCallback(() => {
    setModal(null);
    window.history.pushState({}, "", window.location.pathname);
  }, []);

  // Al cargar la página: detectar ?p= y abrir ese producto
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("p");
    if(pid) {
      const prod = PRODUCTOS.find(p => p.id === pid);
      if(prod) {
        // Navegar a la familia correcta
        setFamilia(prod.familia);
        setSubtab(SUBTAB_CFG[prod.familia]?.tabs[0] ?? null);
        setTimeout(() => setModal(prod), 100);
      }
    }
  }, []);

  const getStk = (id) => stock[id] || { royriff:0, deposito:0 };
  const updStk = (id, loc, val) => {
    const next = { ...stock, [id]: { ...getStk(id), [loc]: Math.max(0, parseInt(val)||0) } };
    saveStock(next);
  };
  const totalStk = (id) => { const s=getStk(id); return s.royriff + s.deposito; };

  // ── COTIZADOR LÓGICA ──────────────────────────────────────────────
  const agregarACot = (p) => {
    setCotItems(prev => {
      const existe = prev.find(i => i.id === p.id);
      if (existe) return prev.map(i => i.id===p.id ? {...i, qty: i.qty+1} : i);
      const { venta } = (() => { const cfg=getCfg(p.proveedor,p.familia); const desc=getDesc(p); const {venta}=calcular(p.listaVenta,desc,cfg.iva,cfg.markup); return {venta}; })();
      return [...prev, { ...p, qty:1, descItem:0, precioBase:venta }];
    });
    // re-detectar combos
    setTimeout(() => {
      setCotItems(items => { setCotCombo(detectarCombos(items)); return items; });
    }, 0);
    setCotOpen(true);
    setCotBusq("");
  };

  const quitarDeCot = (id) => {
    setCotItems(prev => { const n=prev.filter(i=>i.id!==id); setCotCombo(detectarCombos(n)); return n; });
  };

  const updCotQty = (id, qty) => {
    setCotItems(prev => prev.map(i => i.id===id ? {...i, qty: Math.max(1,parseInt(qty)||1)} : i));
  };

  const updCotDescItem = (id, v) => {
    setCotItems(prev => prev.map(i => i.id===id ? {...i, descItem: parseFloat(v)||0} : i));
  };

  const toggleCombo = (comboId) => {
    setCotCombo(prev => prev.map(c => c.id===comboId ? {...c, aplicado:!c.aplicado} : c));
  };

  // Recalcular totales cotización
  const cotTotales = useMemo(() => {
    let subtotal = 0;
    const lineas = cotItems.map(item => {
      const base = item.precioBase;
      const conDescItem = base * (1 - item.descItem/100);
      const total = conDescItem * item.qty;
      subtotal += total;
      return { ...item, precioFinal: conDescItem, total };
    });

    // descuento combos aplicados
    const descCombos = cotComboAct
      .filter(c => c.aplicado)
      .reduce((acc, c) => acc + c.descuento, 0);

    const descTotal = Math.min(cotDescGlobal + descCombos, 100);
    const totalEF = subtotal * (1 - descTotal/100);
    const cuota = totalEF * cuotas.multiplicador / cuotas.cant;

    return { lineas, subtotal, descTotal, totalEF, cuota };
  }, [cotItems, cotDescGlobal, cotComboAct, cuotas]);

  // Monto final de la venta segun la forma de pago elegida para ESTA cotizacion
  // (efectivo = totalEF, o el total financiado del plan de cuotas elegido)
  const cotMontoFinal = useMemo(() => {
    if (cotFormaPago === "efectivo") return cotTotales.totalEF;
    const plan = CUOTAS_MP.find(c => String(c.cant) === cotFormaPago);
    return plan ? cotTotales.totalEF * plan.multiplicador : cotTotales.totalEF;
  }, [cotFormaPago, cotTotales.totalEF]);

  // Comision del vendedor elegido, segun la forma de pago de esta cotizacion
  const cotVendedor = vendedores.find(v => v.id === cotVendedorId) || null;
  const cotComisionPct = cotVendedor ? (cotVendedor.comisiones?.[cotFormaPago] ?? 0) : 0;
  const cotComisionMonto = cotMontoFinal * cotComisionPct / 100;

  // Guarda la venta directo en Supabase: una fila en "ventas" + una fila por
  // producto en "venta_items".
  const guardarVenta = async () => {
    if (cotItems.length === 0) return;
    setGuardando(true);
    setGuardadoMsg(null);

    const formaPagoLabel = FORMAS_PAGO.find(f => f.key === cotFormaPago)?.label || cotFormaPago;

    try {
      // Trae el costo real de cada producto vendido (tabla "productos", columna
      // costo_base) para poder calcular la ganancia real de la venta física,
      // igual que ya se hace para las ventas de Mercado Libre.
      const skusVenta = [...new Set(cotTotales.lineas.map(i => i.id))];
      const { data: costos, error: errCostos } = await supabase
        .from("productos")
        .select("sku, costo_base")
        .in("sku", skusVenta);
      if (errCostos) console.error("No se pudo traer el costo de los productos (la venta se guarda igual, sin ganancia calculada)", errCostos);
      const costoPorSku = Object.fromEntries((costos || []).map(p => [p.sku, p.costo_base]));

      const { data: venta, error: errVenta } = await supabase
        .from("ventas")
        .insert({
          fecha: new Date().toISOString(),
          canal: "cotizador",
          cliente: cotNombre || null,
          vendedor_id: cotVendedor ? cotVendedor.id : null,
          forma_pago: formaPagoLabel,
          comision_vendedor_pct: cotComisionPct,
          comision_vendedor_monto: cotComisionMonto,
          subtotal: cotTotales.subtotal,
          total: cotMontoFinal,
        })
        .select("id")
        .single();
      if (errVenta) throw errVenta;

      const items = cotTotales.lineas.map(i => {
        const costoUnitario = costoPorSku[i.id] ?? null;
        const costoTotal = costoUnitario !== null ? costoUnitario * i.qty : null;
        // Ganancia real del item = lo que efectivamente entró (sin comisión de
        // ML, no aplica en local) menos el costo real del proveedor. La
        // comisión del vendedor ya queda registrada aparte, en la cabecera
        // de la venta (comision_vendedor_monto).
        const gananciaReal = costoTotal !== null ? i.total - costoTotal : null;
        return {
          venta_id: venta.id,
          sku: i.id,
          nombre: i.nombre,
          cantidad: i.qty,
          precio_unitario: i.precioFinal,
          monto_total: i.total,
          comision_ml: 0,
          costo_envio: 0,
          monto_neto_recibido: i.total,
          costo_unitario: costoUnitario,
          ganancia_real: gananciaReal,
          metodo_match: costoUnitario !== null ? "sku_exacto" : "sin_match",
          alerta: costoUnitario === null ? "No se encontró costo para este SKU en productos" : null,
        };
      });
      const { error: errItems } = await supabase.from("venta_items").insert(items);
      if (errItems) throw errItems;

      // Descuenta stock por cada producto vendido (si el SKU todavia no esta
      // cargado en la tabla "productos", la funcion no hace nada y no rompe
      // el guardado de la venta).
      for (const i of cotTotales.lineas) {
        supabase.rpc("registrar_movimiento_stock", {
          p_sku: i.id,
          p_delta: -Math.abs(i.qty),
          p_tipo: "venta",
          p_referencia: venta.id,
        }).then(({ error }) => { if (error) console.error("Stock no descontado para", i.id, error); });
      }

      setGuardadoMsg({ ok: true, texto: "Venta guardada ✓" });
    } catch (err) {
      console.error(err);
      setGuardadoMsg({ ok: false, texto: "No se pudo guardar (revisá la conexión con Supabase)" });
    } finally {
      setGuardando(false);
      setTimeout(() => setGuardadoMsg(null), 4000);
    }
  };

  const cotBusqRes = useMemo(() => {
    if (!cotBusq.trim()) return [];
    const q = cotBusq.toLowerCase();
    return PRODUCTOS
      .filter(p => p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || p.compat.toLowerCase().includes(q))
      .slice(0, 8);
  }, [cotBusq]);

  const familias = useMemo(()=>[...new Set(PRODUCTOS.map(p=>p.familia))],[]);
  const key = (prov,fam) => `${prov}|${fam}`;
  const getCfg = (prov,fam) => config[key(prov,fam)] || {descuento:0,iva:0,markup:0};
  const updCfg = (prov,fam,f,v) => setConfig(p=>({...p,[key(prov,fam)]:{...getCfg(prov,fam),[f]:parseFloat(v)||0}}));

  const getDesc = p => overrides[p.id] !== undefined ? overrides[p.id]
                    : p.descuentoOverride !== undefined ? p.descuentoOverride
                    : getCfg(p.proveedor,p.familia).descuento;

  const getPrecios = p => {
    const cfg = getCfg(p.proveedor,p.familia);
    const desc = getDesc(p);
    const {venta} = calcular(p.listaVenta, desc, cfg.iva, cfg.markup);
    const cuota = venta * cuotas.multiplicador / cuotas.cant;
    return {venta, cuota, desc};
  };

  const filtrados = useMemo(()=>{
    if(busqueda.trim()){
      // Divide la búsqueda en palabras y busca que estén TODAS presentes
      const palabras = busqueda.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const match = p => {
        const texto = [p.id, p.nombre, p.compat, ...(p.specs||[])].join(" ").toLowerCase();
        return palabras.every(pal => texto.includes(pal));
      };
      // Por defecto busca dentro de la pestaña activa
      if(!busqGlobal){
        // Al buscar dentro de la pestaña, muestra todos los sub-tabs
        return PRODUCTOS.filter(p=>p.familia===familia && match(p));
      }
      // Si eligió búsqueda global, busca en todo
      return PRODUCTOS.filter(match);
    }
    let res = PRODUCTOS.filter(p=>p.familia===familia);
    if(subtabActual && SUBTAB_CFG[familia]) {
      res = res.filter(p => SUBTAB_CFG[familia].fn(p) === subtabActual);
    }
    return res;
  },[familia,busqueda,busqGlobal,subtabActual]);

  const proveedores = useMemo(()=>[...new Set(filtrados.map(p=>p.proveedor))],[filtrados]);

  return (
    <div className="app">

      {/* MODAL PIN */}
      {pinOpen && (
        <PinModal
          pinTarget={pinTarget} pinInput={pinInput} setPinInput={setPinInput}
          pinError={pinError} setPinError={setPinError} handlePin={handlePin}
          onClose={()=>{setPinOpen(false);setPinInput("");setPinError(false);setPinTarget(null);}}
        />
      )}

      <TopBar
        busqueda={busqueda} setBusqueda={setBusqueda} setBusqGlobal={setBusqGlobal}
        cfgOpen={cfgOpen} setCfgOpen={setCfgOpen} setImgOpen={setImgOpen} setImgSP={setImgSP}
        setCotOpen={setCotOpen} cotItems={cotItems}
        abrirVendedores={abrirVendedores} abrirStock={abrirStock} abrirVentas={abrirVentas}
        abrirSocios={abrirSocios} abrirFacturas={abrirFacturas}
        unlocked={unlocked} setUnlocked={setUnlocked} setPinOpen={setPinOpen}
        cuotas={cuotas} setCuotas={setCuotas}
        familias={familias} familia={familia} cambiarFamilia={cambiarFamilia}
        subtabCfg={subtabCfg} subtabActual={subtabActual} setSubtab={setSubtab}
      />

      <ProductGrid
        busqueda={busqueda} setBusqueda={setBusqueda} busqGlobal={busqGlobal} setBusqGlobal={setBusqGlobal}
        familia={familia} filtrados={filtrados} proveedores={proveedores}
        getCfg={getCfg} updCfg={updCfg} unlocked={unlocked} getPrecios={getPrecios} cuotas={cuotas}
        overrides={overrides} setOvr={setOvr} editando={editando} setEditando={setEditando}
        getImages={getImages} editStock={editStock} setEditStk={setEditStk}
        getStk={getStk} updStk={updStk} totalStk={totalStk}
        abrirModal={abrirModal} agregarACot={agregarACot} cotItems={cotItems}
      />

      {/* MODAL */}
      {modal && (
        <ProductModal
          modal={modal} cerrarModal={cerrarModal} getPrecios={getPrecios} getCfg={getCfg}
          unlocked={unlocked} cuotas={cuotas} getStk={getStk} updStk={updStk} totalStk={totalStk}
        />
      )}

      {/* ── PANEL GESTOR DE IMÁGENES ──────────────────────────────── */}
      {imgOpen && (
        <ImageManagerPanel
          imgOvr={imgOvr} saveImgOvr={saveImgOvr} getImages={getImages} getVideos={getVideos}
          imgFilter={imgFilter} setImgFilter={setImgFilter}
          imgSearchProd={imgSearchProd} setImgSP={setImgSP}
          imgFound={imgFound} setImgFound={setImgFound} imgSearching={imgSearching} buscarImagenes={buscarImagenes}
          imgManualUrl={imgManualUrl} setImgMUrl={setImgMUrl} imgManualVid={imgManualVid} setImgMVid={setImgMVid}
          addImg={addImg} removeImg={removeImg} addVid={addVid} removeVid={removeVid}
          onClose={()=>{setImgOpen(false);setImgSP(null);}}
        />
      )}

      {/* ── PANEL COTIZADOR ─────────────────────────────────────── */}
      {cotOpen && (
        <CotizadorPanel
          onClose={()=>setCotOpen(false)}
          cotBusq={cotBusq} setCotBusq={setCotBusq} cotBusqRes={cotBusqRes} agregarACot={agregarACot}
          cotItems={cotItems} setCotItems={setCotItems} cotTotales={cotTotales}
          quitarDeCot={quitarDeCot} updCotQty={updCotQty} updCotDescItem={updCotDescItem}
          cotComboAct={cotComboAct} setCotCombo={setCotCombo} toggleCombo={toggleCombo}
          cotNombre={cotNombre} setCotNombre={setCotNombre}
          cotDescGlobal={cotDescGlobal} setCotDG={setCotDG}
          cotVendedorId={cotVendedorId} setCotVendedorId={setCotVendedorId} vendedores={vendedores}
          cotFormaPago={cotFormaPago} setCotFormaPago={setCotFormaPago}
          cotVendedor={cotVendedor} cotComisionPct={cotComisionPct} cotComisionMonto={cotComisionMonto}
          cuotas={cuotas} setCuotas={setCuotas}
          guardadoMsg={guardadoMsg} guardando={guardando} guardarVenta={guardarVenta}
        />
      )}

      {/* ── PANEL VENDEDORES Y COMISIONES (protegido con clave) ────── */}
      {vendPanelOpen && unlocked && (
        <VendedoresPanel
          vendEditId={vendEditId} setVendEditId={setVendEditId}
          vendForm={vendForm} setVendForm={setVendForm}
          guardarVendedor={guardarVendedor} vendGuardando={vendGuardando}
          vendedores={vendedores} borrarVendedor={borrarVendedor}
          FORMAS_PAGO={FORMAS_PAGO} nuevoVendedorForm={nuevoVendedorForm}
          onClose={()=>{setVendPanelOpen(false);setVendEditId(null);setVendForm(null);}}
        />
      )}

      {/* ── PANEL STOCK (protegido con clave) ───────────────────────── */}
      {stockPanelOpen && unlocked && (
        <StockPanel
          stockBusq={stockBusq} buscarProductoStock={buscarProductoStock}
          stockBuscando={stockBuscando} stockResultados={stockResultados}
          stockSel={stockSel} setStockSel={setStockSel}
          setStockBusq={setStockBusq} setStockResultados={setStockResultados}
          stockTipo={stockTipo} setStockTipo={setStockTipo}
          stockDelta={stockDelta} setStockDelta={setStockDelta}
          stockNota={stockNota} setStockNota={setStockNota}
          registrarMovimientoStock={registrarMovimientoStock}
          stockGuardando={stockGuardando} stockMsg={stockMsg}
          onClose={()=>{setStockPanelOpen(false);setStockSel(null);setStockBusq("");setStockResultados([]);setStockMsg(null);}}
        />
      )}

      {/* ── PANEL VENTAS Y GANANCIA REAL (protegido con clave) ──────── */}
      {ventasPanelOpen && unlocked && (
        <VentasPanel
          ventasLoading={ventasLoading} ventasResumen={ventasResumen} ventasLista={ventasLista}
          onClose={()=>setVentasPanelOpen(false)} onBorrar={borrarMovimiento}
        />
      )}

      {/* ── PANEL SOCIOS / REPARTO (protegido con clave) ────────────── */}
      {sociosPanelOpen && unlocked && (
        <SociosPanel
          sociosLoading={sociosLoading} reparto={reparto}
          onClose={()=>setSociosPanelOpen(false)}
        />
      )}

      {/* ── PANEL FACTURAS DE PROVEEDOR / OCR (protegido con clave) ─── */}
      {facturasPanelOpen && unlocked && (
        <FacturasPanel
          facturaSel={facturaSel} setFacturaSel={setFacturaSel}
          facturasLoading={facturasLoading} facturas={facturas}
          onClose={()=>{setFacturasPanelOpen(false);setFacturaSel(null);}}
          onMarcarRevisada={marcarFacturaRevisada}
        />
      )}
    </div>
  );
}
