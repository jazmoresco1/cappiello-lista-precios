import { ARS } from "../utils.js";

export default function RadarPanel({ radarLoading, radarPropio, radarTop, onClose }) {
  const categorias = [...new Set([
    ...radarPropio.map(r => r.categoria_nombre),
    ...radarTop.map(r => r.categoria_nombre),
  ])].sort();

  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">📡 Radar de competencia</div>
          <div className="img-head-sub">Tu posición y los competidores con más ventas, por categoría (Mercado Libre)</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        {radarLoading ? (
          <div className="cot-empty" style={{padding:12}}>Cargando…</div>
        ) : categorias.length === 0 ? (
          <div className="cot-empty">
            <div style={{fontSize:32,marginBottom:8}}>📡</div>
            <div>Todavía no hay datos del radar de competencia</div>
          </div>
        ) : (
          categorias.map(cat => {
            const propio = radarPropio.find(r => r.categoria_nombre === cat);
            const top = radarTop.filter(r => r.categoria_nombre === cat);
            return (
              <div key={cat} style={{marginBottom:22}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div className="img-section-title" style={{margin:0}}>{cat}</div>
                  <div style={{fontSize:12,fontWeight:700,color:propio?.posicion ? "var(--ac)" : "var(--tx2)"}}>
                    {propio?.posicion ? `Tu posición: #${propio.posicion}` : "Sin posición detectada"}
                  </div>
                </div>

                {top.length === 0 ? (
                  <div className="cot-empty" style={{padding:10,fontSize:12}}>Sin competidores relevados en esta categoría todavía.</div>
                ) : (
                  <div className="img-prod-list">
                    {top.map((c,i) => (
                      <div key={i} className="img-prod-row" style={{cursor:"default"}}>
                        <div className="img-prod-thumb-empty">🏪</div>
                        <div className="img-prod-info">
                          <div className="img-prod-name">{c.titulo || "(sin título)"}</div>
                          <div className="img-prod-count">
                            {c.nombre_editado || c.alias} · {c.precio!=null ? ARS(c.precio) : "precio ?"}
                            {c.cantidad_ventas_mes!=null && <> · {c.cantidad_ventas_mes} ventas/mes</>}
                            {c.ventas_brutas_mes!=null && <> · {ARS(c.ventas_brutas_mes)} brutos/mes</>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
