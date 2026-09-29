import { useState, useMemo } from "react";
import { ARS } from "../utils.js";

const RANGOS = [{v:7,l:"7 días"},{v:30,l:"30 días"},{v:90,l:"90 días"},{v:0,l:"Todo"},{v:"rango",l:"Fecha específica"}];

// Traduce estado_orden / estado_envio (tal como vienen de Mercado Libre) a un
// estado simple para filtrar: cancelado > entregado > en_curso. Las ventas
// locales (Mercado Libre no interviene) no tienen este dato.
const estadoDe = (v) => {
  if (v.estadoOrden === "cancelled" || v.estadoOrden === "invalid") return "cancelado";
  if (v.estadoEnvio === "delivered") return "entregado";
  if (v.estadoOrden || v.estadoEnvio) return "en_curso";
  return null;
};

const ESTADOS_FILTRO = [
  {v:"todos", l:"Todos"},
  {v:"en_curso", l:"En curso"},
  {v:"entregado", l:"Entregado"},
  {v:"cancelado", l:"Cancelado"},
];

const ESTADO_LABEL = { en_curso: "🚚 En curso", entregado: "✅ Entregado", cancelado: "❌ Cancelado" };

const ORDENES = [
  {v:"fecha", l:"Más recientes primero"},
  {v:"ganancia_desc", l:"Ganancia: mayor a menor"},
  {v:"ganancia_asc", l:"Ganancia: menor a mayor"},
  {v:"sin_costo", l:"Sin costo cargado primero"},
];

