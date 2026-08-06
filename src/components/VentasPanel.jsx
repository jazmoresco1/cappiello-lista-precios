import { useState } from "react";
import { ARS } from "../utils.js";

const RANGOS = [{v:7,l:"7 días"},{v:30,l:"30 días"},{v:90,l:"90 días"},{v:0,l:"Todo"}];

export default function VentasPanel({
  ventasLoading, ventasResumen, ventasLista, onClose, onBorrar,
  ventasDias, setVentasDias,
  editandoVentaId, setEditandoVentaId, editandoVentaGuardando, onGuardarEdicion,
}) {
  const [formEnvio, setFormEnvio] = useState("");
  const [formCosto, setFormCosto] = useState("");
  const [formAjuste, setFormAjuste] = useState("");
  const [formAjusteDesc, setFormAjusteDesc] = useState("");

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
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {RANGOS.map(o => (
            <button key={o.v} className="cot-btn-clear" style={{flex:1,
              ...(ventasDias===o.v ? {borderColor:"var(--ac)",color:"var(--ac)"} : {})}}
              onClick={()=>setVentasDias(o.v)}>
              {o.l}
            </button>
          ))}
        </div>

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

            <div className="img-prod-list">
              {ventasLista.map((v,i)=>{
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
                      </div>
                      <div className="img-prod-count">
                        {new Date(v.fecha).toLocaleDateString("es-AR")} · {v.canal} · x{v.cantidad}
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
                          {v.envioSugerido!=null && <>configurado: {ARS(v.envioSugerido)}<br/></>}
                          {v.fleteReal!=null && (
                            <>ML cobró: <b>{ARS(v.fleteReal)}</b>{" "}
                              <button type="button" className="cot-btn-clear"
                                style={{padding:"0 5px",fontSize:10,lineHeight:1.6}}
                                onClick={()=>setFormEnvio(v.fleteReal)}>usar</button>
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
