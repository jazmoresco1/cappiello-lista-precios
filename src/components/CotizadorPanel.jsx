import { CUOTAS_MP, FORMAS_PAGO } from "../data/catalogo.js";
import { ARS } from "../utils.js";

export default function CotizadorPanel({
  onClose,
  cotBusq, setCotBusq, cotBusqRes, agregarACot,
  cotItems, setCotItems, cotTotales, quitarDeCot, updCotQty, updCotDescItem,
  cotComboAct, setCotCombo, toggleCombo,
  cotNombre, setCotNombre,
  cotDescGlobal, setCotDG,
  cotVendedorId, setCotVendedorId, vendedores,
  cotFormaPago, setCotFormaPago,
  cotVendedor, cotComisionPct, cotComisionMonto,
  cuotas, setCuotas,
  guardadoMsg, guardando, guardarVenta,
}) {
  return (
    <div className="cot-panel">
      <div className="cot-head">
        <div>
          <div className="cot-head-title">🧾 Cotizador</div>
          <div className="cot-head-sub">{cotItems.length} producto{cotItems.length!==1?"s":""} · monstertrail accesorios 4×4</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="cot-body">
        {/* Buscador */}
        <div className="cot-search-wrap">
          <span className="cot-search-ico">🔍</span>
          <input className="cot-search" placeholder="Buscar y agregar producto..."
            value={cotBusq} onChange={e=>setCotBusq(e.target.value)}
            autoComplete="off"/>
        </div>

        {/* Resultados búsqueda */}
        {cotBusq.trim() && (
          <div className="cot-results">
            {cotBusqRes.length===0
              ? <div style={{padding:"12px",fontSize:12,color:"var(--tx2)"}}>Sin resultados</div>
              : cotBusqRes.map(p=>(
                <div className="cot-result-item" key={p.id} onClick={()=>agregarACot(p)}>
                  <div>
                    <div className="cot-result-name">{p.nombre}</div>
                    <div style={{fontSize:10,color:"#aaa",marginTop:2}}>{p.compat}</div>
                  </div>
                  <span className="cot-result-code">{p.id}</span>
                  <span className="cot-result-plus">+</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Items en cotización */}
        {cotItems.length===0 ? (
          <div className="cot-empty">
            <div style={{fontSize:32,marginBottom:8}}>🧾</div>
            <div>Buscá productos arriba<br/>o tocá 🧾 en cualquier tarjeta</div>
          </div>
        ) : (
          <>
            <div className="cot-section-title" style={{marginBottom:10}}>Productos</div>
            {cotTotales.lineas.map(item=>(
              <div className="cot-item" key={item.id}>
                <div className="cot-item-row1">
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#aaa",letterSpacing:"1px",marginBottom:2}}>{item.id}</div>
                    <div className="cot-item-name">{item.nombre}</div>
                  </div>
                  <button className="cot-item-del" onClick={()=>quitarDeCot(item.id)}>✕</button>
                </div>
                <div className="cot-item-row2">
                  <div className="cot-qty-wrap">
                    <button className="cot-qty-btn" onClick={()=>updCotQty(item.id, item.qty-1)}>−</button>
                    <input className="cot-qty" type="number" min="1" value={item.qty}
                      onChange={e=>updCotQty(item.id,e.target.value)}/>
                    <button className="cot-qty-btn" onClick={()=>updCotQty(item.id, item.qty+1)}>+</button>
                  </div>
                  <div className="cot-desc-wrap">
                    <span>Dto</span>
                    <input className="cot-desc-inp" type="number" min="0" max="100"
                      value={item.descItem} onChange={e=>updCotDescItem(item.id,e.target.value)}/>
                    <span>%</span>
                  </div>
                  <div className="cot-item-total">{ARS(item.total)}</div>
                </div>
              </div>
            ))}

            {/* Combos detectados */}
            {cotComboAct.length>0 && (
              <div className="cot-combos">
                <div className="cot-section-title" style={{marginBottom:8,color:"var(--ok)"}}>✦ Combos detectados</div>
                {cotComboAct.map(combo=>(
                  <div key={combo.id}
                    className={`cot-combo-chip${combo.aplicado===false?" off":""}`}
                    onClick={()=>toggleCombo(combo.id)}
                    title={combo.descripcion}
                  >
                    <span className="cot-combo-name">{combo.nombre}</span>
                    <span className="cot-combo-pct">−{combo.descuento}%</span>
                    <span className="cot-combo-toggle">{combo.aplicado!==false?"✓ Aplicado":"Aplicar"}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer con totales */}
      {cotItems.length>0 && (
        <div className="cot-footer">
          <input className="cot-nombre-inp" placeholder="Nombre del cliente (opcional)"
            value={cotNombre} onChange={e=>setCotNombre(e.target.value)}/>

          <div className="cot-global-wrap">
            <span className="cot-global-label">Descuento general adicional</span>
            <input className="cot-global-inp" type="number" min="0" max="100"
              value={cotDescGlobal} onChange={e=>setCotDG(parseFloat(e.target.value)||0)}/>
            <span style={{fontSize:12,color:"var(--tx2)"}}>%</span>
          </div>

          {/* Vendedor y forma de pago de ESTA venta */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <select
              value={cotVendedorId}
              onChange={e=>setCotVendedorId(e.target.value)}
              style={{flex:1,border:"1px solid var(--bd)",borderRadius:6,padding:"7px 8px",fontFamily:"'DM Sans',sans-serif",fontSize:12,background:"var(--sf2)",color:"var(--tx)",outline:"none"}}
            >
              <option value="">Sin vendedor</option>
              {vendedores.map(v=><option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
            <select
              value={cotFormaPago}
              onChange={e=>setCotFormaPago(e.target.value)}
              style={{flex:1,border:"1px solid var(--bd)",borderRadius:6,padding:"7px 8px",fontFamily:"'DM Sans',sans-serif",fontSize:12,background:"var(--sf2)",color:"var(--tx)",outline:"none"}}
            >
              {FORMAS_PAGO.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>

          {cotVendedor && (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"8px 10px",marginBottom:12,fontSize:12}}>
              <span style={{color:"var(--tx2)"}}>Comisión {cotVendedor.nombre} ({cotComisionPct}%)</span>
              <span style={{fontWeight:700,color:"var(--ac)"}}>{ARS(cotComisionMonto)}</span>
            </div>
          )}

          <div className="cot-totales">
            <div className="cot-tot-row">
              <span className="cot-tot-label">Subtotal</span>
              <span className="cot-tot-sub">{ARS(cotTotales.subtotal)}</span>
            </div>
            {cotTotales.descTotal>0 && (
              <div className="cot-tot-row">
                <span className="cot-tot-label">Descuento total</span>
                <span className="cot-tot-desc">−{cotTotales.descTotal.toFixed(1)}%</span>
              </div>
            )}
            <div className="cot-tot-row">
              <span className="cot-tot-label">Total efectivo</span>
              <span className="cot-tot-ef">{ARS(cotTotales.totalEF)}</span>
            </div>
            <div style={{marginTop:10,borderTop:"1px solid #2a2a2a",paddingTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {CUOTAS_MP.map(c=>{
                const cuotaVal = cotTotales.totalEF * c.multiplicador / c.cant;
                const esActual = c.cant === cuotas.cant;
                return (
                  <div key={c.cant}
                    onClick={()=>setCuotas(c)}
                    style={{
                      background: esActual ? "var(--ac)" : "#222",
                      border: `1px solid ${esActual ? "var(--ac)" : "#333"}`,
                      borderRadius:8, padding:"8px 10px", cursor:"pointer",
                      transition:"all .15s"
                    }}
                  >
                    <div style={{fontSize:10,color:esActual?"rgba(255,255,255,.7)":"#666",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>{c.label}</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:17,fontWeight:800,color:esActual?"#fff":"#ccc"}}>{ARS(cuotaVal)}<span style={{fontSize:11,fontWeight:400,marginLeft:2}}>/mes</span></div>
                    <div style={{fontSize:10,color:esActual?"rgba(255,255,255,.5)":"#555",marginTop:2}}>total {ARS(cotTotales.totalEF*c.multiplicador)} · tasa {c.tasa}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          {guardadoMsg && (
            <div style={{marginBottom:8,padding:"7px 10px",borderRadius:6,fontSize:12,textAlign:"center",
              background: guardadoMsg.ok ? "var(--ok-bg)" : "#3a1414",
              color: guardadoMsg.ok ? "var(--ok)" : "#e57373",
              border: `1px solid ${guardadoMsg.ok ? "var(--ok)" : "#c0392b"}`}}>
              {guardadoMsg.texto}
            </div>
          )}

          <div className="cot-actions">
            <button className="cot-btn-print" disabled={guardando} onClick={async ()=>{
              await guardarVenta();
            }} style={{flex:1,padding:10,background:"var(--ok)",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:guardando?"default":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:guardando?0.7:1}}>
              {guardando ? "Guardando…" : "💾 Guardar venta"}
            </button>
          </div>

          <div className="cot-actions" style={{marginTop:8}}>
            <button className="cot-btn-print" onClick={()=>{
              const lineas = cotTotales.lineas.map(i=>
                `${i.id} — ${i.nombre}\n  ${i.qty} u × ${ARS(i.precioFinal)}${i.descItem>0?` (dto ${i.descItem}%)`:""} = ${ARS(i.total)}`
              ).join('\n\n');
              const combos = cotComboAct.filter(c=>c.aplicado!==false).map(c=>`✦ ${c.nombre} −${c.descuento}%`).join('\n');
              const txt = [
                `COTIZACIÓN — monstertrail accesorios 4×4`,
                cotNombre ? `Cliente: ${cotNombre}` : "",
                `Fecha: ${new Date().toLocaleDateString('es-AR')}`,
                `─────────────────────────────`,
                lineas,
                combos ? `\nCOMBOS:\n${combos}` : "",
                `─────────────────────────────`,
                cotTotales.descTotal>0 ? `Descuento total: ${cotTotales.descTotal.toFixed(1)}%` : "",
                `TOTAL EFECTIVO: ${ARS(cotTotales.totalEF)}`,
                `${cuotas.label}: ${ARS(cotTotales.cuota)}/mes`,
              ].filter(Boolean).join('\n');
              const w = window.open('','_blank');
              w.document.write(`<pre style="font-family:monospace;padding:20px;font-size:13px">${txt}</pre>`);
              w.print();
            }}>
              🖨 Imprimir cotización
            </button>
            <button className="cot-btn-clear" onClick={()=>{
              if(confirm("¿Limpiar cotización?")){ setCotItems([]); setCotCombo([]); setCotDG(0); setCotNombre(""); setCotVendedorId(""); setCotFormaPago("efectivo"); }
            }}>🗑</button>
          </div>
        </div>
      )}
    </div>
  );
}
