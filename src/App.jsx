import { useState, useMemo, useEffect, useCallback } from "react";
import SCRAPED_IMAGES from "./scraped-images.js";
import { supabase } from "./supabaseClient.js";
import "./App.css";
import { PRODUCTOS } from "./data/productos.js";
import {
  CONFIG_INICIAL, PROVEEDORES_INFO, CUOTAS_MP, CUOTAS_DEFAULT,
  FORMAS_PAGO, SUBTAB_CFG, KIT_DEDUCCION,
} from "./data/catalogo.js";
import { ARS, calcular, getColorBadge } from "./utils.js";
import VendedoresPanel from "./components/VendedoresPanel.jsx";
import StockPanel from "./components/StockPanel.jsx";
import VentasPanel from "./components/VentasPanel.jsx";
import SociosPanel from "./components/SociosPanel.jsx";
import FacturasPanel from "./components/FacturasPanel.jsx";
import GastosPanel from "./components/GastosPanel.jsx";
import RadarPanel from "./components/RadarPanel.jsx";
import DashboardPanel from "./components/DashboardPanel.jsx";
import ControlProveedorPanel from "./components/ControlProveedorPanel.jsx";
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

  // ── COSTO REAL (Supabase) para el precio local ──────────────────────
  // El precio local ya no arranca del "listaVenta" fijo del catálogo --
  // arranca de costo_base (el costo real, actualizado corriendo
  // pricing_todo.py). Los productos que todavía no tienen costo_base en
  // Supabase siguen usando listaVenta como respaldo (ver getPrecios).
  //
  // OJO: costo_base NO es el costo puro del proveedor -- ya le tiene
  // sumado un costo de envío pensado para Mercado Libre (ej. $80.000 para
  // tapas) más un costo operativo fijo ($2.500). Para el precio LOCAL hay
  // que restar esos dos antes de aplicar markup + el flete local de
  // $15.000 (si no, el envío de ML queda contado dos veces).
  const COSTO_OPERATIVO = 2500;
  const [costoBaseMap, setCostoBaseMap] = useState({}); // sku -> {costo_base, categoria}
  const [envioMlMap, setEnvioMlMap]     = useState({}); // categoria -> costo_envio (de Mercado Libre)
  useEffect(() => {
    supabase.from("productos").select("sku,costo_base,categoria").not("costo_base", "is", null)
      .then(({ data, error }) => {
        if (error) { console.error("No se pudo traer costo_base de Supabase:", error); return; }
        setCostoBaseMap(Object.fromEntries((data || []).map(p => [p.sku, { costoBase: p.costo_base, categoria: p.categoria }])));
      });
    supabase.from("configuracion_precios").select("categoria,costo_envio")
      .then(({ data, error }) => {
        if (error) { console.error("No se pudo traer costo_envio de Supabase:", error); return; }
        setEnvioMlMap(Object.fromEntries((data || []).map(c => [c.categoria, Number(c.costo_envio) || 0])));
      });
  }, []);

  // ── ACCESO INTERNO (PIN) ─────────────────────────────────────────
  // Dos niveles: admin (acceso total, único que puede borrar) y vendedor
  // (solo cargar ventas con precio editable + ver stock, de solo lectura).
  // Cada vendedor tiene su propia clave individual (columna "pin" en la
  // tabla vendedores, ver agregar_clave_individual_vendedores.sql) -- así
  // el sistema sabe directamente cuál vendedor entró, sin tener que
  // elegirlo del desplegable del cotizador.
  const ADMIN_PIN = "mt2026"; // clave de administrador (acceso total)

  // Paneles que exigen específicamente el rol admin (no alcanza con estar
  // logueado como vendedor). Todo lo que no está acá, cualquier rol
  // logueado lo puede abrir (hoy: solo "stock", en modo lectura para
  // vendedor -- ver StockPanel).
  const PANELES_SOLO_ADMIN = new Set([
    "vendedores", "ventas", "socios", "facturas", "gastos", "radar", "dashboard", "controlProveedor",
  ]);

  const [role, setRole]         = useState(null); // null | "vendedor" | "admin"
  const unlocked = role === "admin"; // alias: la mayoría del código ya usaba "unlocked" como "es admin"
  const logueado = role !== null;
  const [vendedorActivoId, setVendedorActivoId] = useState(null); // id del vendedor logueado (null si es admin o nadie)

  const [pinOpen,     setPinOpen]     = useState(false);
  const [pinInput,    setPinInput]    = useState("");
  const [pinError,    setPinError]    = useState(false);
  const [pinErrorMsg, setPinErrorMsg] = useState(null);

  const handlePin = () => {
    let nuevoRol = null;
    let vendedorId = null;

    if (pinInput === ADMIN_PIN) {
      nuevoRol = "admin";
    } else {
      const vendedorMatch = vendedores.find(v => v.pin && v.pin === pinInput);
      if (vendedorMatch) { nuevoRol = "vendedor"; vendedorId = vendedorMatch.id; }
    }

    if (!nuevoRol) {
      setPinError(true); setPinErrorMsg(null); setPinInput("");
      return;
    }

    if (PANELES_SOLO_ADMIN.has(pinTarget) && nuevoRol !== "admin") {
      // La clave es válida (queda logueado como vendedor) pero esta
      // sección puntual requiere admin.
      setRole(nuevoRol); setVendedorActivoId(vendedorId);
      setPinError(true); setPinErrorMsg("Esta sección es solo para administradores.");
      setPinInput("");
      return;
    }

    setRole(nuevoRol); setVendedorActivoId(vendedorId);
    setPinOpen(false); setPinInput(""); setPinError(false); setPinErrorMsg(null);
    // Si entró un vendedor (no admin), el cotizador ya arranca con su
    // propio nombre elegido -- no hace falta que lo busque del desplegable.
    if (vendedorId) setCotVendedorId(vendedorId);
    if (pinTarget === "vendedores") { setVendPanelOpen(true); }
    if (pinTarget === "stock") { setStockPanelOpen(true); }
    if (pinTarget === "ventas") { setVentasPanelOpen(true); cargarVentas(ventasDias); }
    if (pinTarget === "socios") { setSociosPanelOpen(true); cargarReparto(); }
    if (pinTarget === "facturas") { setFacturasPanelOpen(true); cargarFacturas(); }
    if (pinTarget === "gastos") { setGastosPanelOpen(true); cargarGastos(); }
    if (pinTarget === "radar") { setRadarPanelOpen(true); cargarRadar(); }
    if (pinTarget === "dashboard") { setDashboardPanelOpen(true); cargarDashboard(dashDias); }
    if (pinTarget === "controlProveedor") { setControlProveedorOpen(true); }
    if (pinTarget === "guardarVenta") { guardarVenta(); }
    setPinTarget(null);
  };
  const [familia, setFamilia]   = useState("Tapas Rígidas");
  const [subtab, setSubtab]     = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [busqGlobal, setBusqGlobal] = useState(false);

  // COTIZADOR
  const [cotOpen, setCotOpen]       = useState(false);
  const [cotItems, setCotItems]     = useState([]); // [{...producto, qty, descItem}]
  const [cotDescGlobal, setCotDG]   = useState(0);
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
      .select("id, nombre, activo, pin, vendedor_comisiones(forma_pago, porcentaje)")
      .eq("activo", true)
      .order("nombre");
    if (error) {
      console.error("Error cargando vendedores:", error);
    } else {
      setVend((data || []).map(v => ({
        id: v.id,
        nombre: v.nombre,
        pin: v.pin,
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
    pin: "",
    comisiones: Object.fromEntries(FORMAS_PAGO.map(f => [f.key, 0])),
  });

  const guardarVendedor = async () => {
    if (!vendForm?.nombre?.trim()) return;
    setVendGuardando(true);
    try {
      let vendedorId = vendEditId === "nuevo" ? null : vendEditId;
      const pin = vendForm.pin?.trim() || null;

      if (!vendedorId) {
        const { data, error } = await supabase
          .from("vendedores")
          .insert({ nombre: vendForm.nombre.trim(), pin })
          .select("id")
          .single();
        if (error) throw error;
        vendedorId = data.id;
      } else {
        const { error } = await supabase
          .from("vendedores")
          .update({ nombre: vendForm.nombre.trim(), pin })
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
      const esDuplicada = err?.code === "23505" || /vendedores_pin_unico/.test(err?.message || "");
      alert(esDuplicada
        ? "Esa clave ya la está usando otro vendedor -- elegí una distinta."
        : "No se pudo guardar el vendedor (revisá la conexión con Supabase).");
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
  const [stockUbicacion, setStockUbicacion] = useState("deposito"); // "deposito" | "royriff"
  const [stockGuardando, setStockGuardando] = useState(false);
  const [stockMsg, setStockMsg]       = useState(null);

  const abrirStock = () => {
    if (logueado) setStockPanelOpen(true);
    else { setPinTarget("stock"); setPinOpen(true); }
  };

  const buscarProductoStock = async (q) => {
    setStockBusq(q);
    setStockSel(null);
    if (!q.trim()) { setStockResultados([]); return; }
    setStockBuscando(true);
    const { data, error } = await supabase
      .from("productos")
      .select("id, sku, nombre, stock, stock_royriff, stock_deposito")
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
      p_ubicacion: stockUbicacion,
    });
    setStockGuardando(false);
    if (error) {
      console.error(error);
      setStockMsg({ ok: false, texto: "No se pudo registrar el movimiento." });
      return;
    }
    const etiquetaUbic = stockUbicacion === "royriff" ? "Royriff" : "Depósito";
    const campoUbic = stockUbicacion === "royriff" ? "stock_royriff" : "stock_deposito";
    setStockMsg({ ok: true, texto: `Stock actualizado (${etiquetaUbic}): ${stockSel.nombre} → ${data} unidades en total` });
    setStockSel(s => s ? { ...s, stock: data, [campoUbic]: Math.max((s[campoUbic] || 0) + cantidad, 0) } : s);
    setStockDelta(""); setStockNota("");
    await cargarStock();
  };

  // ── VENTAS Y GANANCIA REAL (protegido con la misma clave) ──────────
  // Junta ventas de Mercado Libre (filas planas en "ventas") y ventas
  // físicas del cotizador ("ventas" + "venta_items") de los últimos 30
  // días, y calcula la ganancia real total (no el precio de lista).
  const [ventasPanelOpen, setVentasPanelOpen] = useState(false);
  const [ventasLoading, setVentasLoading]     = useState(false);
  const [ventasResumen, setVentasResumen]     = useState(null);
  const [ventasLista, setVentasLista]         = useState([]);
  const [ventasDias, setVentasDias]           = useState(30); // 7 | 30 | 90 | 0 (todo)

  const abrirVentas = () => {
    if (unlocked) { setVentasPanelOpen(true); cargarVentas(ventasDias); }
    else { setPinTarget("ventas"); setPinOpen(true); }
  };

  const cambiarVentasDias = (dias) => {
    setVentasDias(dias);
    cargarVentas(dias);
  };

  const cargarVentas = async (dias = ventasDias) => {
    setVentasLoading(true);
    const desdeISO = dias > 0
      ? (() => { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString(); })()
      : "2000-01-01T00:00:00Z";

    const [{ data: ml, error: errMl }, { data: fis, error: errFis }] = await Promise.all([
      supabase.from("ventas")
        .select("id,fecha,sku,nombre,cantidad,monto_total_venta,monto_neto_recibido,comision_ml,costo_envio,costo_unitario_proveedor,ganancia_real,editado_manual,ajuste_monto,ajuste_descripcion")
        .eq("canal", "mercado_libre")
        .gte("fecha", desdeISO)
        .order("fecha", { ascending: false })
        .limit(300),
      supabase.from("ventas")
        .select("fecha,cliente,venta_items(id,nombre,cantidad,monto_total,monto_neto_recibido,comision_ml,costo_envio,costo_unitario,ganancia_real,editado_manual,ajuste_monto,ajuste_descripcion)")
        .eq("canal", "cotizador")
        .gte("fecha", desdeISO)
        .order("fecha", { ascending: false })
        .limit(200),
    ]);
    if (errMl) console.error("Error cargando ventas ML:", errMl);
    if (errFis) console.error("Error cargando ventas físicas:", errFis);

    // Para cada venta calculamos dos referencias que la pantalla usa al editar:
    //  - envioSugerido: el flete que tenemos configurado para esa categoría
    //    (configuracion_precios), que es el que se precarga en el formulario.
    //  - fleteReal: lo que Mercado Libre efectivamente descontó en la
    //    liquidación (venta - comisión - neto recibido), para que se vea si el
    //    envío salió más caro o más barato que el configurado.
    const filasMl = (ml || []).map(v => {
      const prod = costoBaseMap[v.sku] || {};
      const categoria = prod.categoria || null;
      const envioSugerido = envioMlMap[categoria] ?? envioMlMap["default"] ?? 20000;
      const fleteReal = (v.monto_total_venta != null && v.comision_ml != null && v.monto_neto_recibido != null)
        ? Math.round(v.monto_total_venta - v.comision_ml - v.monto_neto_recibido)
        : null;
      // costo_base de la tabla productos YA trae el flete sumado adentro. Como
      // acá el flete pasa a ser un campo propio, el costo de proveedor que se
      // ofrece es el del producto solo, sin flete -- si no, se restaría dos veces.
      const costoSinEnvio = prod.costoBase != null
        ? Math.round(prod.costoBase - envioSugerido)
        : null;
      return {
        id: v.id, tabla: "ventas", sku: v.sku, categoria,
        fecha: v.fecha, canal: "Mercado Libre", nombre: v.nombre,
        cantidad: v.cantidad, monto: v.monto_total_venta, ganancia: v.ganancia_real,
        recibido: v.monto_neto_recibido,
        comisionMl: v.comision_ml, costoEnvio: v.costo_envio, costoUnitario: v.costo_unitario_proveedor,
        envioSugerido, fleteReal, costoSinEnvio,
        editadoManual: v.editado_manual, ajusteMonto: v.ajuste_monto, ajusteDescripcion: v.ajuste_descripcion,
      };
    });
    const filasFis = (fis || []).flatMap(v =>
      (v.venta_items || []).map(it => ({
        id: it.id, tabla: "venta_items",
        fecha: v.fecha, canal: "Local", nombre: it.nombre,
        cantidad: it.cantidad, monto: it.monto_total, ganancia: it.ganancia_real,
        recibido: it.monto_neto_recibido,
        comisionMl: it.comision_ml, costoEnvio: it.costo_envio, costoUnitario: it.costo_unitario,
        editadoManual: it.editado_manual, ajusteMonto: it.ajuste_monto, ajusteDescripcion: it.ajuste_descripcion,
      }))
    );
    const todas = [...filasMl, ...filasFis].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const totalVentas   = todas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
    const conGanancia   = todas.filter(f => f.ganancia !== null && f.ganancia !== undefined);
    const totalGanancia = conGanancia.reduce((s, f) => s + Number(f.ganancia), 0);
    // Lo que realmente entró a la cuenta (venta - comisión - envío). Se suma
    // solo lo que tiene el dato cargado, para no mezclar filas sin liquidar.
    const conRecibido   = todas.filter(f => f.recibido !== null && f.recibido !== undefined);
    const totalRecibido = conRecibido.reduce((s, f) => s + Number(f.recibido), 0);

    setVentasLista(todas.slice(0, 80));
    setVentasResumen({
      totalVentas, totalGanancia, totalRecibido,
      cantidad: todas.length,
      sinGanancia: todas.length - conGanancia.length,
      sinRecibido: todas.length - conRecibido.length,
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

  // Edita a mano el costo de envío y el costo de proveedor de una venta
  // (fila de "ventas" si es de Mercado Libre, o de "venta_items" si es
  // física) y recalcula la ganancia real con esos valores. Queda marcada
  // como "editado_manual" para que la próxima sincronización de Mercado
  // Libre no la pise (ver permitir_editar_costos_venta.sql).
  const [editandoVentaId, setEditandoVentaId] = useState(null);
  const [editandoVentaGuardando, setEditandoVentaGuardando] = useState(false);

  const guardarEdicionVenta = async (row, nuevoCostoEnvio, nuevoCostoUnitario, nuevoAjusteMonto, nuevoAjusteDescripcion) => {
    setEditandoVentaGuardando(true);
    const costoEnvio = Number(nuevoCostoEnvio) || 0;
    const costoUnitario = Number(nuevoCostoUnitario) || 0;
    const ajusteMonto = Number(nuevoAjusteMonto) || 0;
    const ajusteDescripcion = (nuevoAjusteDescripcion || "").trim() || null;
    const costoTotalProveedor = costoUnitario * row.cantidad;
    const montoNetoRecibido = row.monto - (row.comisionMl || 0) - costoEnvio;
    const gananciaReal = montoNetoRecibido - costoTotalProveedor + ajusteMonto;

    const cambios = row.tabla === "ventas"
      ? {
          costo_envio: costoEnvio,
          costo_unitario_proveedor: costoUnitario,
          costo_total_proveedor: costoTotalProveedor,
          monto_neto_recibido: montoNetoRecibido,
          ganancia_real: gananciaReal,
          margen_pct: row.monto ? (gananciaReal / row.monto) * 100 : null,
          ajuste_monto: ajusteMonto,
          ajuste_descripcion: ajusteDescripcion,
          editado_manual: true,
        }
      : {
          costo_envio: costoEnvio,
          costo_unitario: costoUnitario,
          monto_neto_recibido: montoNetoRecibido,
          ganancia_real: gananciaReal,
          ajuste_monto: ajusteMonto,
          ajuste_descripcion: ajusteDescripcion,
          editado_manual: true,
        };

    const { error } = await supabase.from(row.tabla).update(cambios).eq("id", row.id);
    setEditandoVentaGuardando(false);
    if (error) { alert("No se pudo guardar: " + error.message); return; }
    setEditandoVentaId(null);
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

  // ── GASTOS FIJOS/VARIABLES (Fase 4, protegido con la misma clave) ──
  // Carga gastos de la empresa (alquiler, sueldos, etc.) y los reparte
  // entre socios activos (tabla "gasto_socios"), para que entren en el
  // cálculo de v_gastos_socios / v_reparto_socios que ya usa SociosPanel.
  const [gastosPanelOpen, setGastosPanelOpen] = useState(false);
  const [gastosLoading, setGastosLoading]     = useState(false);
  const [gastosGuardando, setGastosGuardando] = useState(false);
  const [gastos, setGastos]                   = useState([]);
  const [socios, setSocios]                   = useState([]);

  const abrirGastos = () => {
    if (unlocked) { setGastosPanelOpen(true); cargarGastos(); }
    else { setPinTarget("gastos"); setPinOpen(true); }
  };

  const cargarGastos = async () => {
    setGastosLoading(true);
    const [{ data: g, error: errG }, { data: s, error: errS }] = await Promise.all([
      supabase.from("costos_fijos_variables")
        .select("id,fecha,tipo,categoria,descripcion,monto,periodicidad")
        .order("fecha", { ascending: false })
        .limit(200),
      supabase.from("socios").select("id,nombre").eq("activo", true).order("nombre"),
    ]);
    if (errG) console.error("Error cargando gastos:", errG);
    if (errS) console.error("Error cargando socios:", errS);
    setGastos(g || []);
    setSocios(s || []);
    setGastosLoading(false);
  };

  // Guarda un gasto nuevo y lo reparte entre los socios elegidos según el
  // % que le dieron a cada uno en el formulario (repartoSocios: [{socio_id,porcentaje}]).
  const guardarGasto = async (datos, repartoSocios) => {
    setGastosGuardando(true);
    const { data: gasto, error: errGasto } = await supabase
      .from("costos_fijos_variables")
      .insert(datos)
      .select("id")
      .single();
    if (errGasto) {
      setGastosGuardando(false);
      alert("No se pudo guardar el gasto: " + errGasto.message);
      return false;
    }

    const filasReparto = (repartoSocios || [])
      .filter(r => r.porcentaje > 0)
      .map(r => ({ costo_id: gasto.id, socio_id: r.socio_id, porcentaje: r.porcentaje }));
    if (filasReparto.length > 0) {
      const { error: errReparto } = await supabase.from("gasto_socios").insert(filasReparto);
      if (errReparto) console.error("Gasto guardado, pero no se pudo repartir entre socios:", errReparto);
    }

    setGastosGuardando(false);
    await cargarGastos();
    return true;
  };

  const borrarGasto = async (id) => {
    if (!window.confirm("¿Borrar este gasto? Esta acción no se puede deshacer.")) return;
    const { error } = await supabase.from("costos_fijos_variables").delete().eq("id", id);
    if (error) { alert("No se pudo borrar: " + error.message); return; }
    await cargarGastos();
  };

  // ── RADAR DE COMPETENCIA (Fase 7, protegido con la misma clave) ────
  // Lee las vistas ya armadas sobre "competencia_ventas_dia" (que un
  // proceso externo actualiza todos los días): tu posición por categoría
  // y los competidores con más ventas, del último día cargado.
  const [radarPanelOpen, setRadarPanelOpen] = useState(false);
  const [radarLoading, setRadarLoading]     = useState(false);
  const [radarPropio, setRadarPropio]       = useState([]);
  const [radarTop, setRadarTop]             = useState([]);

  const abrirRadar = () => {
    if (unlocked) { setRadarPanelOpen(true); cargarRadar(); }
    else { setPinTarget("radar"); setPinOpen(true); }
  };

  const cargarRadar = async () => {
    setRadarLoading(true);
    const [{ data: propio, error: errPropio }, { data: top, error: errTop }] = await Promise.all([
      supabase.from("v_radar_competencia_propio").select("*"),
      supabase.from("v_radar_competencia_top").select("*"),
    ]);
    if (errPropio) console.error("Error cargando posición propia del radar:", errPropio);
    if (errTop) console.error("Error cargando top de competencia:", errTop);
    setRadarPropio(propio || []);
    setRadarTop(top || []);
    setRadarLoading(false);
  };

  // ── DASHBOARD (Fase 8, protegido con la misma clave) ────────────────
  // Combina lo que ya cargan los otros paneles (ventas, gastos, reparto
  // de socios, radar de competencia) en un solo panel con filtros
  // dinámicos (fecha, canal, familia, socio), en vez de tener que abrir
  // cada panel por separado.
  const [dashboardPanelOpen, setDashboardPanelOpen] = useState(false);
  const [dashboardLoading, setDashboardLoading]     = useState(false);
  const [dashDias, setDashDias]       = useState(30); // 7 | 30 | 90 | 0 (todo)
  const [dashCanal, setDashCanal]     = useState("todos"); // todos | mercado_libre | cotizador
  const [dashFamilia, setDashFamilia] = useState("todas");
  const [dashSocio, setDashSocio]     = useState("todos");
  const [dashVentas, setDashVentas]   = useState([]); // filas planas ML + físicas, ya con sku
  const [dashPosicionHist, setDashPosicionHist] = useState([]); // posición propia por categoría/día, para el gráfico

  const abrirDashboard = () => {
    if (unlocked) { setDashboardPanelOpen(true); cargarDashboard(dashDias); }
    else { setPinTarget("dashboard"); setPinOpen(true); }
  };

  const cargarDashboard = async (dias) => {
    setDashboardLoading(true);
    const desdeISO = dias > 0
      ? (() => { const d = new Date(); d.setDate(d.getDate() - dias); return d.toISOString(); })()
      : "2000-01-01T00:00:00Z";

    const [{ data: ml, error: errMl }, { data: fis, error: errFis }] = await Promise.all([
      supabase.from("ventas")
        .select("fecha,sku,nombre,cantidad,monto_total_venta,ganancia_real")
        .eq("canal", "mercado_libre")
        .gte("fecha", desdeISO)
        .order("fecha", { ascending: false })
        .limit(1000),
      supabase.from("ventas")
        .select("fecha,venta_items(sku,nombre,cantidad,monto_total,ganancia_real)")
        .eq("canal", "cotizador")
        .gte("fecha", desdeISO)
        .order("fecha", { ascending: false })
        .limit(500),
    ]);
    if (errMl) console.error("Error cargando ventas ML para el dashboard:", errMl);
    if (errFis) console.error("Error cargando ventas físicas para el dashboard:", errFis);

    const filasMl = (ml || []).map(v => ({
      fecha: v.fecha, canal: "mercado_libre", sku: v.sku, nombre: v.nombre,
      cantidad: v.cantidad, monto: v.monto_total_venta, ganancia: v.ganancia_real,
    }));
    const filasFis = (fis || []).flatMap(v =>
      (v.venta_items || []).map(it => ({
        fecha: v.fecha, canal: "cotizador", sku: it.sku, nombre: it.nombre,
        cantidad: it.cantidad, monto: it.monto_total, ganancia: it.ganancia_real,
      }))
    );
    setDashVentas([...filasMl, ...filasFis]);

    // Historial de tu posición por categoría (para el gráfico de línea) —
    // "competencia_ventas_dia" acumula una fila por categoría por día para
    // es_propio=true desde que arrancó el radar, así que esto va a ir
    // agarrando forma de a poco.
    const { data: posHist, error: errPosHist } = await supabase
      .from("competencia_ventas_dia")
      .select("fecha,categoria_nombre,posicion")
      .eq("es_propio", true)
      .gte("fecha", desdeISO.slice(0, 10))
      .order("fecha", { ascending: true })
      .limit(2000);
    if (errPosHist) console.error("Error cargando histórico de posición:", errPosHist);
    setDashPosicionHist(posHist || []);

    // Reusa los loaders de los otros paneles para no duplicar queries.
    await Promise.all([cargarGastos(), cargarReparto(), cargarRadar()]);
    setDashboardLoading(false);
  };

  const cambiarDashDias = (dias) => {
    setDashDias(dias);
    cargarDashboard(dias);
  };

  // ── CONTROL DE PROVEEDOR (protegido con la misma clave) ─────────────
  // Panel donde subís a mano el informe de ventas que te manda el
  // proveedor y se compara contra costo_base. Todo el parseo y la
  // comparación viven dentro del componente (no escribe nada en Supabase).
  const [controlProveedorOpen, setControlProveedorOpen] = useState(false);

  const abrirControlProveedor = () => {
    if (unlocked) setControlProveedorOpen(true);
    else { setPinTarget("controlProveedor"); setPinOpen(true); }
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

  // Stock por ubicación (Royriff / Depósito): vive en Supabase
  // (productos.stock_royriff / stock_deposito), compartido entre todos los
  // dispositivos -- ver migrar_stock_a_supabase_por_ubicacion.sql. Antes
  // vivía solo en localStorage (no compartido, no bajaba al vender).
  const cargarStock = useCallback(async () => {
    const { data, error } = await supabase.from("productos").select("sku,stock_royriff,stock_deposito");
    if (error) { console.error("Error cargando stock:", error); return; }
    setStock(Object.fromEntries((data || []).map(p => [p.sku, {
      royriff: p.stock_royriff || 0, deposito: p.stock_deposito || 0,
    }])));
  }, []);
  useEffect(() => { cargarStock(); }, [cargarStock]);

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
  const updStk = async (id, loc, val) => {
    const nuevoValor = Math.max(parseInt(val) || 0, 0);
    const actual = getStk(id);
    const delta = nuevoValor - (actual[loc] || 0);
    if (delta === 0) return;
    setStock(prev => ({ ...prev, [id]: { ...getStk(id), [loc]: nuevoValor } })); // optimista
    const { error } = await supabase.rpc("registrar_movimiento_stock", {
      p_sku: id, p_delta: delta, p_tipo: "ajuste", p_ubicacion: loc,
    });
    if (error) { console.error("No se pudo actualizar el stock:", error); await cargarStock(); }
  };
  const totalStk = (id) => { const s=getStk(id); return s.royriff + s.deposito; };

  // ── COTIZADOR LÓGICA ──────────────────────────────────────────────
  const agregarACot = (p) => {
    setCotItems(prev => {
      const existe = prev.find(i => i.id === p.id);
      if (existe) return prev.map(i => i.id===p.id ? {...i, qty: i.qty+1} : i);
      const { venta } = getPrecios(p);
      return [...prev, { ...p, qty:1, descItem:0, precioBase:venta, precioManual:null }];
    });
    setCotOpen(true);
    setCotBusq("");
  };

  const quitarDeCot = (id) => {
    setCotItems(prev => prev.filter(i=>i.id!==id));
  };

  const updCotQty = (id, qty) => {
    setCotItems(prev => prev.map(i => i.id===id ? {...i, qty: Math.max(1,parseInt(qty)||1)} : i));
  };

  const updCotDescItem = (id, v) => {
    setCotItems(prev => prev.map(i => i.id===id ? {...i, descItem: parseFloat(v)||0} : i));
  };

  // Precio manual por ítem (pisa el descuento calculado para esa línea).
  // Pasar "" o un valor inválido borra el override y vuelve al precio
  // calculado con el descuento normal.
  const updCotPrecioManual = (id, v) => {
    const n = parseFloat(v);
    setCotItems(prev => prev.map(i => i.id===id ? {...i, precioManual: (v===""||isNaN(n)) ? null : n} : i));
  };

  // Costo real (costo_base) de cada producto en el carrito, para poder
  // avisar si un precio editado a mano queda por debajo del costo.
  const [costoPorSku, setCostoPorSku] = useState({});
  useEffect(() => {
    const faltantes = [...new Set(cotItems.map(i => i.id))].filter(id => !(id in costoPorSku));
    if (faltantes.length === 0) return;
    supabase.from("productos").select("sku,costo_base").in("sku", faltantes)
      .then(({ data, error }) => {
        if (error) { console.error("No se pudo traer costo_base para el cotizador:", error); return; }
        setCostoPorSku(prev => {
          const next = { ...prev };
          faltantes.forEach(sku => { next[sku] = null; });
          (data||[]).forEach(p => { next[p.sku] = p.costo_base; });
          return next;
        });
      });
  }, [cotItems, costoPorSku]);

  // Recalcular totales cotización
  const cotTotales = useMemo(() => {
    let subtotal = 0;
    const lineas = cotItems.map(item => {
      const base = item.precioBase;
      const conDescItem = item.precioManual != null ? item.precioManual : base * (1 - item.descItem/100);
      const total = conDescItem * item.qty;
      subtotal += total;
      const costo = costoPorSku[item.id];
      const bajoCosto = costo != null && conDescItem < costo;
      return { ...item, precioFinal: conDescItem, total, bajoCosto };
    });

    const descTotal = Math.min(cotDescGlobal, 100);
    const totalEF = subtotal * (1 - descTotal/100);
    const cuota = totalEF * cuotas.multiplicador / cuotas.cant;

    return { lineas, subtotal, descTotal, totalEF, cuota };
  }, [cotItems, cotDescGlobal, cuotas, costoPorSku]);

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

  // Antes se podía guardar una venta sin estar logueado con ninguna clave.
  // Ahora hace falta estar logueado como admin O vendedor -- si no, pide la
  // clave y, apenas la valida, guarda esta misma venta (ver handlePin,
  // pinTarget==="guardarVenta").
  const intentarGuardarVenta = async () => {
    if (!logueado) { setPinTarget("guardarVenta"); setPinOpen(true); return; }
    await guardarVenta();
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

  // Los pisos (ganancia/precio final mínimo) de una config de familia no
  // aplican a los productos cuyo id empiece con alguno de
  // pisoVentaExcluyePrefijos (ej. los acoples de enganches, que comparten
  // la config de familia con el enganche pero son mucho más baratos).
  const pisosPara = (p, cfg) => {
    const excluido = (cfg.pisoVentaExcluyePrefijos || []).some(pref => p.id.startsWith(pref));
    return excluido ? { pisoGanancia: 0, pisoVenta: 0 } : { pisoGanancia: cfg.pisoGanancia, pisoVenta: cfg.pisoVenta };
  };

  // En enganches/estribos, costo_base viene con el kit (acople/soporte)
  // promediado y sumado adentro -- hay que restarlo para que el precio sea
  // del producto individual. Los acoples/soportes en sí (excluirPrefijos/
  // excluirCodigos) no llevan esta resta, porque ellos SON el kit.
  const kitDeduccionPara = (p) => {
    const cfg = KIT_DEDUCCION[key(p.proveedor, p.familia)];
    if (!cfg) return 0;
    const excluido = (cfg.excluirPrefijos || []).some(pref => p.id.startsWith(pref))
                   || (cfg.excluirCodigos || []).includes(p.id);
    return excluido ? 0 : cfg.deduccion;
  };

  // Costo de partida para el cálculo de precio: costo_base real (Supabase)
  // menos el envío de ML y el costo operativo (que no aplican a una venta
  // local) y menos el kit si corresponde. Si ese sku todavía no tiene
  // costo_base cargado, usa el listaVenta viejo del catálogo como
  // respaldo (comportamiento de siempre).
  const costoParaCalcular = (p) => {
    const entry = costoBaseMap[p.id];
    if (entry == null) {
      return { lista: p.listaVenta, desc: getDesc(p), iva: getCfg(p.proveedor,p.familia).iva };
    }
    const envioMl = envioMlMap[entry.categoria] ?? envioMlMap["default"] ?? 20000;
    const precioRealPagar = Math.max(entry.costoBase - envioMl - COSTO_OPERATIVO, 0);
    const costoAjustado = Math.max(precioRealPagar - kitDeduccionPara(p), 0);
    return { lista: costoAjustado, desc: 0, iva: 0 };
  };

  const getPrecios = p => {
    const cfg = getCfg(p.proveedor,p.familia);
    const { lista, desc, iva } = costoParaCalcular(p);
    const { pisoGanancia, pisoVenta } = pisosPara(p, cfg);
    const {venta} = calcular(lista, desc, iva, cfg.markup, pisoGanancia, pisoVenta, cfg.techoVenta);
    const cuota = venta * cuotas.multiplicador / cuotas.cant;
    return {venta, cuota, desc};
  };

  // ── Cálculos derivados del Dashboard (Fase 8) ───────────────────────
  // Mapea cada familia propia a la categoría equivalente que releva el
  // radar de competencia (hoy el radar solo cubre 9 categorías amplias de
  // ML, no las ~20 familias del catálogo — por eso el resto queda sin
  // comparación posible todavía).
  const MAPA_FAMILIA_COMPETENCIA = {
    "Estribos": "Estribos",
    "Defensas Bajas": "Defensas",
    "Enganches Pesados": "Enganches",
    "Enganches Livianos": "Enganches",
    "Cobertores de Caja": "Accesorios para Caja de Carga",
  };

  const skuToFamilia = useMemo(
    () => Object.fromEntries(PRODUCTOS.map(p => [p.id, p.familia])),
    []
  );

  const dashVentasFiltradas = useMemo(() => {
    return dashVentas.filter(v => {
      if (dashCanal !== "todos" && v.canal !== dashCanal) return false;
      if (dashFamilia !== "todas" && skuToFamilia[v.sku] !== dashFamilia) return false;
      return true;
    });
  }, [dashVentas, dashCanal, dashFamilia, skuToFamilia]);

  const dashKpis = useMemo(() => {
    const totalVentas = dashVentasFiltradas.reduce((s, v) => s + (Number(v.monto) || 0), 0);
    const conGanancia = dashVentasFiltradas.filter(v => v.ganancia != null);
    const totalGanancia = conGanancia.reduce((s, v) => s + Number(v.ganancia), 0);
    return { totalVentas, totalGanancia, cantidad: dashVentasFiltradas.length };
  }, [dashVentasFiltradas]);

  const dashGastosPeriodo = useMemo(() => {
    const desde = dashDias > 0
      ? (() => { const d = new Date(); d.setDate(d.getDate() - dashDias); return d; })()
      : new Date(0);
    return gastos
      .filter(g => new Date(g.fecha) >= desde)
      .reduce((s, g) => s + (Number(g.monto) || 0), 0);
  }, [gastos, dashDias]);

  const dashPorFamilia = useMemo(() => {
    const mapa = {};
    for (const v of dashVentasFiltradas) {
      const fam = skuToFamilia[v.sku] || "Sin categoría";
      if (!mapa[fam]) mapa[fam] = { familia: fam, cantidad: 0, monto: 0, ganancia: 0 };
      mapa[fam].cantidad += Number(v.cantidad) || 0;
      mapa[fam].monto += Number(v.monto) || 0;
      mapa[fam].ganancia += v.ganancia != null ? Number(v.ganancia) : 0;
    }
    return Object.values(mapa).sort((a, b) => b.monto - a.monto);
  }, [dashVentasFiltradas, skuToFamilia]);

  const dashRepartoFiltrado = useMemo(() => {
    if (dashSocio === "todos") return reparto;
    return reparto.filter(r => r.socio_id === dashSocio);
  }, [reparto, dashSocio]);

  // Ventas por día (monto y ganancia), para el gráfico de línea.
  const dashVentasPorDia = useMemo(() => {
    const mapa = {};
    for (const v of dashVentasFiltradas) {
      const dia = String(v.fecha).slice(0, 10);
      if (!mapa[dia]) mapa[dia] = { fecha: dia, monto: 0, ganancia: 0 };
      mapa[dia].monto += Number(v.monto) || 0;
      mapa[dia].ganancia += v.ganancia != null ? Number(v.ganancia) : 0;
    }
    return Object.values(mapa).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [dashVentasFiltradas]);

  // Compara tu precio minorista promedio contra el precio promedio de los
  // competidores top, para cada familia que tiene categoría equivalente
  // en el radar (ver MAPA_FAMILIA_COMPETENCIA).
  const dashComparativaCompetencia = useMemo(() => {
    const familiasAComparar = dashFamilia !== "todas"
      ? [dashFamilia]
      : Object.keys(MAPA_FAMILIA_COMPETENCIA);

    return familiasAComparar
      .filter(fam => MAPA_FAMILIA_COMPETENCIA[fam])
      .map(fam => {
        const categoriaRadar = MAPA_FAMILIA_COMPETENCIA[fam];
        const productosFam = PRODUCTOS.filter(p => p.familia === fam);
        const preciosPropios = productosFam.map(p => getPrecios(p).venta);
        const tuPrecioProm = preciosPropios.length
          ? preciosPropios.reduce((s, v) => s + v, 0) / preciosPropios.length
          : null;

        const competidores = radarTop.filter(r => r.categoria_nombre === categoriaRadar);
        const preciosComp = competidores.map(c => c.precio).filter(p => p != null);
        const compPrecioProm = preciosComp.length
          ? preciosComp.reduce((s, v) => s + v, 0) / preciosComp.length
          : null;

        const propio = radarPropio.find(r => r.categoria_nombre === categoriaRadar);

        const posicionHistorica = dashPosicionHist
          .filter(h => h.categoria_nombre === categoriaRadar && h.posicion != null)
          .map(h => ({ x: h.fecha.slice(5), y: h.posicion })); // "MM-DD"

        return {
          familia: fam, categoriaRadar,
          tuPrecioProm, compPrecioProm,
          diferenciaPct: (tuPrecioProm != null && compPrecioProm)
            ? ((tuPrecioProm - compPrecioProm) / compPrecioProm) * 100
            : null,
          tuPosicion: propio?.posicion ?? null,
          posicionHistorica,
        };
      });
  }, [dashFamilia, radarTop, radarPropio, dashPosicionHist, cuotas, config, overrides]);

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
          pinError={pinError} setPinError={setPinError} pinErrorMsg={pinErrorMsg} handlePin={handlePin}
          onClose={()=>{setPinOpen(false);setPinInput("");setPinError(false);setPinErrorMsg(null);setPinTarget(null);}}
        />
      )}

      <TopBar
        busqueda={busqueda} setBusqueda={setBusqueda} setBusqGlobal={setBusqGlobal}
        cfgOpen={cfgOpen} setCfgOpen={setCfgOpen} setImgOpen={setImgOpen} setImgSP={setImgSP}
        setCotOpen={setCotOpen} cotItems={cotItems}
        abrirVendedores={abrirVendedores} abrirStock={abrirStock} abrirVentas={abrirVentas}
        abrirSocios={abrirSocios} abrirFacturas={abrirFacturas} abrirGastos={abrirGastos} abrirRadar={abrirRadar}
        abrirDashboard={abrirDashboard} abrirControlProveedor={abrirControlProveedor}
        role={role} setRole={setRole} setPinOpen={setPinOpen}
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
          updCotPrecioManual={updCotPrecioManual} logueado={logueado} esAdmin={unlocked}
          cotNombre={cotNombre} setCotNombre={setCotNombre}
          cotDescGlobal={cotDescGlobal} setCotDG={setCotDG}
          cotVendedorId={cotVendedorId} setCotVendedorId={setCotVendedorId} vendedores={vendedores}
          cotFormaPago={cotFormaPago} setCotFormaPago={setCotFormaPago}
          cotVendedor={cotVendedor} cotComisionPct={cotComisionPct} cotComisionMonto={cotComisionMonto}
          cuotas={cuotas} setCuotas={setCuotas}
          guardadoMsg={guardadoMsg} guardando={guardando} guardarVenta={intentarGuardarVenta}
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

      {/* ── PANEL STOCK (cualquier rol logueado; solo lectura para vendedor) ── */}
      {stockPanelOpen && logueado && (
        <StockPanel
          soloLectura={!unlocked}
          stockBusq={stockBusq} buscarProductoStock={buscarProductoStock}
          stockBuscando={stockBuscando} stockResultados={stockResultados}
          stockSel={stockSel} setStockSel={setStockSel}
          setStockBusq={setStockBusq} setStockResultados={setStockResultados}
          stockTipo={stockTipo} setStockTipo={setStockTipo}
          stockUbicacion={stockUbicacion} setStockUbicacion={setStockUbicacion}
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
          ventasDias={ventasDias} setVentasDias={cambiarVentasDias}
          onClose={()=>setVentasPanelOpen(false)} onBorrar={borrarMovimiento}
          editandoVentaId={editandoVentaId} setEditandoVentaId={setEditandoVentaId}
          editandoVentaGuardando={editandoVentaGuardando} onGuardarEdicion={guardarEdicionVenta}
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

      {/* ── PANEL GASTOS FIJOS/VARIABLES (protegido con clave) ──────── */}
      {gastosPanelOpen && unlocked && (
        <GastosPanel
          gastosLoading={gastosLoading} gastosGuardando={gastosGuardando}
          gastos={gastos} socios={socios}
          onClose={()=>setGastosPanelOpen(false)}
          onGuardar={guardarGasto} onBorrar={borrarGasto}
        />
      )}

      {/* ── PANEL RADAR DE COMPETENCIA (protegido con clave) ────────── */}
      {radarPanelOpen && unlocked && (
        <RadarPanel
          radarLoading={radarLoading} radarPropio={radarPropio} radarTop={radarTop}
          onClose={()=>setRadarPanelOpen(false)}
        />
      )}

      {/* ── PANEL DASHBOARD (protegido con clave) ───────────────────── */}
      {dashboardPanelOpen && unlocked && (
        <DashboardPanel
          loading={dashboardLoading}
          dias={dashDias} setDias={cambiarDashDias}
          canal={dashCanal} setCanal={setDashCanal}
          familiaSel={dashFamilia} setFamiliaSel={setDashFamilia} familias={familias}
          socioSel={dashSocio} setSocioSel={setDashSocio} socios={socios}
          kpis={dashKpis} gastosPeriodo={dashGastosPeriodo}
          porFamilia={dashPorFamilia} reparto={dashRepartoFiltrado}
          ventasPorDia={dashVentasPorDia}
          radarPropio={radarPropio} comparativaCompetencia={dashComparativaCompetencia}
          onClose={()=>setDashboardPanelOpen(false)}
        />
      )}

      {/* ── PANEL CONTROL DE PROVEEDOR (protegido con clave) ────────── */}
      {controlProveedorOpen && unlocked && (
        <ControlProveedorPanel onClose={()=>setControlProveedorOpen(false)} />
      )}
    </div>
  );
}
