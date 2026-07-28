import { useState } from "react";
import { ARS } from "../utils.js";

const HOY = () => new Date().toISOString().slice(0, 10);

export default function GastosPanel({
  gastosLoading, gastosGuardando, gastos, socios, onClose, onGuardar, onBorrar,
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fecha, setFecha]             = useState(HOY());
  const [tipo, setTipo]               = useState("fijo");
  const [categoria, setCategoria]     = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto]             = useState("");
  const [periodicidad, setPeriodicidad] = useState("mensual");
  const [reparto, setReparto]         = useState({}); // { socio_id: "50" }

  const abrirForm = () => {
    // Reparte 100% en partes iguales entre los socios activos como punto de
    // partida; el usuario puede reajustar cada % antes de guardar.
    const partesIguales = socios.length ? (100 / socios.length).toFixed(2) : 0;
    setReparto(Object.fromEntries(socios.map(s => [s.id, partesIguales])));
    setFecha(HOY()); setTipo("fijo"); setCategoria(""); setDescripcion("");
    setMonto(""); setPeriodicidad("mensual");
    setMostrarForm(true);
  };

  const totalReparto = Object.values(reparto).reduce((s, v) => s + (Number(v) || 0), 0);

  const guardar = async () => {
    if (!descripcion.trim() || !monto || Number(monto) <= 0) {
      alert("Cargá una descripción y un monto mayor a 0.");
      return;
    }
    const repartoSocios = Object.entries(reparto).map(([socio_id, porcentaje]) => ({
      socio_id, porcentaje: Number(porcentaje) || 0,
    }));
    const ok = await onGuardar({
      fecha, tipo, categoria: categoria.trim() || null,
      descripcion: descripcion.trim(), monto: Number(monto), periodicidad,
    }, repartoSocios);
    if (ok) setMostrarForm(false);
  };

  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">💸 Gastos fijos y variables</div>
          <div className="img-head-sub">Alquiler, sueldos y demás costos de la empresa, repartidos entre socios</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        {mostrarForm ? (
          <div className="img-detail">
            <div className="img-detail-header">
              <div className="img-detail-name">Nuevo gasto</div>
              <button className="img-back" onClick={()=>setMostrarForm(false)}>← Volver</button>
            </div>

            <div className="img-section-title">Fecha</div>
            <input className="cot-nombre-inp" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{marginBottom:10}} />

            <div className="img-section-title">Tipo</div>
            <select className="cot-nombre-inp" value={tipo} onChange={e=>setTipo(e.target.value)} style={{marginBottom:10}}>
              <option value="fijo">Fijo (alquiler, sueldos...)</option>
              <option value="variable">Variable (compras puntuales, etc.)</option>
            </select>

            <div className="img-section-title">Categoría (opcional)</div>
            <input className="cot-nombre-inp" placeholder="ej: alquiler, sueldos, servicios..."
              value={categoria} onChange={e=>setCategoria(e.target.value)} style={{marginBottom:10}} />

            <div className="img-section-title">Descripción</div>
            <input className="cot-nombre-inp" placeholder="ej: Alquiler local julio 2026"
              value={descripcion} onChange={e=>setDescripcion(e.target.value)} style={{marginBottom:10}} />

            <div className="img-section-title">Monto</div>
            <input className="cot-nombre-inp" type="number" placeholder="0"
              value={monto} onChange={e=>setMonto(e.target.value)} style={{marginBottom:10}} />

            <div className="img-section-title">Periodicidad</div>
            <select className="cot-nombre-inp" value={periodicidad} onChange={e=>setPeriodicidad(e.target.value)} style={{marginBottom:14}}>
              <option value="mensual">Mensual (se repite todos los meses)</option>
              <option value="unica">Única vez</option>
            </select>

            <div className="img-section-title">
              Repartir entre socios (%) {totalReparto !== 100 && (
                <span style={{color:"#e55",fontWeight:400}}> — suma {totalReparto}%, debería sumar 100%</span>
              )}
            </div>
            {socios.length === 0 ? (
              <div className="cot-empty" style={{padding:12,marginBottom:10}}>No hay socios activos cargados en Supabase todavía.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
                {socios.map(s => (
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{flex:1,fontSize:13}}>{s.nombre}</span>
                    <input type="number" style={{width:70}}
                      value={reparto[s.id] ?? 0}
                      onChange={e=>setReparto(r=>({...r,[s.id]:e.target.value}))} />
                    <span style={{fontSize:12,color:"var(--tx2)"}}>%</span>
                  </div>
                ))}
              </div>
            )}

            <button className="img-auto-btn" onClick={guardar} disabled={gastosGuardando}>
              {gastosGuardando ? "Guardando…" : "Guardar gasto"}
            </button>
          </div>
        ) : (
          <>
            <button className="img-auto-btn" style={{marginBottom:14}} onClick={abrirForm}>
              + Nuevo gasto
            </button>

            {gastosLoading ? (
              <div className="cot-empty" style={{padding:12}}>Cargando…</div>
            ) : gastos.length === 0 ? (
              <div className="cot-empty">
                <div style={{fontSize:32,marginBottom:8}}>💸</div>
                <div>Todavía no hay gastos cargados</div>
              </div>
            ) : (
              <div className="img-prod-list">
                {gastos.map(g => (
                  <div key={g.id} className="img-prod-row" style={{cursor:"default"}}>
                    <div className="img-prod-thumb-empty">{g.tipo==="fijo"?"🏠":"🔧"}</div>
                    <div className="img-prod-info">
                      <div className="img-prod-name">{g.descripcion}</div>
                      <div className="img-prod-count">
                        {new Date(g.fecha).toLocaleDateString("es-AR")} · {g.categoria || g.tipo} · {g.periodicidad} · {ARS(g.monto||0)}
                      </div>
                    </div>
                    <button className="cot-x" title="Borrar gasto"
                      onClick={()=>onBorrar(g.id)}
                      style={{marginLeft:8,color:"#c0392b",borderColor:"#c0392b"}}>
                      🗑
                    </button>
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
