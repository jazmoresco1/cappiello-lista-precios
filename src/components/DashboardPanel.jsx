import { ARS } from "../utils.js";
import LineChart from "./LineChart.jsx";

function KpiCard({ label, value, accent, negative }) {
  return (
    <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
      <div style={{fontSize:11,color:"var(--tx2)"}}>{label}</div>
      <div style={{fontSize:16,fontWeight:700,color: negative ? "#e55" : accent ? "var(--ac)" : "var(--tx)"}}>{value}</div>
    </div>
  );
}

const RANGOS = [{v:7,l:"7 días"},{v:30,l:"30 días"},{v:90,l:"90 días"},{v:0,l:"Todo"}];

export default function DashboardPanel({
  loading, dias, setDias, canal, setCanal,
  familiaSel, setFamiliaSel, familias,
  socioSel, setSocioSel, socios,
  kpis, gastosPeriodo, porFamilia, reparto, ventasPorDia,
  comparativaCompetencia, onClose,
}) {
  const neto = (kpis.totalGanancia || 0) - (gastosPeriodo || 0);

  return (
    <div className="img-panel" style={{width:560}}>
      <div className="img-head">
        <div>
          <div className="img-head-title">📊 Dashboard</div>
          <div className="img-head-sub">Ventas, gastos, socios y competencia con filtros dinámicos</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        <div className="img-section-title" style={{marginTop:0}}>Rango de fechas</div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {RANGOS.map(o => (
            <button key={o.v} className="cot-btn-clear" style={{flex:1,
              ...(dias===o.v ? {borderColor:"var(--ac)",color:"var(--ac)"} : {})}}
              onClick={()=>setDias(o.v)}>
              {o.l}
            </button>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
          <label style={{fontSize:11,color:"var(--tx2)",display:"flex",flexDirection:"column",gap:4}}>
            Canal
            <select className="cot-nombre-inp" style={{marginBottom:0}} value={canal} onChange={e=>setCanal(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="mercado_libre">Mercado Libre</option>
              <option value="cotizador">Local</option>
            </select>
          </label>
          <label style={{fontSize:11,color:"var(--tx2)",display:"flex",flexDirection:"column",gap:4}}>
            Familia
            <select className="cot-nombre-inp" style={{marginBottom:0}} value={familiaSel} onChange={e=>setFamiliaSel(e.target.value)}>
              <option value="todas">Todas</option>
              {familias.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{fontSize:11,color:"var(--tx2)",display:"flex",flexDirection:"column",gap:4,gridColumn:"1 / -1"}}>
            Socio
            <select className="cot-nombre-inp" style={{marginBottom:0}} value={socioSel} onChange={e=>setSocioSel(e.target.value)}>
              <option value="todos">Todos</option>
              {socios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="cot-empty" style={{padding:12}}>Cargando…</div>
        ) : (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
              <KpiCard label="Total vendido" value={ARS(kpis.totalVentas)} />
              <KpiCard label="Ganancia real" value={ARS(kpis.totalGanancia)} accent />
              <KpiCard label="Gastos del período" value={ARS(gastosPeriodo)} />
              <KpiCard label="Neto (ganancia − gastos)" value={ARS(neto)} accent={neto>=0} negative={neto<0} />
            </div>
            <div style={{fontSize:11,color:"var(--tx2)",marginBottom:18}}>{kpis.cantidad} ventas en el período filtrado</div>

            <div className="img-section-title" style={{marginTop:0}}>Ventas por día ($ vendido)</div>
            <div style={{marginBottom:6}}>
              <LineChart points={ventasPorDia.map(d => ({x: d.fecha.slice(5), y: d.monto}))} formatY={ARS} />
            </div>
            <div className="img-section-title">Ganancia por día</div>
            <div style={{marginBottom:16}}>
              <LineChart points={ventasPorDia.map(d => ({x: d.fecha.slice(5), y: d.ganancia}))} color="#2ecc71" formatY={ARS} />
            </div>

            <div className="img-section-title">Ventas por familia</div>
            {porFamilia.length === 0 ? (
              <div className="cot-empty" style={{padding:10,fontSize:12,marginBottom:16}}>Sin ventas en este filtro.</div>
            ) : (
              <div className="img-prod-list" style={{marginBottom:16}}>
                {porFamilia.map(f => (
                  <div key={f.familia} className="img-prod-row" style={{cursor:"default"}}>
                    <div className="img-prod-info">
                      <div className="img-prod-name">{f.familia}</div>
                      <div className="img-prod-count">x{f.cantidad} · {ARS(f.monto)} · ganancia {ARS(f.ganancia)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="img-section-title">Reparto entre socios</div>
            {reparto.length === 0 ? (
              <div className="cot-empty" style={{padding:10,fontSize:12}}>Sin datos de reparto para este filtro.</div>
            ) : (
              <div className="img-prod-list">
                {reparto.map(r => (
                  <div key={r.socio_id} className="img-prod-row" style={{cursor:"default"}}>
                    <div className="img-prod-info">
                      <div className="img-prod-name">{r.socio}</div>
                      <div className="img-prod-count">Ganancia {ARS(r.ganancia_asignada||0)} · Gastos {ARS(r.gasto_asignado||0)}</div>
                    </div>
                    <div style={{fontWeight:700,color:"var(--ac)",whiteSpace:"nowrap"}}>{ARS(r.neto||0)}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{fontSize:10,color:"var(--tx2)",marginTop:8,marginBottom:18}}>
              * El reparto es acumulado histórico — todavía no se puede filtrar por rango de fechas.
            </div>

            <div className="img-section-title">Vos vs. competencia</div>
            {comparativaCompetencia.length === 0 ? (
              <div className="cot-empty" style={{padding:10,fontSize:12}}>
                {familiaSel === "todas"
                  ? "El radar todavía no cubre categorías comparables para tus familias."
                  : `El radar no releva una categoría equivalente a "${familiaSel}" todavía.`}
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {comparativaCompetencia.map(c => (
                  <div key={c.familia} style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
                    <div className="img-prod-name">
                      {c.familia} <span style={{color:"var(--tx2)",fontWeight:400}}>→ {c.categoriaRadar}</span>
                    </div>
                    <div className="img-prod-count" style={{marginBottom:8}}>
                      Tu precio prom. {c.tuPrecioProm!=null ? ARS(c.tuPrecioProm) : "?"} · Competencia prom. {c.compPrecioProm!=null ? ARS(c.compPrecioProm) : "sin datos"}
                      {c.diferenciaPct!=null && <> · {c.diferenciaPct>0?"+":""}{c.diferenciaPct.toFixed(1)}% vs ellos</>}
                    </div>
                    <div style={{fontSize:10,color:"var(--tx2)",marginBottom:2}}>Tu posición en el tiempo (línea más arriba = mejor posición)</div>
                    <LineChart points={c.posicionHistorica} color="var(--ac)" height={70} formatY={v=>`#${v}`} invert />
                  </div>
                ))}
              </div>
            )}
            <div style={{fontSize:10,color:"var(--tx2)",marginTop:8}}>
              * Comparación disponible solo para las familias que el radar releva por ahora (Estribos, Defensas Bajas, Enganches, Cobertores de Caja).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
