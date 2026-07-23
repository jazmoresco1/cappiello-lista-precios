import { ARS } from "../utils.js";

export default function VentasPanel({ ventasLoading, ventasResumen, ventasLista, onClose, onBorrar }) {
  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">📊 Ventas y ganancia real</div>
          <div className="img-head-sub">Mercado Libre + ventas físicas, últimos 30 días</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        {ventasLoading ? (
          <div className="cot-empty" style={{padding:12}}>Cargando…</div>
        ) : !ventasResumen || ventasResumen.cantidad===0 ? (
          <div className="cot-empty">
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <div>Todavía no hay ventas guardadas en los últimos 30 días</div>
          </div>
        ) : (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:"var(--tx2)"}}>Total vendido</div>
                <div style={{fontSize:18,fontWeight:700}}>{ARS(ventasResumen.totalVentas)}</div>
              </div>
              <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:"var(--tx2)"}}>Ganancia real</div>
                <div style={{fontSize:18,fontWeight:700,color:"var(--ac)"}}>{ARS(ventasResumen.totalGanancia)}</div>
              </div>
            </div>
            <div style={{fontSize:11,color:"var(--tx2)",marginBottom:14}}>
              {ventasResumen.cantidad} {ventasResumen.cantidad===1?"venta":"ventas"}
              {ventasResumen.sinGanancia>0 && ` · ${ventasResumen.sinGanancia} sin costo cargado (ganancia no calculada)`}
            </div>

            <div className="img-prod-list">
              {ventasLista.map((v,i)=>(
                <div key={v.id||i} className="img-prod-row" style={{cursor:"default"}}>
                  <div className="img-prod-thumb-empty">{v.canal==="Mercado Libre"?"🛒":"🏬"}</div>
                  <div className="img-prod-info">
                    <div className="img-prod-name">{v.nombre || "(sin nombre)"}</div>
                    <div className="img-prod-count">
                      {new Date(v.fecha).toLocaleDateString("es-AR")} · {v.canal} · x{v.cantidad} · {ARS(v.monto||0)}
                      {v.ganancia!=null && <> · ganancia {ARS(v.ganancia)}</>}
                    </div>
                  </div>
                  {v.id && (
                    <button className="cot-x" title="Borrar movimiento"
                      onClick={()=>onBorrar(v)}
                      style={{marginLeft:8,color:"#c0392b",borderColor:"#c0392b"}}>
                      🗑
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