export default function VentasPanel({
  ventasLoading, ventasResumen, ventasLista, onClose, onBorrar,
  ventasDias, setVentasDias,
  ventasDesde, setVentasDesde, ventasHasta, setVentasHasta, onAplicarRango,
  editandoVentaId, setEditandoVentaId, editandoVentaGuardando, onGuardarEdicion,
}) {
  const [formEnvio, setFormEnvio] = useState("");
  const [formCosto, setFormCosto] = useState("");
  const [formAjuste, setFormAjuste] = useState("");
  const [formAjusteDesc, setFormAjusteDesc] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [orden, setOrden] = useState("fecha");

  const ventasListaFiltrada = useMemo(() => {
    let lista = ventasLista;
    if (filtroEstado !== "todos") {
      lista = lista.filter(v => estadoDe(v) === filtroEstado);
    }
    if (orden === "ganancia_desc" || orden === "ganancia_asc") {
      lista = [...lista].sort((a, b) => {
        // Las que no tienen ganancia calculada van al final siempre.
        if (a.ganancia == null && b.ganancia == null) return 0;
        if (a.ganancia == null) return 1;
        if (b.ganancia == null) return -1;
        return orden === "ganancia_desc" ? b.ganancia - a.ganancia : a.ganancia - b.ganancia;
      });
    } else if (orden === "sin_costo") {
      lista = [...lista].sort((a, b) => {
        const aSin = a.ganancia == null ? 0 : 1;
        const bSin = b.ganancia == null ? 0 : 1;
        return aSin - bSin;
      });
    }
    return lista;
  }, [ventasLista, filtroEstado, orden]);

  // Al abrir la edición precargamos el flete que tenemos configurado para la
  // categoría en vez de dejar 0. Si la venta ya tiene un flete cargado (o fue
  // editada a mano antes) se respeta ese valor.
  const empezarEdicion = (v) => {
    setEditandoVentaId(`${v.tabla}-${v.id}`);
    const envioPrecargado = (v.costoEnvio != null && Number(v.costoEnvio) !== 0)
      ? v.costoEnvio
      : (v.envioSugerido ?? 0);
    setFormEnvio(envioPrecargado);
    // Si ya fue editada a mano respetamos lo que quedó guardado. Si no, se
    // ofrece el costo del producto SIN flete (el flete va en su propio campo).
    setFormCosto(v.editadoManual ? (v.costoUnitario ?? 0) : (v.costoSinEnvio ?? v.costoUnitario ?? 0));
    setFormAjuste(v.ajusteMonto ?? 0);
    setFormAjusteDesc(v.ajusteDescripcion ?? "");
  };

  return (
    <div className="img-panel">
      <div className="img-head">
        <div>
          <div className="img-head-title">📊 Ventas y ganancia real</div>
          <div className="img-head-sub">Mercado Libre + ventas físicas</div>
        </div>
        <button className="cot-x" onClick={onClose}>✕</button>
      </div>

      <div className="img-body">
        <div style={{display:"flex",gap:6,marginBottom: ventasDias==="rango" ? 8 : 14, flexWrap:"wrap"}}>
          {RANGOS.map(o => (
            <button key={o.v} className="cot-btn-clear" style={{flex:1,
              ...(ventasDias===o.v ? {borderColor:"var(--ac)",color:"var(--ac)"} : {})}}
              onClick={()=>setVentasDias(o.v)}>
              {o.l}
            </button>
          ))}
        </div>

        {ventasDias==="rango" && (
          <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:14,flexWrap:"wrap"}}>
            <label style={{display:"flex",flexDirection:"column",fontSize:11,color:"var(--tx2)",gap:4}}>
              Desde
              <input type="date" value={ventasDesde} onChange={e=>setVentasDesde(e.target.value)}
                style={{padding:"6px 8px"}} />
            </label>
            <label style={{display:"flex",flexDirection:"column",fontSize:11,color:"var(--tx2)",gap:4}}>
              Hasta
              <input type="date" value={ventasHasta} onChange={e=>setVentasHasta(e.target.value)}
                style={{padding:"6px 8px"}} />
            </label>
            <button className="cot-btn-print" style={{flex:"none",padding:"8px 14px"}} onClick={onAplicarRango}>
              Aplicar
            </button>
            {!ventasDesde && !ventasHasta && (
              <span style={{fontSize:10,color:"var(--tx2)"}}>Sin fechas = todo el historial</span>
            )}
          </div>
        )}

        {ventasLoading ? (
          <div className="cot-empty" style={{padding:12}}>Cargando…</div>
        ) : !ventasResumen || ventasResumen.cantidad===0 ? (
          <div className="cot-empty">
            <div style={{fontSize:32,marginBottom:8}}>📊</div>
            <div>Todavía no hay ventas guardadas en este rango{ventasDias>0?` (últimos ${ventasDias} días)`:""}</div>
            {ventasDias>0 && <div style={{fontSize:11,marginTop:6}}>Probá con "Todo" para ver si hay ventas más viejas.</div>}
          </div>
        ) : (
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:6}}>
              <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:"var(--tx2)"}}>Total vendido</div>
                <div style={{fontSize:18,fontWeight:700}}>{ARS(ventasResumen.totalVentas)}</div>
              </div>
              <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:"var(--tx2)"}}>Recibí de verdad</div>
                <div style={{fontSize:18,fontWeight:700}}>{ARS(ventasResumen.totalRecibido)}</div>
                {ventasResumen.totalVentas>0 && (
                  <div style={{fontSize:10,color:"var(--tx2)",marginTop:2}}>
                    ML se llevó {ARS(ventasResumen.totalVentas - ventasResumen.totalRecibido)}
                    {" "}({Math.round((1 - ventasResumen.totalRecibido/ventasResumen.totalVentas)*100)}%)
                  </div>
                )}
              </div>
              <div style={{background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:"var(--tx2)"}}>Ganancia real</div>
                <div style={{fontSize:18,fontWeight:700,color:"var(--ac)"}}>{ARS(ventasResumen.totalGanancia)}</div>
              </div>
            </div>
            <div style={{fontSize:11,color:"var(--tx2)",marginBottom:14}}>
              {ventasResumen.cantidad} {ventasResumen.cantidad===1?"venta":"ventas"}
              {ventasResumen.sinGanancia>0 && ` · ${ventasResumen.sinGanancia} sin costo cargado (ganancia no calculada)`}
              {ventasResumen.sinRecibido>0 && ` · ${ventasResumen.sinRecibido} sin liquidación de ML todavía`}
            </div>

            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {ESTADOS_FILTRO.map(o => (
                  <button key={o.v} className="cot-btn-clear" style={{padding:"5px 10px",fontSize:11,
                    ...(filtroEstado===o.v ? {borderColor:"var(--ac)",color:"var(--ac)"} : {})}}
                    onClick={()=>setFiltroEstado(o.v)}>
                    {o.l}
                  </button>
                ))}
              </div>
              <select value={orden} onChange={e=>setOrden(e.target.value)}
                style={{marginLeft:"auto",fontSize:11,padding:"6px 8px"}}>
                {ORDENES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            {ventasListaFiltrada.length===0 && (
              <div className="cot-empty" style={{padding:12}}>No hay ventas con ese estado en este rango.</div>
            )}

            <div className="img-prod-list">
              {ventasListaFiltrada.map((v,i)=>{
                const claveEdicion = `${v.tabla}-${v.id}`;
                const editando = editandoVentaId === claveEdicion;
                return (
                <div key={v.id||i} className="img-prod-row" style={{cursor:"default",flexDirection:"column",alignItems:"stretch"}}>
                  <div style={{display:"flex",alignItems:"center",width:"100%"}}>
                    <div className="img-prod-thumb-empty">{v.canal==="Mercado Libre"?"🛒":"🏬"}</div>
                    <div className="img-prod-info">
                      <div className="img-prod-name">
                        {v.nombre || "(sin nombre)"}
                        {v.editadoManual && <span title="Costo editado a mano — no se pisa al sincronizar Mercado Libre" style={{marginLeft:6}}>🔒</span>}
                        {estadoDe(v) && <span style={{marginLeft:8,fontSize:11,fontWeight:400,color:"var(--tx2)"}}>{ESTADO_LABEL[estadoDe(v)]}</span>}
                      </div>
                      <div className="img-prod-count">
                        {new Date(v.fecha).toLocaleDateString("es-AR")} · {v.canal} · x{v.cantidad}
                        {v.comprador && <> · comprador: <b>{v.comprador}</b></>}
                        {" · "}vendí {ARS(v.monto||0)}
                        {v.recibido!=null
                          ? <> · <b>recibí {ARS(v.recibido)}</b></>
                          : <> · <span title="Mercado Libre todavía no liquidó esta venta">recibí —</span></>}
                        {v.ganancia!=null && <> · ganancia {ARS(v.ganancia)}</>}
                        {!!v.ajusteMonto && <> · ajuste {v.ajusteMonto>0?"+":""}{ARS(v.ajusteMonto)}{v.ajusteDescripcion && ` (${v.ajusteDescripcion})`}</>}
                      </div>
                    </div>
                    {v.id && !editando && (
                      <button className="cot-x" title="Editar costo de envío y de proveedor"
                        onClick={()=>empezarEdicion(v)}
                        style={{marginLeft:8}}>
                        ✏️
                      </button>
                    )}
                    {v.id && (
                      <button className="cot-x" title="Borrar movimiento"
                        onClick={()=>onBorrar(v)}
                        style={{marginLeft:8,color:"#c0392b",borderColor:"#c0392b"}}>
                        🗑
                      </button>
                    )}
                  </div>

                  {editando && (
                    <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap",marginTop:8,padding:10,background:"var(--sf2)",border:"1px solid var(--bd)",borderRadius:8}}>
                      <label style={{display:"flex",flexDirection:"column",fontSize:11,color:"var(--tx2)",gap:4}}>
                        Costo de envío
                        <input type="number" value={formEnvio} onChange={e=>setFormEnvio(e.target.value)}
                          style={{width:110}} />
                        <span style={{fontSize:10,lineHeight:1.4}}>
                          {v.envioSugerido!=null && (
                            <>configurado para {v.categoria || "esta familia"}: {ARS(v.envioSugerido)}{" "}
                              {Number(formEnvio) !== Number(v.envioSugerido) && (
                                <button type="button" className="cot-btn-clear"
                                  style={{padding:"0 5px",fontSize:10,lineHeight:1.6}}
                                  onClick={()=>setFormEnvio(v.envioSugerido)}>volver</button>
                              )}
                            </>
                          )}
                        </span>
                      </label>
                      <label style={{display:"flex",flexDirection:"column",fontSize:11,color:"var(--tx2)",gap:4}}>
                        Costo de proveedor (unitario, sin flete)
                        <input type="number" value={formCosto} onChange={e=>setFormCosto(e.target.value)}
                          title="Solo el producto. El flete va en el campo de al lado, no acá."
                          style={{width:110}} />
                        <span style={{fontSize:10,lineHeight:1.4}}>
                          {v.costoSinEnvio!=null && <>lista: {ARS(v.costoSinEnvio)}</>}
                        </span>
                      </label>
                      <label style={{display:"flex",flexDirection:"column",fontSize:11,color:"var(--tx2)",gap:4}}>
                        Ajuste (+/-)
                        <input type="number" value={formAjuste} onChange={e=>setFormAjuste(e.target.value)}
                          title="Un monto extra para sumar o restar de la ganancia, ej. -5000 para una devolución parcial"
                          style={{width:110}} />
                      </label>
                      <label style={{display:"flex",flexDirection:"column",fontSize:11,color:"var(--tx2)",gap:4,flex:"1 1 180px"}}>
                        Descripción del ajuste
                        <input type="text" value={formAjusteDesc} onChange={e=>setFormAjusteDesc(e.target.value)}
                          placeholder="ej. devolución parcial, gasto extra…" />
                      </label>
                      <button className="cot-btn-print" style={{flex:"none",padding:"8px 14px"}} disabled={editandoVentaGuardando}
                        onClick={()=>onGuardarEdicion(v, formEnvio, formCosto, formAjuste, formAjusteDesc)}>
                        {editandoVentaGuardando ? "Guardando…" : "Guardar"}
                      </button>
                      <button className="cot-btn-clear" onClick={()=>setEditandoVentaId(null)}>Cancelar</button>
                    </div>
                  )}
                </div>
              );})}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
