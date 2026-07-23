import { ARS } from "../utils.js";

export default function SociosPanel({ sociosLoading, reparto, onClose }) {
  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">🤝 Reparto entre socios</div>
          <div className="img-head-sub">Ganancia de contenedor1 y gastos asignados, por socio</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        {sociosLoading ? (
          <div className="cot-empty" style={{padding:12}}>Cargando…</div>
        ) : reparto.length===0 ? (
          <div className="cot-empty">
            <div style={{fontSize:32,marginBottom:8}}>🤝</div>
            <div>Todavía no hay ganancia ni gastos de contenedor1 para repartir</div>
          </div>
        ) : (
          <div className="img-prod-list">
            {reparto.map(r=>(
              <div key={r.socio_id} className="img-prod-row" style={{cursor:"default"}}>
                <div className="img-prod-thumb-empty">👤</div>
                <div className="img-prod-info">
                  <div className="img-prod-name">{r.socio}</div>
                  <div className="img-prod-count">
                    Ganancia {ARS(r.ganancia_asignada||0)} · Gastos {ARS(r.gasto_asignado||0)}
                  </div>
                </div>
                <div style={{fontWeight:700,color:"var(--ac)",whiteSpace:"nowrap"}}>{ARS(r.neto||0)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
