export default function StockPanel({
  stockBusq, buscarProductoStock, stockBuscando, stockResultados,
  stockSel, setStockSel, setStockBusq, setStockResultados,
  stockTipo, setStockTipo, stockDelta, setStockDelta, stockNota, setStockNota,
  registrarMovimientoStock, stockGuardando, stockMsg, onClose,
}) {
  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">📦 Stock</div>
          <div className="img-head-sub">Buscá un producto por SKU o nombre para cargar o ajustar su stock</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        <input className="cot-nombre-inp" placeholder="Buscar por SKU o nombre..."
          value={stockBusq} onChange={e=>buscarProductoStock(e.target.value)} />

        {stockBuscando && <div className="cot-empty" style={{padding:12}}>Buscando…</div>}

        {!stockSel && stockResultados.length > 0 && (
          <div className="img-prod-list" style={{marginTop:10}}>
            {stockResultados.map(p=>(
              <div key={p.id} className="img-prod-row" style={{cursor:"pointer"}}
                onClick={()=>{setStockSel(p);setStockResultados([]);setStockBusq(p.nombre);}}>
                <div className="img-prod-thumb-empty">📦</div>
                <div className="img-prod-info">
                  <div className="img-prod-name">{p.nombre}</div>
                  <div className="img-prod-count">SKU {p.sku} · Stock actual: {p.stock}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!stockBuscando && stockBusq.trim() && stockResultados.length === 0 && !stockSel && (
          <div className="cot-empty" style={{padding:12}}>
            No encontré ese producto en la base (todavía puede no estar cargado en Supabase).
          </div>
        )}

        {stockSel && (
          <div className="img-detail" style={{marginTop:10}}>
            <div className="img-detail-header">
              <div className="img-detail-name">{stockSel.nombre}</div>
              <button className="img-back" onClick={()=>{setStockSel(null);setStockBusq("");}}>← Volver a buscar</button>
            </div>
            <div style={{fontSize:12,color:"var(--tx2)",marginBottom:10}}>
              SKU {stockSel.sku} · Stock actual: <strong>{stockSel.stock}</strong> unidades
            </div>

            <div className="img-section-title">Tipo de movimiento</div>
            <select className="cot-nombre-inp" value={stockTipo} onChange={e=>setStockTipo(e.target.value)} style={{marginBottom:10}}>
              <option value="compra_manual">Carga manual</option>
              <option value="factura_proveedor">Factura de proveedor</option>
              <option value="ajuste">Ajuste (ej: rotura, faltante)</option>
            </select>

            <div className="img-section-title">Cantidad (positivo suma, negativo resta)</div>
            <input className="cot-nombre-inp" type="number" placeholder="ej: 10 o -2"
              value={stockDelta} onChange={e=>setStockDelta(e.target.value)} style={{marginBottom:10}} />

            <div className="img-section-title">Nota (opcional)</div>
            <input className="cot-nombre-inp" placeholder="ej: Factura 0001-00023456"
              value={stockNota} onChange={e=>setStockNota(e.target.value)} style={{marginBottom:14}} />

            <button className="img-auto-btn" onClick={registrarMovimientoStock} disabled={stockGuardando || !stockDelta}>
              {stockGuardando ? "Guardando…" : "Registrar movimiento"}
            </button>

            {stockMsg && (
              <div style={{marginTop:10,fontSize:12,color: stockMsg.ok ? "var(--ac)" : "#e55"}}>
                {stockMsg.texto}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
