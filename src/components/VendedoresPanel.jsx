export default function VendedoresPanel({
  vendEditId, setVendEditId, vendForm, setVendForm, guardarVendedor, vendGuardando,
  vendedores, borrarVendedor, FORMAS_PAGO, nuevoVendedorForm, onClose,
}) {
  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">👤 Vendedores y comisiones</div>
          <div className="img-head-sub">Comisión % preestablecida por vendedor, según forma de pago</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        {vendEditId ? (
          /* ── Formulario alta/edición ── */
          <div className="img-detail">
            <div className="img-detail-header">
              <div className="img-detail-name">{vendEditId==="nuevo" ? "Nuevo vendedor" : "Editar vendedor"}</div>
              <button className="img-back" onClick={()=>{setVendEditId(null);setVendForm(null);}}>← Volver</button>
            </div>

            <input className="cot-nombre-inp" placeholder="Nombre del vendedor"
              value={vendForm?.nombre||""} onChange={e=>setVendForm(f=>({...f,nombre:e.target.value}))}/>

            <input className="cot-nombre-inp" placeholder="Clave individual (para entrar a la app)"
              value={vendForm?.pin||""} onChange={e=>setVendForm(f=>({...f,pin:e.target.value}))}/>
            <div style={{fontSize:11,color:"var(--tx2)",marginTop:-8,marginBottom:14}}>
              Con esta clave el vendedor entra directo con su nombre ya elegido en el cotizador. Dejala vacía si todavía no le vas a dar acceso.
            </div>

            <div className="img-section-title" style={{marginTop:4}}>Comisión % por forma de pago</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {FORMAS_PAGO.map(fp=>(
                <div key={fp.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:7,padding:"7px 9px"}}>
                  <span style={{fontSize:11,color:"var(--tx2)"}}>{fp.label}</span>
                  <div style={{display:"flex",alignItems:"center",gap:3}}>
                    <input type="number" min="0" max="100" step="0.5"
                      value={vendForm?.comisiones?.[fp.key] ?? 0}
                      onChange={e=>setVendForm(f=>({...f,comisiones:{...f.comisiones,[fp.key]:parseFloat(e.target.value)||0}}))}
                      style={{width:48,border:"1px solid var(--bd)",borderRadius:5,padding:"3px 5px",fontSize:12,textAlign:"center",fontFamily:"'DM Sans',sans-serif",background:"var(--sf)",color:"var(--tx)",outline:"none"}}/>
                    <span style={{fontSize:11,color:"var(--tx2)"}}>%</span>
                  </div>
                </div>
              ))}
            </div>

            <button className="img-auto-btn" onClick={guardarVendedor} disabled={vendGuardando}>
              {vendGuardando ? "Guardando…" : "Guardar vendedor"}
            </button>
          </div>
        ) : (
          /* ── Lista de vendedores ── */
          <>
            <button className="img-auto-btn" style={{marginBottom:14}}
              onClick={()=>{setVendEditId("nuevo");setVendForm(nuevoVendedorForm());}}>
              + Agregar vendedor
            </button>

            {vendedores.length===0 ? (
              <div className="cot-empty">
                <div style={{fontSize:32,marginBottom:8}}>👤</div>
                <div>Todavía no cargaste vendedores</div>
              </div>
            ) : (
              <div className="img-prod-list">
                {vendedores.map(v=>(
                  <div key={v.id} className="img-prod-row" style={{cursor:"default"}}>
                    <div className="img-prod-thumb-empty">👤</div>
                    <div className="img-prod-info">
                      <div className="img-prod-name">
                        {v.nombre} {v.pin ? "🔑" : <span title="Sin clave asignada todavía" style={{color:"#e55"}}>⚠️ sin clave</span>}
                      </div>
                      <div className="img-prod-count">
                        Efectivo {v.comisiones?.efectivo ?? 0}% · 12 cuotas {v.comisiones?.["12"] ?? 0}%
                      </div>
                    </div>
                    <button className="img-back" onClick={()=>{setVendEditId(v.id);setVendForm({nombre:v.nombre,pin:v.pin||"",comisiones:{...nuevoVendedorForm().comisiones,...v.comisiones}});}}>✎</button>
                    <button className="cot-item-del" onClick={()=>borrarVendedor(v.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
